// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { blobToDataUrl, buildImpositionSvg, buildLayeredExportFiles, buildSheetSvgs, instanceTransform, placedItems } from './exportSvg';
import { DEFAULT_IMPOSITION_STATE, type ImpositionInstance, type ImpositionLayer, type ImpositionState } from './types';

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
  id: 'i1', layerId: 'L1', sheetId: 'sheet-1', xMm: 100, yMm: 50, rotationDeg: 0, ...overrides,
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
  it('skips items with no sheet and instances without a layer', () => {
    const state = {
      ...DEFAULT_IMPOSITION_STATE,
      layers: [layer()],
      instances: [inst({ id: 'a' }), inst({ id: 'b', sheetId: null }), inst({ id: 'c', layerId: 'missing' })],
    };
    expect(placedItems(state).map(p => p.instance.id)).toEqual(['a']);
  });

  it('filters to one sheet when asked', () => {
    const state = {
      ...DEFAULT_IMPOSITION_STATE,
      layers: [layer()],
      sheets: [
        { id: 'sheet-1', sizeName: 'A4', widthMm: 297, heightMm: 210 },
        { id: 'sheet-2', sizeName: 'A4', widthMm: 297, heightMm: 210 },
      ],
      instances: [inst({ id: 'a' }), inst({ id: 'b', sheetId: 'sheet-2' })],
    };
    expect(placedItems(state, 'sheet-2').map(p => p.instance.id)).toEqual(['b']);
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

describe('buildSheetSvgs', () => {
  const twoSheetState = (): ImpositionState => ({
    ...DEFAULT_IMPOSITION_STATE,
    layers: [layer()],
    sheets: [
      { id: 's1', sizeName: 'A4', widthMm: 297, heightMm: 210 },
      { id: 's2', sizeName: 'A3', widthMm: 420, heightMm: 297 },
    ],
    activeSheetId: 's1',
    instances: [
      inst({ id: 'i1', sheetId: 's1', xMm: 0, yMm: 0 }),
      inst({ id: 'i2', sheetId: 's2', xMm: 5, yMm: 5 }),
      inst({ id: 'i3', sheetId: null, xMm: 0, yMm: 0 }),
    ],
  });

  it('每張版面產生一個檔，檔名依序編號', () => {
    const files = buildSheetSvgs({
      state: twoSheetState(),
      kinds: ['cut'],
      colors,
      imageDataUrls: new Map(),
      baseName: 'imposition-cut',
    });
    expect(files.map(f => f.filename)).toEqual(['imposition-cut-1.svg', 'imposition-cut-2.svg']);
  });

  it('每個檔使用自己版面的尺寸', () => {
    const files = buildSheetSvgs({
      state: twoSheetState(),
      kinds: ['cut'],
      colors,
      imageDataUrls: new Map(),
      baseName: 'x',
    });
    expect(files[0].svg).toContain('width="297mm"');
    expect(files[1].svg).toContain('width="420mm"');
  });

  it('沒有項目的版面不產生檔案', () => {
    const state = twoSheetState();
    const only = { ...state, instances: state.instances.filter(i => i.sheetId === 's1') };
    const files = buildSheetSvgs({
      state: only,
      kinds: ['cut'],
      colors,
      imageDataUrls: new Map(),
      baseName: 'x',
    });
    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe('x-1.svg');
  });
});

describe('buildLayeredExportFiles', () => {
  const twoSheetState = (): ImpositionState => ({
    ...DEFAULT_IMPOSITION_STATE,
    layers: [layer()],
    sheets: [
      { id: 's1', sizeName: 'A4', widthMm: 297, heightMm: 210 },
      { id: 's2', sizeName: 'A3', widthMm: 420, heightMm: 297 },
    ],
    activeSheetId: 's1',
    instances: [
      inst({ id: 'i1', sheetId: 's1' }),
      inst({ id: 'i2', sheetId: 's2' }),
    ],
  });

  it('三層都有內容時，每層每張版面各出一檔，檔名依 kind 與版面序號組合', () => {
    const files = buildLayeredExportFiles({
      state: twoSheetState(),
      colors,
      imageDataUrls: new Map([['L1', 'data:image/png;base64,AAA']]),
      baseName: 'imposition',
    });
    expect(files.map(f => f.filename)).toEqual([
      'imposition-artwork-1.svg',
      'imposition-artwork-2.svg',
      'imposition-underprint-1.svg',
      'imposition-underprint-2.svg',
      'imposition-cut-1.svg',
      'imposition-cut-2.svg',
    ]);
  });

  it('沒有白墨時跳過整個 underprint 層', () => {
    const state = twoSheetState();
    const noUnderprint = { ...state, layers: [layer({ underprint: null })] };
    const files = buildLayeredExportFiles({ state: noUnderprint, colors, imageDataUrls: new Map(), baseName: 'imposition' });
    expect(files.map(f => f.filename)).toEqual([
      'imposition-artwork-1.svg',
      'imposition-artwork-2.svg',
      'imposition-cut-1.svg',
      'imposition-cut-2.svg',
    ]);
  });

  it('刀模 paths 為空時跳過整個 cut 層', () => {
    const state = twoSheetState();
    const noCut = { ...state, layers: [layer({ cut: { kind: 'paths', paths: [] } })] };
    const files = buildLayeredExportFiles({ state: noCut, colors, imageDataUrls: new Map(), baseName: 'imposition' });
    expect(files.some(f => f.filename.includes('cut'))).toBe(false);
  });

  /** 兩張版面，各放一個圖層：s1 放 L1、s2 放 L2 */
  const perSheet = (l1: Partial<ImpositionLayer>, l2: Partial<ImpositionLayer>): ImpositionState => ({
    ...DEFAULT_IMPOSITION_STATE,
    layers: [layer({ id: 'L1', ...l1 }), layer({ id: 'L2', ...l2 })],
    sheets: [
      { id: 's1', sizeName: 'A', widthMm: 100, heightMm: 100 },
      { id: 's2', sizeName: 'A', widthMm: 100, heightMm: 100 },
    ],
    instances: [inst({ id: 'i1', layerId: 'L1', sheetId: 's1' }), inst({ id: 'i2', layerId: 'L2', sheetId: 's2' })],
  });

  it('某一層在某張版面上沒有內容時，不為那個組合產生空檔案', () => {
    // 白墨只有 L1 有，而 L1 只在 s1 上；s2 的白墨檔會是空的 <g id="underprint"></g>
    const files = buildLayeredExportFiles({
      state: perSheet({}, { underprint: null }),
      colors,
      imageDataUrls: new Map(),
      baseName: 'x',
    });
    expect(files.map(f => f.filename)).toEqual([
      'x-artwork-1.svg',
      'x-artwork-2.svg',
      'x-underprint-1.svg',
      'x-cut-1.svg',
      'x-cut-2.svg',
    ]);
  });

  it('跳過第 1 張版面時，號碼不會往前遞補', () => {
    // 白墨只在第 2 張版面上有內容。號碼若跟著過濾後的順序走會變成 x-underprint-1.svg，
    // 使用者疊圖時就會把第 2 張版的白墨疊到第 1 張版的原圖上——比多一個空檔案嚴重得多。
    const files = buildLayeredExportFiles({
      state: perSheet({ underprint: null }, {}),
      colors,
      imageDataUrls: new Map(),
      baseName: 'x',
    });
    expect(files.filter(f => f.filename.includes('underprint')).map(f => f.filename)).toEqual(['x-underprint-2.svg']);
  });

  it('沒有任何圖層時回傳空陣列', () => {
    const files = buildLayeredExportFiles({ state: DEFAULT_IMPOSITION_STATE, colors, imageDataUrls: new Map(), baseName: 'imposition' });
    expect(files).toEqual([]);
  });

  it('每個檔只含自己該層的內容', () => {
    const files = buildLayeredExportFiles({
      state: twoSheetState(),
      colors,
      imageDataUrls: new Map([['L1', 'data:image/png;base64,AAA']]),
      baseName: 'imposition',
    });
    const artworkFile = files.find(f => f.filename === 'imposition-artwork-1.svg');
    expect(artworkFile?.svg).toContain('id="artwork"');
    expect(artworkFile?.svg).not.toContain('id="underprint"');
    expect(artworkFile?.svg).not.toContain('id="cut"');
  });
});
