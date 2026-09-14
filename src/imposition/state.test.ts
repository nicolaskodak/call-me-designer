import { describe, expect, it } from 'vitest';
import {
  addLayers,
  autoLayout,
  deleteInstance,
  layerBoxMm,
  LAYOUT_STALE_MESSAGE,
  moveInstance,
  selectInstance,
  selectSheet,
  setAllowRotate,
  setLayerTotalCount,
  sheetUsage,
  upsertSourceLayer,
} from './state';
import { DEFAULT_IMPOSITION_STATE, type ImpositionLayer, type ImpositionState } from './types';
import { DEFAULT_SHEET_SIZES } from './sheetSizes';

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
      { id: 'i1', layerId: 'L1', sheetId: DEFAULT_IMPOSITION_STATE.activeSheetId, xMm: 0, yMm: 0, rotationDeg: 0 },
      { id: 'i2', layerId: 'L1', sheetId: DEFAULT_IMPOSITION_STATE.activeSheetId, xMm: 0, yMm: 0, rotationDeg: 0 },
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

const SIZES = DEFAULT_SHEET_SIZES;

describe('autoLayout', () => {
  it('把項目排進版面並記錄相對座標', () => {
    const next = idGen();
    const s = setLayerTotalCount(withLayer(layer(), next), 'L1', 2, next);
    const laid = autoLayout(s, SIZES, next);
    expect(laid.sheets).toHaveLength(1);
    expect(laid.instances.every(i => i.sheetId === laid.sheets[0].id)).toBe(true);
    expect(laid.instances.map(i => [r6(i.xMm), r6(i.yMm)])).toEqual([[0, 0], [103, 0]]);
    expect(laid.notPlacedInstanceIds).toEqual([]);
    expect(laid.lastLayoutMessage).toContain('排圖完成');
  });

  it('排不下時自動開新版面', () => {
    const next = idGen();
    // 每個 260x190mm，A4 一張只放得下一個
    const big = layer({ layoutBoxPx: { x: 0, y: 0, width: 260, height: 190 } });
    const s = setLayerTotalCount(withLayer(big, next), 'L1', 3, next);
    const laid = autoLayout(s, [{ name: 'A4', widthMm: 297, heightMm: 210 }], next);
    expect(laid.sheets).toHaveLength(3);
    expect(new Set(laid.instances.map(i => i.sheetId)).size).toBe(3);
  });

  it('比所有尺寸都大的項目標記為放不下且不屬於任何版面', () => {
    const next = idGen();
    const huge = layer({ layoutBoxPx: { x: 0, y: 0, width: 2000, height: 2000 } });
    const laid = autoLayout(withLayer(huge, next), SIZES, next);
    expect(laid.notPlacedInstanceIds).toHaveLength(1);
    expect(laid.instances[0].sheetId).toBeNull();
  });

  it('沒有勾選任何尺寸時不排圖，只提示', () => {
    const s = withLayer();
    const laid = autoLayout(s, [], idGen());
    expect(laid.instances).toEqual(s.instances);
    expect(laid.lastLayoutMessage).toBe('請先勾選至少一種版面尺寸。');
  });

  it('不允許旋轉時清掉既有的旋轉', () => {
    const s = withLayer();
    const rotated = { ...s, instances: s.instances.map(i => ({ ...i, rotationDeg: 90 as const })) };
    expect(autoLayout(rotated, SIZES, idGen()).instances[0].rotationDeg).toBe(0);
  });

  it('排圖後把第一張設為當前版面', () => {
    const next = idGen();
    const laid = autoLayout(withLayer(layer(), next), SIZES, next);
    expect(laid.activeSheetId).toBe(laid.sheets[0].id);
  });
});

describe('selectSheet', () => {
  it('切換當前版面並取消選取', () => {
    const next = idGen();
    const big = layer({ layoutBoxPx: { x: 0, y: 0, width: 260, height: 190 } });
    const s = setLayerTotalCount(withLayer(big, next), 'L1', 2, next);
    const laid = autoLayout(s, [{ name: 'A4', widthMm: 297, heightMm: 210 }], next);
    const selected = selectInstance(laid, laid.instances[0].id);
    const switched = selectSheet(selected, laid.sheets[1].id);
    expect(switched.activeSheetId).toBe(laid.sheets[1].id);
    expect(switched.selectedInstanceId).toBeNull();
  });

  it('未知的版面 id 不造成任何改變', () => {
    const s = withLayer();
    expect(selectSheet(s, 'nope')).toBe(s);
  });
});

describe('sheetUsage', () => {
  it('回傳 0 到 1 之間的使用率', () => {
    const next = idGen();
    const laid = autoLayout(withLayer(layer(), next), SIZES, next);
    const usage = sheetUsage(laid, laid.sheets[0].id);
    expect(usage).toBeGreaterThan(0);
    expect(usage).toBeLessThanOrEqual(1);
  });

  it('未知的版面 id 回傳 0', () => {
    expect(sheetUsage(withLayer(), 'nope')).toBe(0);
  });
});

describe('刪除項目後回收空版面', () => {
  it('版面上最後一個項目被刪除時，該版面一併移除', () => {
    const next = idGen();
    const big = layer({ layoutBoxPx: { x: 0, y: 0, width: 260, height: 190 } });
    const s = setLayerTotalCount(withLayer(big, next), 'L1', 2, next);
    const laid = autoLayout(s, [{ name: 'A4', widthMm: 297, heightMm: 210 }], next);
    expect(laid.sheets).toHaveLength(2);

    const afterDelete = deleteInstance(laid, laid.instances[0].id);
    expect(afterDelete.sheets).toHaveLength(1);
    expect(afterDelete.sheets.some(sheet => sheet.id === afterDelete.activeSheetId)).toBe(true);
  });

  it('刪光所有項目時保留一張版面，畫布不會空白', () => {
    const next = idGen();
    const laid = autoLayout(withLayer(layer(), next), SIZES, next);
    const empty = setLayerTotalCount(laid, 'L1', 0, next);
    expect(empty.sheets).toHaveLength(1);
    expect(empty.activeSheetId).toBe(empty.sheets[0].id);
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

  // 狀態層不變式：setAllowRotate 會清空 notPlacedInstanceIds（它只代表「上次排圖的結果過期」），
  // 但不會、也不該改動 sheetId——sheetId 才是「這個項目屬於哪個版面」的唯一事實來源。
  // 注意：這個測試只守住 state.ts 這一層的不變式，不會經過 ImpositionPanel.tsx 的程式碼路徑，
  // 不能拿它來保證「面板算出的可匯出數量」正確；那個判準已改成直接呼叫 exportSvg.ts 的
  // placedItems(state).length（見 ImpositionPanel.tsx），與此處驗證的 sheetId 事實共用同一份實作，
  // 不再各自維護一份會分家的邏輯。
  it('切換旋轉後，sheetId 不受 notPlacedInstanceIds 被清空影響', () => {
    const next = idGen();
    const huge = layer({ layoutBoxPx: { x: 0, y: 0, width: 2000, height: 2000 } });
    const laid = autoLayout(withLayer(huge, next), SIZES, next);
    expect(laid.notPlacedInstanceIds).toHaveLength(1);
    expect(laid.instances[0].sheetId).toBeNull();

    const toggled = setAllowRotate(laid, true);
    expect(toggled.notPlacedInstanceIds).toEqual([]);
    expect(toggled.instances[0].sheetId).toBeNull();
  });
});

describe('需要重新排圖的提示', () => {
  it('切換旋轉之後提示要重新排圖，位置維持不動', () => {
    const next = idGen();
    const laid = autoLayout(withLayer(layer({ totalCount: 2 }), next), SIZES, next);
    const toggled = setAllowRotate(laid, true);
    expect(toggled.lastLayoutMessage).toBe(LAYOUT_STALE_MESSAGE);
    expect(toggled.instances).toEqual(laid.instances);
  });

  it('加入圖層之後提示要重新排圖', () => {
    const next = idGen();
    const laid = autoLayout(withLayer(layer(), next), SIZES, next);
    const added = addLayers(laid, [layer({ id: 'L2' })], next);
    expect(added.lastLayoutMessage).toBe(LAYOUT_STALE_MESSAGE);
  });

  it('改變份數之後提示要重新排圖', () => {
    const next = idGen();
    const laid = autoLayout(withLayer(layer(), next), SIZES, next);
    expect(setLayerTotalCount(laid, 'L1', 3, next).lastLayoutMessage).toBe(LAYOUT_STALE_MESSAGE);
  });

  it('重新排圖之後換回完成訊息', () => {
    const next = idGen();
    const stale = setAllowRotate(autoLayout(withLayer(layer(), next), SIZES, next), true);
    expect(autoLayout(stale, SIZES, next).lastLayoutMessage).toContain('排圖完成');
  });
});
