import { describe, expect, it } from 'vitest';
import {
  addLayers,
  autoLayout,
  deleteInstance,
  layerBoxMm,
  moveInstance,
  selectInstance,
  setAllowRotate,
  setLayerTotalCount,
  upsertSourceLayer,
} from './state';
import { DEFAULT_IMPOSITION_STATE, type ImpositionLayer, type ImpositionState } from './types';

const idGen = () => {
  let n = 0;
  return () => `i${++n}`;
};

// dpi 25.4：1 px = 1 mm
const layer = (overrides: Partial<ImpositionLayer> = {}): ImpositionLayer => ({
  id: 'L1',
  sourceId: null,
  name: 'cat',
  imageBlob: new Blob(),
  imageUrl: 'blob:cat',
  widthPx: 100,
  heightPx: 50,
  dpi: 25.4,
  cut: { kind: 'paths', paths: [{ d: 'M0 0Z' }] },
  underprint: null,
  layoutBoxPx: { x: 0, y: 0, width: 100, height: 50 },
  totalCount: 1,
  ...overrides,
});

const withLayer = (l: ImpositionLayer = layer(), idFactory: () => string = idGen()): ImpositionState => addLayers(DEFAULT_IMPOSITION_STATE, [l], idFactory);

// px → mm 換算有浮點誤差，比對前先四捨五入到 6 位小數
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;

describe('layerBoxMm', () => {
  it('converts the layout box to mm and swaps on rotation', () => {
    const box = (b: { w: number; h: number }) => ({ w: r6(b.w), h: r6(b.h) });
    expect(box(layerBoxMm(layer(), 0))).toEqual({ w: 100, h: 50 });
    expect(box(layerBoxMm(layer(), 90))).toEqual({ w: 50, h: 100 });
    expect(box(layerBoxMm(layer({ dpi: 254 }), 0))).toEqual({ w: 10, h: 5 });
  });
});

describe('addLayers', () => {
  it('creates one instance per total count at the origin', () => {
    const s = addLayers(DEFAULT_IMPOSITION_STATE, [layer({ totalCount: 2 })], idGen());
    expect(s.instances).toEqual([
      { id: 'i1', layerId: 'L1', xMm: 0, yMm: 0, rotationDeg: 0 },
      { id: 'i2', layerId: 'L1', xMm: 0, yMm: 0, rotationDeg: 0 },
    ]);
    expect(DEFAULT_IMPOSITION_STATE.instances).toEqual([]);
  });
});

describe('setLayerTotalCount', () => {
  it('grows, shrinks and deletes', () => {
    const next = idGen();
    const grown = setLayerTotalCount(withLayer(layer(), next), 'L1', 3, next);
    expect(grown.instances).toHaveLength(3);
    expect(grown.layers[0].totalCount).toBe(3);

    const shrunk = setLayerTotalCount(grown, 'L1', 1, next);
    expect(shrunk.instances.map(i => i.id)).toEqual([grown.instances[0].id]);

    const selected = selectInstance(shrunk, shrunk.instances[0].id);
    const removed = setLayerTotalCount(selected, 'L1', 0, next);
    expect(removed.layers).toEqual([]);
    expect(removed.instances).toEqual([]);
    expect(removed.selectedInstanceId).toBeNull();
  });

  it('treats invalid numbers as zero', () => {
    expect(setLayerTotalCount(withLayer(), 'L1', Number.NaN, idGen()).layers).toEqual([]);
  });
});

describe('deleteInstance', () => {
  it('decrements the total and removes the layer with its last instance', () => {
    const next = idGen();
    const s = setLayerTotalCount(withLayer(layer(), next), 'L1', 2, next);
    const once = deleteInstance(s, s.instances[0].id);
    expect(once.layers[0].totalCount).toBe(1);
    expect(once.instances).toHaveLength(1);
    const twice = deleteInstance(once, once.instances[0].id);
    expect(twice.layers).toEqual([]);
  });

  it('ignores unknown ids', () => {
    const s = withLayer();
    expect(deleteInstance(s, 'nope').instances).toEqual(s.instances);
  });
});

describe('upsertSourceLayer', () => {
  it('adds a new source layer with one instance', () => {
    const s = upsertSourceLayer(DEFAULT_IMPOSITION_STATE, layer({ sourceId: 'src', totalCount: 5 }), idGen());
    expect(s.layers[0].totalCount).toBe(1);
    expect(s.instances).toHaveLength(1);
  });

  it('replaces the same source in place, keeping id, total and positions', () => {
    const next = idGen();
    const first = setLayerTotalCount(upsertSourceLayer(DEFAULT_IMPOSITION_STATE, layer({ sourceId: 'src' }), next), 'L1', 3, next);
    const moved = { ...moveInstance(first, first.instances[0].id, 10, 20), notPlacedInstanceIds: [first.instances[2].id] };

    const replaced = upsertSourceLayer(moved, layer({ id: 'L2', sourceId: 'src', widthPx: 999 }), next);
    expect(replaced.layers).toHaveLength(1);
    expect(replaced.layers[0]).toMatchObject({ id: 'L1', totalCount: 3, widthPx: 999 });
    expect(replaced.instances[0]).toMatchObject({ xMm: 10, yMm: 20 });
    expect(replaced.notPlacedInstanceIds).toEqual([]);
  });
});

describe('autoLayout', () => {
  it('packs in mm with the minimum gap', () => {
    const next = idGen();
    const s = setLayerTotalCount(withLayer(layer(), next), 'L1', 2, next);
    const laid = autoLayout(s);
    expect(laid.instances.map(i => [r6(i.xMm), r6(i.yMm)])).toEqual([[0, 0], [103, 0]]);
    expect(laid.notPlacedInstanceIds).toEqual([]);
    expect(laid.lastLayoutMessage).toBe('排圖完成：塞得進去 2 個，塞不進去 0 個。');
  });

  it('reports items that do not fit', () => {
    const s = { ...withLayer(), boundaryWidthMm: 50, boundaryHeightMm: 50 };
    expect(autoLayout(s).notPlacedInstanceIds).toEqual(['i1']);
  });

  it('resets rotation when rotation is not allowed', () => {
    const s = withLayer();
    const rotated = { ...s, instances: s.instances.map(i => ({ ...i, rotationDeg: 90 as const })) };
    expect(autoLayout(rotated).instances[0].rotationDeg).toBe(0);
  });
});

describe('setAllowRotate', () => {
  it('clears rotations and layout results when disabled', () => {
    const s = withLayer();
    const rotated = { ...s, allowRotate90: true, instances: s.instances.map(i => ({ ...i, rotationDeg: 90 as const })), notPlacedInstanceIds: ['x'] };
    const next = setAllowRotate(rotated, false);
    expect(next.instances[0].rotationDeg).toBe(0);
    expect(next.notPlacedInstanceIds).toEqual([]);
    expect(setAllowRotate(rotated, true).instances[0].rotationDeg).toBe(90);
  });
});
