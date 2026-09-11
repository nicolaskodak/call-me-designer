// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { blobToDataUrl, buildImpositionSvg, instanceTransform, placedItems } from './exportSvg';
import { DEFAULT_IMPOSITION_STATE, type ImpositionInstance, type ImpositionLayer } from './types';

const layer = (overrides: Partial<ImpositionLayer> = {}): ImpositionLayer => ({
  id: 'L1',
  sourceId: null,
  name: 'cat',
  imageBlob: new Blob(),
  imageUrl: 'blob:cat',
  widthPx: 100,
  heightPx: 50,
  dpi: 25.4,
  cut: { kind: 'paths', paths: [{ d: 'M0 0L1 1Z' }] },
  underprint: [{ d: 'M2 2Z', fillRule: 'evenodd' }],
  layoutBoxPx: { x: 5, y: 6, width: 10, height: 20 },
  totalCount: 1,
  ...overrides,
});

const inst = (overrides: Partial<ImpositionInstance> = {}): ImpositionInstance => ({
  id: 'i1', layerId: 'L1', xMm: 100, yMm: 50, rotationDeg: 0, ...overrides,
});

const colors = { cut: '#FF0000', underprint: '#FFFFFF' };

describe('instanceTransform', () => {
  it('translates the layout box to the instance position', () => {
    expect(instanceTransform(layer(), inst())).toBe('translate(100 50) scale(1) translate(-5 -6)');
  });

  it('rotates 90 degrees like the canvas CSS transform', () => {
    expect(instanceTransform(layer(), inst({ rotationDeg: 90 }))).toBe('translate(100 50) scale(1) translate(26 -5) rotate(90)');
  });

  it('scales by 25.4 / dpi', () => {
    expect(instanceTransform(layer({ dpi: 254 }), inst())).toContain('scale(0.1)');
  });
});

describe('placedItems', () => {
  it('skips items that did not fit and instances without a layer', () => {
    const state = {
      ...DEFAULT_IMPOSITION_STATE,
      layers: [layer()],
      instances: [inst({ id: 'a' }), inst({ id: 'b' }), inst({ id: 'c', layerId: 'missing' })],
      notPlacedInstanceIds: ['b'],
    };
    expect(placedItems(state).map(p => p.instance.id)).toEqual(['a']);
  });
});

describe('buildImpositionSvg', () => {
  const items = [
    { layer: layer(), instance: inst() },
    { layer: layer({ id: 'L2', underprint: null }), instance: inst({ id: 'i2', layerId: 'L2' }) },
  ];

  it('writes three inkscape layers in order with mm size', () => {
    const svg = buildImpositionSvg({
      widthMm: 297,
      heightMm: 210,
      items,
      kinds: ['artwork', 'underprint', 'cut'],
      colors,
      imageDataUrls: new Map([['L1', 'data:image/png;base64,AAA'], ['L2', 'data:image/png;base64,BBB']]),
    });
    expect(svg).toContain('width="297mm" height="210mm" viewBox="0 0 297 210"');
    expect(svg).toContain('xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"');
    const order = ['id="artwork"', 'id="underprint"', 'id="cut"'].map(s => svg.indexOf(s));
    expect(order.every(i => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(svg).toContain('inkscape:groupmode="layer" inkscape:label="cut"');
    expect(svg).toContain('<image href="data:image/png;base64,AAA" x="0" y="0" width="100" height="50" preserveAspectRatio="none"/>');
    expect(svg).toContain('<path d="M2 2Z" fill-rule="evenodd"/>');
    // L2 沒有白墨
    expect(svg.match(/fill-rule="evenodd"/g)).toHaveLength(1);
    // 刀模線寬在圖層座標內換算：0.25 mm × 25.4 dpi / 25.4 = 0.25
    expect(svg).toContain('stroke-width="0.25"');
  });

  it('only includes the requested kinds', () => {
    const svg = buildImpositionSvg({ widthMm: 10, heightMm: 10, items, kinds: ['cut'], colors, imageDataUrls: new Map() });
    expect(svg).toContain('id="cut"');
    expect(svg).not.toContain('id="artwork"');
    expect(svg).not.toContain('id="underprint"');
  });

  it('nests uploaded SVG cut lines', () => {
    const uploaded = [{ layer: layer({ cut: { kind: 'svg', svg: { viewBox: '0 0 10 10', inner: '<path d="M0 0"/>' } } }), instance: inst() }];
    const svg = buildImpositionSvg({ widthMm: 10, heightMm: 10, items: uploaded, kinds: ['cut'], colors, imageDataUrls: new Map() });
    expect(svg).toContain('<svg x="0" y="0" width="100" height="50" viewBox="0 0 10 10"');
  });
});

describe('blobToDataUrl', () => {
  it('encodes a blob as a data URI', async () => {
    await expect(blobToDataUrl(new Blob(['hi'], { type: 'text/plain' }))).resolves.toBe('data:text/plain;base64,aGk=');
  });
});
