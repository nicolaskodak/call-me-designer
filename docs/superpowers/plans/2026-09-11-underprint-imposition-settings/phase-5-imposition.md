# 第 5 階段：Imposition 串接與分層匯出

先讀 index 的 Global Constraints。Task 5.1–5.3 是可測試的純邏輯，Task 5.4 改寫 UI 並串接。

---

### Task 5.1：SVG 過濾與解析

**Files:**
- Create: `src/utils/sanitizeSvg.ts`
- Test: `src/utils/sanitizeSvg.test.ts`

**Interfaces:**
- Consumes：`escapeAttr` from `src/export/svg.ts`
- Produces：
  ```ts
  export function sanitizeSvg(text: string): string
  export interface ParsedSvg { viewBox: string; inner: string }
  export function parseUploadedSvg(text: string, fallbackWidth: number, fallbackHeight: number): ParsedSvg // 先過濾；不是 SVG 時 throw
  export function nestedSvgMarkup(parsed: ParsedSvg, widthPx: number, heightPx: number): string
  ```
  上傳的 SVG 只以 `ParsedSvg` 的形式保存與顯示（畫面與匯出都用 `nestedSvgMarkup`），不再保存原始字串。

- [ ] **Step 1：安裝 DOMPurify**

```bash
npm i -E dompurify@3.4.15
```

- [ ] **Step 2：寫失敗的測試**

`src/utils/sanitizeSvg.test.ts`：

```ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { nestedSvgMarkup, parseUploadedSvg, sanitizeSvg } from './sanitizeSvg';

const NS = 'xmlns="http://www.w3.org/2000/svg"';

describe('sanitizeSvg', () => {
  it('removes scripts, event handlers and javascript links but keeps paths', () => {
    const dirty = `<svg ${NS} onload="alert(1)"><script>alert(1)</script><a href="javascript:alert(1)"><path d="M0 0L1 1"/></a></svg>`;
    const clean = sanitizeSvg(dirty);
    expect(clean).not.toMatch(/script/i);
    expect(clean).not.toMatch(/onload/i);
    expect(clean).not.toMatch(/javascript:/i);
    expect(clean).toContain('<path');
  });
});

describe('parseUploadedSvg', () => {
  it('keeps the viewBox and inner markup', () => {
    const parsed = parseUploadedSvg(`<svg ${NS} viewBox="0 0 10 20" width="10mm"><path d="M0 0L5 5"/></svg>`, 1, 1);
    expect(parsed.viewBox).toBe('0 0 10 20');
    expect(parsed.inner).toContain('<path');
    expect(parsed.inner).toContain('M0 0L5 5');
  });

  it('derives the viewBox from width and height', () => {
    expect(parseUploadedSvg(`<svg ${NS} width="30" height="40"><g/></svg>`, 1, 1).viewBox).toBe('0 0 30 40');
  });

  it('falls back to the image size', () => {
    expect(parseUploadedSvg(`<svg ${NS}><g/></svg>`, 300, 200).viewBox).toBe('0 0 300 200');
  });

  it('throws for non-SVG input', () => {
    expect(() => parseUploadedSvg('not an svg', 1, 1)).toThrow('不是有效的 SVG');
  });
});

describe('nestedSvgMarkup', () => {
  it('wraps the inner markup in a sized nested svg', () => {
    expect(nestedSvgMarkup({ viewBox: '0 0 10 20', inner: '<g/>' }, 100, 200)).toBe(
      '<svg x="0" y="0" width="100" height="200" viewBox="0 0 10 20" preserveAspectRatio="none" overflow="visible"><g/></svg>',
    );
  });
});
```

- [ ] **Step 3：確認測試失敗**

Run: `npx vitest run src/utils/sanitizeSvg.test.ts`
Expected: FAIL，`Failed to resolve import "./sanitizeSvg"`

- [ ] **Step 4：實作 `src/utils/sanitizeSvg.ts`**

```ts
import DOMPurify from 'dompurify';
import { escapeAttr } from '../export/svg';

export interface ParsedSvg {
  viewBox: string;
  inner: string;
}

export function sanitizeSvg(text: string): string {
  return DOMPurify.sanitize(text, { USE_PROFILES: { svg: true, svgFilters: true } });
}

const sizeViewBox = (svg: Element, fallbackWidth: number, fallbackHeight: number): string => {
  const w = parseFloat(svg.getAttribute('width') ?? '');
  const h = parseFloat(svg.getAttribute('height') ?? '');
  return `0 0 ${Number.isFinite(w) ? w : fallbackWidth} ${Number.isFinite(h) ? h : fallbackHeight}`;
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

/** DOMPurify 以 HTML 方式序列化，可能拿掉 xmlns；XML 解析前補回，避免 xlink:href 造成解析錯誤 */
const ensureNamespaces = (markup: string): string =>
  markup
    .replace(/^(\s*<svg\b)(?![^>]*\sxmlns=)/i, `$1 xmlns="${SVG_NS}"`)
    .replace(/^(\s*<svg\b)(?![^>]*\sxmlns:xlink=)/i, `$1 xmlns:xlink="${XLINK_NS}"`);

export function parseUploadedSvg(text: string, fallbackWidth: number, fallbackHeight: number): ParsedSvg {
  const doc = new DOMParser().parseFromString(ensureNamespaces(sanitizeSvg(text)), 'image/svg+xml');
  const svg = doc.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('不是有效的 SVG');
  }
  const serializer = new XMLSerializer();
  return {
    viewBox: svg.getAttribute('viewBox') ?? sizeViewBox(svg, fallbackWidth, fallbackHeight),
    inner: Array.from(svg.childNodes).map(node => serializer.serializeToString(node)).join(''),
  };
}

export const nestedSvgMarkup = (parsed: ParsedSvg, widthPx: number, heightPx: number): string =>
  `<svg x="0" y="0" width="${widthPx}" height="${heightPx}" viewBox="${escapeAttr(parsed.viewBox)}" preserveAspectRatio="none" overflow="visible">${parsed.inner}</svg>`;
```

- [ ] **Step 5：確認測試通過**

Run: `npx vitest run src/utils/sanitizeSvg.test.ts`
Expected: PASS（6 tests）

- [ ] **Step 6：Commit**

```bash
git add package.json package-lock.json src/utils/sanitizeSvg.ts src/utils/sanitizeSvg.test.ts
git commit -m "feat: sanitize and parse uploaded SVG with DOMPurify

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5.2：Imposition 狀態 reducer 與圖層建立

**Files:**
- Create: `src/imposition/types.ts`、`src/imposition/state.ts`、`src/imposition/layers.ts`
- Test: `src/imposition/state.test.ts`、`src/imposition/layers.test.ts`

舊的 `ImpositionState` 等型別還留在 `src/types.ts` 給目前的 UI 使用，Task 5.4 才刪除；這個 task 的新型別放在 `src/imposition/types.ts`，兩者暫時並存。

**Interfaces:**
- Consumes：`packWithinBoundary`；`pxToMm`、`mmToPx`；`PathData`；`ViewBox`、`CUT_STROKE_MM`；`ParsedSvg`；`fileStem`
- Produces：
  ```ts
  // imposition/types.ts
  export interface LayoutBox { x: number; y: number; width: number; height: number }
  export type CutLayerData = { kind: 'paths'; paths: PathData[] } | { kind: 'svg'; svg: ParsedSvg };
  export interface ImpositionLayer { id; sourceId: string | null; name; imageBlob: Blob; imageUrl; widthPx; heightPx; dpi; cut: CutLayerData; underprint: PathData[] | null; layoutBoxPx: LayoutBox; totalCount }
  export interface ImpositionInstance { id: string; layerId: string; xMm: number; yMm: number; rotationDeg: 0 | 90 }
  export interface ImpositionShow { artwork: boolean; underprint: boolean; cut: boolean }
  export interface ImpositionState { boundaryWidthMm; boundaryHeightMm; minGapMm; allowRotate90; zoom; show: ImpositionShow; layers; instances; selectedInstanceId: string | null; notPlacedInstanceIds: string[]; lastLayoutMessage: string | null }
  export const DEFAULT_IMPOSITION_STATE: ImpositionState;  // 297 × 210 mm、間距 3 mm、zoom 1、全部顯示
  export const ZOOM_OPTIONS: readonly number[];            // [0.25, 0.5, 1, 2, 4]
  // imposition/state.ts
  export type IdFactory = () => string;
  export function layerBoxMm(layer: ImpositionLayer, rotationDeg: 0 | 90): { w: number; h: number }
  export function addLayers(state, layers: readonly ImpositionLayer[], newId: IdFactory): ImpositionState
  export function upsertSourceLayer(state, incoming: ImpositionLayer, newId: IdFactory): ImpositionState
  export function setLayerTotalCount(state, layerId: string, totalCount: number, newId: IdFactory): ImpositionState
  export function deleteInstance(state, instanceId: string): ImpositionState
  export function autoLayout(state): ImpositionState
  export function moveInstance(state, id: string, xMm: number, yMm: number): ImpositionState
  export function selectInstance(state, id: string | null): ImpositionState
  export function setAllowRotate(state, allow: boolean): ImpositionState
  // imposition/layers.ts
  export interface UploadPair { stem: string; image: File; svg: File }
  export function pairUploadFiles(files: readonly File[]): { pairs: UploadPair[]; unpaired: string[] }
  export function layoutBoxFromBounds(bounds: ViewBox | null, widthPx: number, heightPx: number, padPx: number): LayoutBox
  export interface SourceLayerInput { id; sourceId; name; blob: Blob; imageUrl; widthPx; heightPx; dpi; cutPaths: PathData[]; cutBounds: ViewBox | null; underprint: PathData[] | null }
  export function buildSourceLayer(input: SourceLayerInput): ImpositionLayer
  ```
  `layoutBoxFromBounds` **不裁切**到圖片範圍：刀模外擴後可能超出原圖，排版必須包含整條刀模。

- [ ] **Step 1：建立 `src/imposition/types.ts`**

```ts
import type { PathData } from '../types';
import type { ParsedSvg } from '../utils/sanitizeSvg';

export interface LayoutBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type CutLayerData = { kind: 'paths'; paths: PathData[] } | { kind: 'svg'; svg: ParsedSvg };

export interface ImpositionLayer {
  id: string;
  /** 從 Editor／Underprint 送來時是來源圖片 id；手動上傳為 null */
  sourceId: string | null;
  name: string;
  imageBlob: Blob;
  /** 圖層自己擁有的 object URL，圖層刪除時 revoke */
  imageUrl: string;
  widthPx: number;
  heightPx: number;
  dpi: number;
  cut: CutLayerData;
  underprint: PathData[] | null;
  /** 排版用的外框（原圖 px 座標，可能超出原圖範圍） */
  layoutBoxPx: LayoutBox;
  totalCount: number;
}

export interface ImpositionInstance {
  id: string;
  layerId: string;
  xMm: number;
  yMm: number;
  rotationDeg: 0 | 90;
}

export interface ImpositionShow {
  artwork: boolean;
  underprint: boolean;
  cut: boolean;
}

export interface ImpositionState {
  boundaryWidthMm: number;
  boundaryHeightMm: number;
  minGapMm: number;
  allowRotate90: boolean;
  zoom: number;
  show: ImpositionShow;
  layers: ImpositionLayer[];
  instances: ImpositionInstance[];
  selectedInstanceId: string | null;
  notPlacedInstanceIds: string[];
  lastLayoutMessage: string | null;
}

export const DEFAULT_IMPOSITION_STATE: ImpositionState = {
  boundaryWidthMm: 297,
  boundaryHeightMm: 210,
  minGapMm: 3,
  allowRotate90: false,
  zoom: 1,
  show: { artwork: true, underprint: true, cut: true },
  layers: [],
  instances: [],
  selectedInstanceId: null,
  notPlacedInstanceIds: [],
  lastLayoutMessage: null,
};

export const ZOOM_OPTIONS: readonly number[] = [0.25, 0.5, 1, 2, 4];
```

- [ ] **Step 2：寫 reducer 的失敗測試**

`src/imposition/state.test.ts`：

```ts
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

const withLayer = (l: ImpositionLayer = layer()): ImpositionState => addLayers(DEFAULT_IMPOSITION_STATE, [l], idGen());

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
    const grown = setLayerTotalCount(withLayer(), 'L1', 3, next);
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
    const s = setLayerTotalCount(withLayer(), 'L1', 2, idGen());
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
    const s = setLayerTotalCount(withLayer(), 'L1', 2, idGen());
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
```

- [ ] **Step 3：確認測試失敗**

Run: `npx vitest run src/imposition/state.test.ts`
Expected: FAIL，`Failed to resolve import "./state"`

- [ ] **Step 4：實作 `src/imposition/state.ts`**

邏輯對應原本 App.tsx 的 `setLayerTotalCount`、`deleteSelectedInstance`、`handleAutoLayout`，改成純函式並使用 mm。

```ts
import { pxToMm } from '../units';
import { packWithinBoundary } from './packing';
import type { ImpositionInstance, ImpositionLayer, ImpositionState } from './types';

export type IdFactory = () => string;

export function layerBoxMm(layer: ImpositionLayer, rotationDeg: 0 | 90): { w: number; h: number } {
  const w = pxToMm(layer.layoutBoxPx.width, layer.dpi);
  const h = pxToMm(layer.layoutBoxPx.height, layer.dpi);
  return rotationDeg === 90 ? { w: h, h: w } : { w, h };
}

const instancesFor = (layerId: string, count: number, newId: IdFactory): ImpositionInstance[] =>
  Array.from({ length: count }, () => ({ id: newId(), layerId, xMm: 0, yMm: 0, rotationDeg: 0 as const }));

export function addLayers(state: ImpositionState, layers: readonly ImpositionLayer[], newId: IdFactory): ImpositionState {
  return {
    ...state,
    layers: [...state.layers, ...layers],
    instances: [...state.instances, ...layers.flatMap(l => instancesFor(l.id, Math.max(1, l.totalCount), newId))],
    notPlacedInstanceIds: [],
    lastLayoutMessage: null,
  };
}

export function upsertSourceLayer(state: ImpositionState, incoming: ImpositionLayer, newId: IdFactory): ImpositionState {
  const existing = incoming.sourceId ? state.layers.find(l => l.sourceId === incoming.sourceId) : undefined;
  if (!existing) return addLayers(state, [{ ...incoming, totalCount: 1 }], newId);
  return {
    ...state,
    layers: state.layers.map(l => (l.id === existing.id ? { ...incoming, id: existing.id, totalCount: existing.totalCount } : l)),
    // 外框可能改變，需要重新排圖
    notPlacedInstanceIds: [],
    lastLayoutMessage: null,
  };
}

const removeInstances = (state: ImpositionState, ids: ReadonlySet<string>): ImpositionState => ({
  ...state,
  instances: state.instances.filter(i => !ids.has(i.id)),
  notPlacedInstanceIds: state.notPlacedInstanceIds.filter(id => !ids.has(id)),
  selectedInstanceId: state.selectedInstanceId && ids.has(state.selectedInstanceId) ? null : state.selectedInstanceId,
});

const removeLayer = (state: ImpositionState, layerId: string): ImpositionState => {
  const ids = new Set(state.instances.filter(i => i.layerId === layerId).map(i => i.id));
  return { ...removeInstances(state, ids), layers: state.layers.filter(l => l.id !== layerId), lastLayoutMessage: null };
};

export function setLayerTotalCount(state: ImpositionState, layerId: string, totalCount: number, newId: IdFactory): ImpositionState {
  const total = Math.max(0, Math.floor(Number.isFinite(totalCount) ? totalCount : 0));
  if (total === 0) return removeLayer(state, layerId);

  const current = state.instances.filter(i => i.layerId === layerId);
  const layers = state.layers.map(l => (l.id === layerId ? { ...l, totalCount: total } : l));
  if (current.length > total) {
    const removed = new Set(current.slice(total).map(i => i.id));
    return { ...removeInstances({ ...state, layers }, removed), lastLayoutMessage: null };
  }
  return {
    ...state,
    layers,
    instances: [...state.instances, ...instancesFor(layerId, total - current.length, newId)],
    lastLayoutMessage: null,
  };
}

export function deleteInstance(state: ImpositionState, instanceId: string): ImpositionState {
  const target = state.instances.find(i => i.id === instanceId);
  if (!target) return { ...state, selectedInstanceId: null };
  const remaining = removeInstances(state, new Set([instanceId]));
  const layer = state.layers.find(l => l.id === target.layerId);
  if (!layer) return { ...remaining, selectedInstanceId: null };

  const total = Math.max(0, layer.totalCount - 1);
  if (total === 0) return { ...removeLayer(remaining, layer.id), selectedInstanceId: null };
  return {
    ...remaining,
    layers: remaining.layers.map(l => (l.id === layer.id ? { ...l, totalCount: total } : l)),
    selectedInstanceId: null,
  };
}

export function autoLayout(state: ImpositionState): ImpositionState {
  const base = state.allowRotate90 ? state.instances : state.instances.map(i => ({ ...i, rotationDeg: 0 as const }));
  const layerMap = new Map(state.layers.map(l => [l.id, l] as const));
  const rects = base.flatMap(inst => {
    const layer = layerMap.get(inst.layerId);
    if (!layer) return [];
    const { w, h } = layerBoxMm(layer, 0);
    return [{ id: inst.id, w: w + state.minGapMm, h: h + state.minGapMm }];
  });

  const result = packWithinBoundary(rects, state.boundaryWidthMm, state.boundaryHeightMm, state.allowRotate90);
  const placed = new Map(result.placed.map(p => [p.id, p] as const));
  const instances = base.map(inst => {
    const p = placed.get(inst.id);
    return p ? { ...inst, xMm: p.x, yMm: p.y, rotationDeg: p.rotationDeg } : inst;
  });
  const rotateNote = state.allowRotate90 ? '（允許 90° 旋轉）' : '';
  return {
    ...state,
    instances,
    notPlacedInstanceIds: result.notPlaced,
    lastLayoutMessage: `排圖完成：塞得進去 ${result.placed.length} 個，塞不進去 ${result.notPlaced.length} 個。${rotateNote}`,
  };
}

export const moveInstance = (state: ImpositionState, id: string, xMm: number, yMm: number): ImpositionState => ({
  ...state,
  instances: state.instances.map(i => (i.id === id ? { ...i, xMm, yMm } : i)),
});

export const selectInstance = (state: ImpositionState, id: string | null): ImpositionState => ({
  ...state,
  selectedInstanceId: id,
});

export const setAllowRotate = (state: ImpositionState, allow: boolean): ImpositionState => ({
  ...state,
  allowRotate90: allow,
  instances: allow ? state.instances : state.instances.map(i => ({ ...i, rotationDeg: 0 as const })),
  notPlacedInstanceIds: [],
  lastLayoutMessage: null,
});
```

- [ ] **Step 5：確認 reducer 測試通過**

Run: `npx vitest run src/imposition/state.test.ts`
Expected: PASS（12 tests）

- [ ] **Step 6：寫圖層建立的失敗測試**

`src/imposition/layers.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { buildSourceLayer, layoutBoxFromBounds, pairUploadFiles } from './layers';

const file = (name: string, type: string) => new File(['x'], name, { type });

describe('pairUploadFiles', () => {
  it('pairs images and SVGs by filename stem', () => {
    const { pairs, unpaired } = pairUploadFiles([
      file('cat.png', 'image/png'),
      file('cat.svg', 'image/svg+xml'),
      file('dog.png', 'image/png'),
      file('readme.txt', 'text/plain'),
    ]);
    expect(pairs.map(p => [p.stem, p.image.name, p.svg.name])).toEqual([['cat', 'cat.png', 'cat.svg']]);
    expect(unpaired).toEqual(['dog', 'readme']);
  });

  it('recognises .SVG files without a mime type', () => {
    const { pairs } = pairUploadFiles([file('a.jpg', 'image/jpeg'), file('a.SVG', '')]);
    expect(pairs).toHaveLength(1);
  });
});

describe('layoutBoxFromBounds', () => {
  it('uses the full image without bounds', () => {
    expect(layoutBoxFromBounds(null, 100, 50, 2)).toEqual({ x: 0, y: 0, width: 100, height: 50 });
  });

  it('pads the bounds without clamping to the image', () => {
    expect(layoutBoxFromBounds({ x: -10, y: 5, width: 120, height: 40 }, 100, 50, 2)).toEqual({ x: -12, y: 3, width: 124, height: 44 });
  });
});

describe('buildSourceLayer', () => {
  const input = {
    id: 'L1',
    sourceId: 'src',
    name: 'cat',
    blob: new Blob(),
    imageUrl: 'blob:cat',
    widthPx: 100,
    heightPx: 50,
    dpi: 25.4,
    cutPaths: [{ d: 'M0 0Z' }],
    cutBounds: { x: 0, y: 0, width: 100, height: 50 },
    underprint: [{ d: 'M1 1Z', fillRule: 'evenodd' as const }],
  };

  it('builds a layer with padded cut bounds', () => {
    const l = buildSourceLayer(input);
    expect(l).toMatchObject({ id: 'L1', sourceId: 'src', totalCount: 1, cut: { kind: 'paths', paths: input.cutPaths }, underprint: input.underprint });
    // 以刀模線寬的一半（0.125 mm）當邊距；25.4 dpi 時 = 0.125 px
    const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
    const { x, y, width, height } = l.layoutBoxPx;
    expect([x, y, width, height].map(r6)).toEqual([-0.125, -0.125, 100.25, 50.25]);
  });

  it('stores an empty underprint as null', () => {
    expect(buildSourceLayer({ ...input, underprint: [] }).underprint).toBeNull();
  });
});
```

- [ ] **Step 7：確認測試失敗**

Run: `npx vitest run src/imposition/layers.test.ts`
Expected: FAIL，`Failed to resolve import "./layers"`

- [ ] **Step 8：實作 `src/imposition/layers.ts`**

```ts
import { CUT_STROKE_MM, type ViewBox } from '../export/svg';
import { fileStem } from '../source/sourceModel';
import type { PathData } from '../types';
import { mmToPx } from '../units';
import type { ImpositionLayer, LayoutBox } from './types';

export interface UploadPair {
  stem: string;
  image: File;
  svg: File;
}

interface UploadGroup {
  image?: File;
  svg?: File;
}

const isSvgFile = (f: File) => f.type === 'image/svg+xml' || f.name.toLowerCase().endsWith('.svg');
const isImageFile = (f: File) => f.type.startsWith('image/') && !isSvgFile(f);

export function pairUploadFiles(files: readonly File[]): { pairs: UploadPair[]; unpaired: string[] } {
  const groups = files.reduce((map, file) => {
    const stem = fileStem(file.name);
    const entry = map.get(stem) ?? {};
    const next: UploadGroup = isSvgFile(file) ? { ...entry, svg: file } : isImageFile(file) ? { ...entry, image: file } : entry;
    return new Map(map).set(stem, next);
  }, new Map<string, UploadGroup>());

  const entries = [...groups.entries()];
  return {
    pairs: entries.flatMap(([stem, g]) => (g.image && g.svg ? [{ stem, image: g.image, svg: g.svg }] : [])),
    unpaired: entries.filter(([, g]) => !(g.image && g.svg)).map(([stem]) => stem),
  };
}

export function layoutBoxFromBounds(bounds: ViewBox | null, widthPx: number, heightPx: number, padPx: number): LayoutBox {
  if (!bounds) return { x: 0, y: 0, width: widthPx, height: heightPx };
  return { x: bounds.x - padPx, y: bounds.y - padPx, width: bounds.width + padPx * 2, height: bounds.height + padPx * 2 };
}

export interface SourceLayerInput {
  id: string;
  sourceId: string;
  name: string;
  blob: Blob;
  imageUrl: string;
  widthPx: number;
  heightPx: number;
  dpi: number;
  cutPaths: PathData[];
  cutBounds: ViewBox | null;
  underprint: PathData[] | null;
}

export function buildSourceLayer(input: SourceLayerInput): ImpositionLayer {
  const pad = mmToPx(CUT_STROKE_MM / 2, input.dpi);
  return {
    id: input.id,
    sourceId: input.sourceId,
    name: input.name,
    imageBlob: input.blob,
    imageUrl: input.imageUrl,
    widthPx: input.widthPx,
    heightPx: input.heightPx,
    dpi: input.dpi,
    cut: { kind: 'paths', paths: input.cutPaths },
    underprint: input.underprint && input.underprint.length > 0 ? input.underprint : null,
    layoutBoxPx: layoutBoxFromBounds(input.cutBounds, input.widthPx, input.heightPx, pad),
    totalCount: 1,
  };
}
```

- [ ] **Step 9：確認測試通過**

Run: `npx vitest run src/imposition`
Expected: PASS（packing 7、state 12、layers 6）

- [ ] **Step 10：驗證並 commit**

Run: `npm run typecheck && npm test`

```bash
git add src/imposition/types.ts src/imposition/state.ts src/imposition/state.test.ts src/imposition/layers.ts src/imposition/layers.test.ts
git commit -m "feat: add mm-based imposition state reducers and layer builders

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5.3：分層 SVG 匯出

**Files:**
- Create: `src/imposition/exportSvg.ts`
- Test: `src/imposition/exportSvg.test.ts`

**Interfaces:**
- Consumes：`formatNumber`、`escapeAttr`、`pathElement`、`CUT_STROKE_MM` from `export/svg.ts`；`mmToPx`；`nestedSvgMarkup`；Imposition 型別
- Produces：
  ```ts
  export type ImpositionLayerKind = 'artwork' | 'underprint' | 'cut';
  export interface PlacedItem { layer: ImpositionLayer; instance: ImpositionInstance }
  export function placedItems(state: ImpositionState): PlacedItem[]   // 排除塞不進去的與找不到圖層的
  export function instanceTransform(layer: ImpositionLayer, instance: ImpositionInstance): string
  export async function blobToDataUrl(blob: Blob): Promise<string>
  export function buildImpositionSvg(o: {
    widthMm: number; heightMm: number;
    items: readonly PlacedItem[];
    kinds: readonly ImpositionLayerKind[];
    colors: { cut: string; underprint: string };
    imageDataUrls: ReadonlyMap<string, string>;   // layerId → data URI，只有 kinds 含 'artwork' 時需要
  }): string
  ```
  `instanceTransform` 與畫面上 `ImpositionCanvas` 的 CSS transform 必須一致：先把原圖座標平移、旋轉，再乘上 `25.4 / dpi` 換成 mm，最後平移到實例位置。

- [ ] **Step 1：寫失敗的測試**

`src/imposition/exportSvg.test.ts`：

```ts
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
```

- [ ] **Step 2：確認測試失敗**

Run: `npx vitest run src/imposition/exportSvg.test.ts`
Expected: FAIL，`Failed to resolve import "./exportSvg"`

- [ ] **Step 3：實作 `src/imposition/exportSvg.ts`**

```ts
import { CUT_STROKE_MM, escapeAttr, formatNumber, pathElement } from '../export/svg';
import { mmToPx, MM_PER_INCH } from '../units';
import { nestedSvgMarkup } from '../utils/sanitizeSvg';
import type { ImpositionInstance, ImpositionLayer, ImpositionState } from './types';

export type ImpositionLayerKind = 'artwork' | 'underprint' | 'cut';

export interface PlacedItem {
  layer: ImpositionLayer;
  instance: ImpositionInstance;
}

const INKSCAPE_NS = 'http://www.inkscape.org/namespaces/inkscape';
const f = formatNumber;

export function placedItems(state: ImpositionState): PlacedItem[] {
  const layers = new Map(state.layers.map(l => [l.id, l] as const));
  const notPlaced = new Set(state.notPlacedInstanceIds);
  return state.instances.flatMap(instance => {
    const layer = layers.get(instance.layerId);
    return layer && !notPlaced.has(instance.id) ? [{ layer, instance }] : [];
  });
}

export function instanceTransform(layer: ImpositionLayer, instance: ImpositionInstance): string {
  const s = MM_PER_INCH / layer.dpi;
  const { x, y, height } = layer.layoutBoxPx;
  const place = `translate(${f(instance.xMm)} ${f(instance.yMm)}) scale(${f(s)})`;
  return instance.rotationDeg === 90
    ? `${place} translate(${f(y + height)} ${f(-x)}) rotate(90)`
    : `${place} translate(${f(-x)} ${f(-y)})`;
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('無法讀取圖片'));
    reader.readAsDataURL(blob);
  });
}

const artworkItem = ({ layer, instance }: PlacedItem, dataUrl: string | undefined): string =>
  dataUrl
    ? `<g transform="${instanceTransform(layer, instance)}"><image href="${escapeAttr(dataUrl)}" x="0" y="0" width="${f(layer.widthPx)}" height="${f(layer.heightPx)}" preserveAspectRatio="none"/></g>`
    : '';

const underprintItem = ({ layer, instance }: PlacedItem): string =>
  layer.underprint
    ? `<g transform="${instanceTransform(layer, instance)}">${layer.underprint.map(p => pathElement({ ...p, fillRule: 'evenodd' })).join('')}</g>`
    : '';

const cutItem = ({ layer, instance }: PlacedItem): string => {
  // 群組經過 scale，線寬要換回圖層座標才會是 0.25 mm
  const strokeWidth = f(mmToPx(CUT_STROKE_MM, layer.dpi));
  const content =
    layer.cut.kind === 'paths'
      ? layer.cut.paths.map(pathElement).join('')
      : nestedSvgMarkup(layer.cut.svg, layer.widthPx, layer.heightPx);
  return `<g transform="${instanceTransform(layer, instance)}" stroke-width="${strokeWidth}">${content}</g>`;
};

const layerGroup = (kind: ImpositionLayerKind, attrs: string, content: string): string =>
  `<g id="${kind}" inkscape:groupmode="layer" inkscape:label="${kind}"${attrs}>${content}</g>`;

export function buildImpositionSvg(o: {
  widthMm: number;
  heightMm: number;
  items: readonly PlacedItem[];
  kinds: readonly ImpositionLayerKind[];
  colors: { cut: string; underprint: string };
  imageDataUrls: ReadonlyMap<string, string>;
}): string {
  const groups: Record<ImpositionLayerKind, () => string> = {
    artwork: () => layerGroup('artwork', '', o.items.map(item => artworkItem(item, o.imageDataUrls.get(item.layer.id))).join('')),
    underprint: () => layerGroup('underprint', ` fill="${escapeAttr(o.colors.underprint)}" stroke="none"`, o.items.map(underprintItem).join('')),
    cut: () => layerGroup('cut', ` fill="none" stroke="${escapeAttr(o.colors.cut)}" stroke-linejoin="round"`, o.items.map(cutItem).join('')),
  };
  const order: ImpositionLayerKind[] = ['artwork', 'underprint', 'cut'];
  const body = order.filter(k => o.kinds.includes(k)).map(k => groups[k]()).join('\n');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="${INKSCAPE_NS}" width="${f(o.widthMm)}mm" height="${f(o.heightMm)}mm" viewBox="0 0 ${f(o.widthMm)} ${f(o.heightMm)}">\n` +
    `${body}\n</svg>\n`
  );
}
```

- [ ] **Step 4：確認測試通過**

Run: `npx vitest run src/imposition/exportSvg.test.ts`
Expected: PASS（8 tests）

- [ ] **Step 5：驗證並 commit**

Run: `npm run typecheck && npm test`

```bash
git add src/imposition/exportSvg.ts src/imposition/exportSvg.test.ts
git commit -m "feat: export imposition as layered SVG with inkscape layers

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5.4：mm 版面畫布、面板與串接

把 Imposition 的 UI 換成 mm 版面，接上 Task 5.1–5.3 的純邏輯，並在 Editor／Underprint 加上「送到 Imposition」。和 Task 3.5 一樣只有一個 commit。

**Files:**
- Create: `src/imposition/measureSvg.ts`、`src/imposition/loadUploadedLayer.ts`、`src/imposition/exportFile.ts`、`src/components/Toast.tsx`
- Modify（改寫）: `src/hooks/useImposition.ts`、`src/components/ImpositionCanvas.tsx`、`src/components/panels/ImpositionPanel.tsx`、`src/App.tsx`
- Modify: `src/types.ts`（刪除舊的 Imposition 型別）、`vitest.config.ts`（coverage 排除 DOM 專用檔）

**Interfaces:**
- Consumes：Task 5.1–5.3 的全部匯出；`CSS_PX_PER_MM`；`downloadText`；`isTypingTarget`；`readDpiFromBlob`；`loadImage`；`newId`
- Produces：
  ```ts
  // imposition/measureSvg.ts（DOM）
  export function measureParsedSvg(svg: ParsedSvg, widthPx: number, heightPx: number, padPx?: number): LayoutBox
  // imposition/loadUploadedLayer.ts（DOM）
  export async function loadUploadedLayer(pair: UploadPair, defaultDpi: number): Promise<ImpositionLayer>
  // imposition/exportFile.ts（DOM）
  export async function downloadImpositionSvg(state: ImpositionState, kinds: readonly ImpositionLayerKind[], colors: { cut: string; underprint: string }, filename: string): Promise<void>
  // hooks/useImposition.ts
  export interface ImpositionApi {
    state: ImpositionState;
    update(fn: (s: ImpositionState) => ImpositionState): void;
    setLayerTotalCount(layerId: string, total: number): void;
    autoLayout(): void;
    uploadPairs(files: readonly File[]): Promise<string[]>;   // 回傳沒配對或載入失敗的檔名
    sendFromSource(input: Omit<SourceLayerInput, 'id' | 'imageUrl'>): void;
  }
  export function useImposition(active: boolean, defaultDpi: number): ImpositionApi
  // components/Toast.tsx
  export function Toast(p: { message: string | null; onDone(): void }): JSX.Element | null
  // components/ImpositionCanvas.tsx
  export interface ImpositionCanvasHandle { exportPDF(): Promise<void> }
  props: { state: ImpositionState; update(fn): void; colors: { cut: string; underprint: string } }
  ```

- [ ] **Step 1：coverage 排除 DOM 專用檔**

在 `vitest.config.ts` 的 `coverage.exclude` 陣列加入：

```ts
        'src/imposition/loadUploadedLayer.ts',
        'src/imposition/exportFile.ts',
```

- [ ] **Step 2：SVG 外框量測 `src/imposition/measureSvg.ts`**

沿用舊版 `measureSvgBBox` 的做法（放進畫面外的容器用 `getBBox` 量測），改成吃 `ParsedSvg`。上傳的 SVG 本來就對齊原圖，所以量測結果裁切到原圖範圍。

```ts
import { nestedSvgMarkup, type ParsedSvg } from '../utils/sanitizeSvg';
import type { LayoutBox } from './types';

const DEFAULT_PAD_PX = 2;

export function measureParsedSvg(svg: ParsedSvg, widthPx: number, heightPx: number, padPx = DEFAULT_PAD_PX): LayoutBox {
  const full: LayoutBox = { x: 0, y: 0, width: widthPx, height: heightPx };
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-100000px;top:-100000px;width:0;height:0;overflow:hidden;visibility:hidden';
  host.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}">${nestedSvgMarkup(svg, widthPx, heightPx)}</svg>`;
  document.body.appendChild(host);
  try {
    const root = host.firstElementChild as SVGGraphicsElement | null;
    if (!root) return full;
    const b = root.getBBox();
    const x0 = Math.max(0, b.x - padPx);
    const y0 = Math.max(0, b.y - padPx);
    const x1 = Math.min(widthPx, b.x + b.width + padPx);
    const y1 = Math.min(heightPx, b.y + b.height + padPx);
    return { x: x0, y: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) };
  } catch {
    return full;
  } finally {
    host.remove();
  }
}
```

- [ ] **Step 3：上傳配對載入 `src/imposition/loadUploadedLayer.ts`**

```ts
import { readDpiFromBlob } from '../utils/dpi';
import { newId } from '../utils/id';
import { loadImage } from '../utils/imageProcessing';
import { parseUploadedSvg } from '../utils/sanitizeSvg';
import type { UploadPair } from './layers';
import { measureParsedSvg } from './measureSvg';
import type { ImpositionLayer } from './types';

export async function loadUploadedLayer(pair: UploadPair, defaultDpi: number): Promise<ImpositionLayer> {
  const imageUrl = URL.createObjectURL(pair.image);
  try {
    const [img, dpi, svgText] = await Promise.all([loadImage(imageUrl), readDpiFromBlob(pair.image), pair.svg.text()]);
    const widthPx = img.naturalWidth;
    const heightPx = img.naturalHeight;
    const svg = parseUploadedSvg(svgText, widthPx, heightPx);
    return {
      id: newId(),
      sourceId: null,
      name: pair.stem,
      imageBlob: pair.image,
      imageUrl,
      widthPx,
      heightPx,
      dpi: dpi ?? defaultDpi,
      cut: { kind: 'svg', svg },
      underprint: null,
      layoutBoxPx: measureParsedSvg(svg, widthPx, heightPx),
      totalCount: 1,
    };
  } catch (err) {
    URL.revokeObjectURL(imageUrl);
    throw err;
  }
}
```

- [ ] **Step 4：匯出檔案 `src/imposition/exportFile.ts`**

```ts
import { downloadText } from '../utils/download';
import { blobToDataUrl, buildImpositionSvg, placedItems, type ImpositionLayerKind } from './exportSvg';
import type { ImpositionLayer, ImpositionState } from './types';

const SVG_MIME = 'image/svg+xml;charset=utf-8';

const uniqueLayers = (layers: readonly ImpositionLayer[]): ImpositionLayer[] =>
  [...new Map(layers.map(l => [l.id, l] as const)).values()];

export async function downloadImpositionSvg(
  state: ImpositionState,
  kinds: readonly ImpositionLayerKind[],
  colors: { cut: string; underprint: string },
  filename: string,
): Promise<void> {
  const items = placedItems(state);
  if (items.length === 0) return;
  const imageDataUrls = kinds.includes('artwork')
    ? new Map(
        await Promise.all(
          uniqueLayers(items.map(i => i.layer)).map(async l => [l.id, await blobToDataUrl(l.imageBlob)] as const),
        ),
      )
    : new Map<string, string>();
  const svg = buildImpositionSvg({
    widthMm: state.boundaryWidthMm,
    heightMm: state.boundaryHeightMm,
    items,
    kinds,
    colors,
    imageDataUrls,
  });
  downloadText(svg, filename, SVG_MIME);
}
```

- [ ] **Step 5：改寫 `src/hooks/useImposition.ts`**

整個檔案換成以下內容（第 3 階段搬進來的舊邏輯已由 `imposition/state.ts` 取代）：

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { isTypingTarget } from '../editor/keyboard';
import { buildSourceLayer, pairUploadFiles, type SourceLayerInput } from '../imposition/layers';
import { loadUploadedLayer } from '../imposition/loadUploadedLayer';
import { addLayers, autoLayout, deleteInstance, setLayerTotalCount, upsertSourceLayer } from '../imposition/state';
import { DEFAULT_IMPOSITION_STATE, type ImpositionLayer, type ImpositionState } from '../imposition/types';
import { newId } from '../utils/id';

export interface ImpositionApi {
  state: ImpositionState;
  update: (fn: (s: ImpositionState) => ImpositionState) => void;
  setLayerTotalCount: (layerId: string, total: number) => void;
  autoLayout: () => void;
  uploadPairs: (files: readonly File[]) => Promise<string[]>;
  sendFromSource: (input: Omit<SourceLayerInput, 'id' | 'imageUrl'>) => void;
}

const DELETE_KEYS = new Set(['x', 'delete', 'backspace']);

/** 圖層消失時釋放它的 object URL；unmount 時全部釋放 */
function useRevokeRemovedLayers(layers: readonly ImpositionLayer[]): void {
  const previous = useRef<readonly ImpositionLayer[]>([]);
  useEffect(() => {
    const alive = new Set(layers.map(l => l.imageUrl));
    previous.current.filter(l => !alive.has(l.imageUrl)).forEach(l => URL.revokeObjectURL(l.imageUrl));
    previous.current = layers;
  }, [layers]);
  useEffect(() => () => previous.current.forEach(l => URL.revokeObjectURL(l.imageUrl)), []);
}

export function useImposition(active: boolean, defaultDpi: number): ImpositionApi {
  const [state, setState] = useState<ImpositionState>(DEFAULT_IMPOSITION_STATE);
  const update = useCallback((fn: (s: ImpositionState) => ImpositionState) => setState(fn), []);
  useRevokeRemovedLayers(state.layers);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || !DELETE_KEYS.has(e.key.toLowerCase())) return;
      update(s => (s.selectedInstanceId ? deleteInstance(s, s.selectedInstanceId) : s));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, update]);

  const uploadPairs = useCallback(async (files: readonly File[]): Promise<string[]> => {
    const { pairs, unpaired } = pairUploadFiles(files);
    const results = await Promise.all(
      pairs.map(pair =>
        loadUploadedLayer(pair, defaultDpi).then(
          layer => ({ layer, failed: null }),
          (err: unknown) => {
            console.error('無法載入配對', pair.stem, err);
            return { layer: null, failed: pair.stem };
          },
        ),
      ),
    );
    const layers = results.flatMap(r => (r.layer ? [r.layer] : []));
    if (layers.length > 0) update(s => addLayers(s, layers, newId));
    return [...unpaired, ...results.flatMap(r => (r.failed ? [r.failed] : []))];
  }, [defaultDpi, update]);

  const sendFromSource = useCallback((input: Omit<SourceLayerInput, 'id' | 'imageUrl'>) => {
    // 圖層擁有自己的 URL，來源圖片換掉時不受影響
    const layer = buildSourceLayer({ ...input, id: newId(), imageUrl: URL.createObjectURL(input.blob) });
    update(s => upsertSourceLayer(s, layer, newId));
  }, [update]);

  return {
    state,
    update,
    setLayerTotalCount: (layerId, total) => update(s => setLayerTotalCount(s, layerId, total, newId)),
    autoLayout: () => update(autoLayout),
    uploadPairs,
    sendFromSource,
  };
}
```

- [ ] **Step 6：提示訊息 `src/components/Toast.tsx`**

```tsx
import React, { useEffect } from 'react';

const TOAST_MS = 3000;

export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(onDone, TOAST_MS);
    return () => clearTimeout(id);
  }, [message, onDone]);

  if (!message) return null;
  return (
    <div role="status" data-testid="toast" className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded bg-neutral-800 border border-neutral-600 text-sm text-white shadow-xl">
      {message}
    </div>
  );
}
```

- [ ] **Step 7：改寫 `src/components/ImpositionCanvas.tsx`**

整個檔案換成以下內容。和舊版的差異：
- 所有位置與尺寸用 mm 儲存，畫面上乘以 `k = CSS_PX_PER_MM × zoom`。
- 圖層內容依 `k × 25.4 / dpi` 縮放，不同 DPI 的圖以實際尺寸呈現。
- `layerById` 改為 render 時用 `useMemo` 計算，修正「新上傳的項目不顯示」。
- 原圖、白墨、刀模可以分別顯示；上傳的 SVG 只以過濾後的 `nestedSvgMarkup` 呈現。
- PDF 頁面單位改為 mm，點陣解析度約 300 dpi（最大 4000 px）。

```tsx
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { layerBoxMm, moveInstance, selectInstance } from '../imposition/state';
import type { ImpositionInstance, ImpositionLayer, ImpositionShow, ImpositionState } from '../imposition/types';
import { CSS_PX_PER_MM, MM_PER_INCH } from '../units';
import { nestedSvgMarkup } from '../utils/sanitizeSvg';

export interface ImpositionCanvasHandle {
  exportPDF(): Promise<void>;
}

interface Colors {
  cut: string;
  underprint: string;
}

interface ImpositionCanvasProps {
  state: ImpositionState;
  update: (fn: (s: ImpositionState) => ImpositionState) => void;
  colors: Colors;
}

type DragState = { id: string; offsetXMm: number; offsetYMm: number } | null;
type PanState = { x: number; y: number; left: number; top: number } | null;

const PDF_DPI = 300;
const MAX_CANVAS_PX = 4000;

/** 在 active 期間監聽整個視窗的滑鼠移動與放開 */
function useWindowMouse(active: boolean, onMove: (e: MouseEvent) => void, onUp: () => void): void {
  useEffect(() => {
    if (!active) return;
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [active, onMove, onUp]);
}

const contentTransform = (layer: ImpositionLayer, rotationDeg: 0 | 90, scale: number): string => {
  const { x, y, height } = layer.layoutBoxPx;
  const inner = rotationDeg === 90 ? `translate(${y + height}px, ${-x}px) rotate(90deg)` : `translate(${-x}px, ${-y}px)`;
  return `scale(${scale}) ${inner}`;
};

function ItemContent({ layer, show, colors }: { layer: ImpositionLayer; show: ImpositionShow; colors: Colors }) {
  const { widthPx: w, heightPx: h } = layer;
  const svgProps = { className: 'absolute inset-0 overflow-visible', width: w, height: h, viewBox: `0 0 ${w} ${h}` };
  return (
    <>
      {show.artwork ? (
        <img src={layer.imageUrl} alt={layer.name} draggable={false} className="absolute inset-0 w-full h-full select-none pointer-events-none" />
      ) : null}
      {show.underprint && layer.underprint ? (
        <svg {...svgProps}>
          {layer.underprint.map((p, i) => (
            <path key={i} d={p.d} fill={colors.underprint} fillOpacity={0.8} fillRule="evenodd" />
          ))}
        </svg>
      ) : null}
      {show.cut && layer.cut.kind === 'paths' ? (
        <svg {...svgProps}>
          {layer.cut.paths.map((p, i) => (
            <path key={i} d={p.d} fill="none" stroke={colors.cut} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
      ) : null}
      {show.cut && layer.cut.kind === 'svg' ? (
        <svg className="absolute inset-0 overflow-visible" width={w} height={h} dangerouslySetInnerHTML={{ __html: nestedSvgMarkup(layer.cut.svg, w, h) }} />
      ) : null}
    </>
  );
}

interface ItemProps {
  layer: ImpositionLayer;
  instance: ImpositionInstance;
  k: number;
  selected: boolean;
  notPlaced: boolean;
  show: ImpositionShow;
  colors: Colors;
  onMouseDown: (e: React.MouseEvent, instance: ImpositionInstance) => void;
}

function ImpositionItem({ layer, instance, k, selected, notPlaced, show, colors, onMouseDown }: ItemProps) {
  const { w, h } = layerBoxMm(layer, instance.rotationDeg);
  const scale = (k * MM_PER_INCH) / layer.dpi;
  return (
    <div
      className={`absolute cursor-move overflow-hidden ${selected ? 'ring-2 ring-blue-500' : ''}`}
      style={{ left: instance.xMm * k, top: instance.yMm * k, width: w * k, height: h * k }}
      onMouseDown={e => onMouseDown(e, instance)}
      role="button"
      aria-label={`Imposition item ${layer.name}`}
      data-testid="imposition-item"
      data-not-placed={notPlaced ? 'true' : 'false'}
    >
      {notPlaced ? <div className="absolute inset-0 bg-yellow-200/40 pointer-events-none" /> : null}
      <div
        className="absolute left-0 top-0 pointer-events-none"
        style={{ width: layer.widthPx, height: layer.heightPx, transformOrigin: 'top left', transform: contentTransform(layer, instance.rotationDeg, scale) }}
      >
        <ItemContent layer={layer} show={show} colors={colors} />
      </div>
    </div>
  );
}

async function renderPdf(el: HTMLDivElement, widthMm: number, heightMm: number): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  const cssPxPerMm = el.offsetWidth / widthMm;
  const scale = Math.max(1, Math.min(MAX_CANVAS_PX / Math.max(el.offsetWidth, el.offsetHeight), PDF_DPI / MM_PER_INCH / cssPxPerMm));
  const prevBg = el.style.backgroundColor;
  el.style.backgroundColor = 'transparent';
  try {
    const canvas = await html2canvas(el, {
      backgroundColor: null,
      scale,
      useCORS: true,
      ignoreElements: node => node instanceof HTMLElement && node.dataset.notPlaced === 'true',
    });
    const doc = new jsPDF({ orientation: widthMm > heightMm ? 'l' : 'p', unit: 'mm', format: [widthMm, heightMm] });
    // PDF 頁面不支援真正透明，先鋪白底
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, widthMm, heightMm, 'F');
    doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, widthMm, heightMm);
    doc.save('imposition-layout.pdf');
  } finally {
    el.style.backgroundColor = prevBg;
  }
}

const ImpositionCanvas = forwardRef<ImpositionCanvasHandle, ImpositionCanvasProps>(({ state, update, colors }, ref) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const boundaryRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState>(null);
  const [pan, setPan] = useState<PanState>(null);
  const k = CSS_PX_PER_MM * state.zoom;
  const layerById = useMemo(() => new Map(state.layers.map(l => [l.id, l] as const)), [state.layers]);
  const notPlaced = useMemo(() => new Set(state.notPlacedInstanceIds), [state.notPlacedInstanceIds]);

  const pointerMm = (e: { clientX: number; clientY: number }) => {
    const rect = boundaryRef.current?.getBoundingClientRect();
    return rect ? { x: (e.clientX - rect.left) / k, y: (e.clientY - rect.top) / k } : null;
  };

  const onDragMove = (e: MouseEvent) => {
    const p = pointerMm(e);
    if (drag && p) update(s => moveInstance(s, drag.id, p.x - drag.offsetXMm, p.y - drag.offsetYMm));
  };
  const onPanMove = (e: MouseEvent) => {
    const viewport = viewportRef.current;
    if (!pan || !viewport) return;
    viewport.scrollLeft = pan.left - (e.clientX - pan.x);
    viewport.scrollTop = pan.top - (e.clientY - pan.y);
  };
  useWindowMouse(drag !== null, onDragMove, () => setDrag(null));
  useWindowMouse(pan !== null, onPanMove, () => setPan(null));

  useImperativeHandle(ref, () => ({
    exportPDF: async () => {
      if (boundaryRef.current) await renderPdf(boundaryRef.current, state.boundaryWidthMm, state.boundaryHeightMm);
    },
  }), [state.boundaryWidthMm, state.boundaryHeightMm]);

  const onItemMouseDown = (e: React.MouseEvent, instance: ImpositionInstance) => {
    const p = pointerMm(e);
    if (!p) return;
    e.preventDefault();
    e.stopPropagation();
    update(s => selectInstance(s, instance.id));
    setDrag({ id: instance.id, offsetXMm: p.x - instance.xMm, offsetYMm: p.y - instance.yMm });
  };

  const onBoundaryMouseDown = (e: React.MouseEvent) => {
    const viewport = viewportRef.current;
    if (!viewport || e.button !== 0) return;
    e.preventDefault();
    update(s => selectInstance(s, null));
    setPan({ x: e.clientX, y: e.clientY, left: viewport.scrollLeft, top: viewport.scrollTop });
  };

  return (
    <div ref={viewportRef} className={`absolute inset-0 overflow-auto ${pan ? 'cursor-grabbing' : 'cursor-grab'}`}>
      <div className="min-w-full min-h-full flex items-center justify-center p-6">
        <div
          ref={boundaryRef}
          className="relative shrink-0 border-2 border-dashed border-neutral-700 rounded-lg overflow-hidden bg-neutral-900/20"
          style={{ width: state.boundaryWidthMm * k, height: state.boundaryHeightMm * k }}
          onMouseDown={onBoundaryMouseDown}
        >
          {state.instances.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-500 pointer-events-none">
              <p className="text-lg font-medium">尚無排版項目</p>
              <p className="text-sm opacity-60">從 Editor／Underprint 送過來，或上傳「圖＋SVG」配對。</p>
            </div>
          ) : null}
          {state.instances.map(instance => {
            const layer = layerById.get(instance.layerId);
            return layer ? (
              <ImpositionItem
                key={instance.id}
                layer={layer}
                instance={instance}
                k={k}
                selected={state.selectedInstanceId === instance.id}
                notPlaced={notPlaced.has(instance.id)}
                show={state.show}
                colors={colors}
                onMouseDown={onItemMouseDown}
              />
            ) : null;
          })}
        </div>
      </div>
    </div>
  );
});

ImpositionCanvas.displayName = 'ImpositionCanvas';
export default ImpositionCanvas;
```

- [ ] **Step 8：改寫 `src/components/panels/ImpositionPanel.tsx`**

整個檔案換成以下內容：

```tsx
import { Download, FileText, Upload } from 'lucide-react';
import React from 'react';
import { layerBoxMm, setAllowRotate } from '../../imposition/state';
import { ZOOM_OPTIONS, type ImpositionShow, type ImpositionState } from '../../imposition/types';
import { formatMm } from '../../units';
import { ActionButton, InfoRow, Section, SelectField, ToggleField } from './fields';

interface ImpositionPanelProps {
  state: ImpositionState;
  update: (fn: (s: ImpositionState) => ImpositionState) => void;
  onUpload: (files: File[]) => void;
  onSetLayerTotalCount: (layerId: string, total: number) => void;
  onAutoLayout: () => void;
  onExportLayers: () => void;
  onExportCut: () => void;
  onExportUnderprint: () => void;
  onExportPdf: () => void;
}

const SHOW_LABELS: readonly [keyof ImpositionShow, string][] = [
  ['artwork', '顯示原圖'],
  ['underprint', '顯示白墨'],
  ['cut', '顯示刀模'],
];

function MmInput({ label, value, min, onChange }: { label: string; value: number; min: number; onChange: (v: number) => void }) {
  return (
    <label className="block space-y-1 text-xs text-neutral-400">
      {label}
      <input
        type="number"
        min={min}
        step={0.5}
        value={value}
        onChange={e => onChange(Math.max(min, Number(e.target.value) || 0))}
        className="w-full px-2 py-1 rounded bg-neutral-700 border border-neutral-600 text-white text-xs"
      />
    </label>
  );
}

function UploadBox({ onUpload }: { onUpload: (files: File[]) => void }) {
  return (
    <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-neutral-600 rounded-lg hover:border-blue-500 hover:bg-neutral-700/50 transition cursor-pointer">
      <Upload className="w-6 h-6 mb-1 text-neutral-500" />
      <span className="text-xs text-neutral-400">上傳「圖＋SVG」配對（可多選）</span>
      <span className="text-[10px] text-neutral-500">同檔名配對，例如 cat.png + cat.svg</span>
      <input
        type="file"
        className="hidden"
        multiple
        accept="image/*,image/svg+xml,.svg"
        data-testid="imposition-upload"
        onChange={e => {
          onUpload(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
    </label>
  );
}

function LayerList({ state, onSetLayerTotalCount }: Pick<ImpositionPanelProps, 'state' | 'onSetLayerTotalCount'>) {
  if (state.layers.length === 0) return <div className="text-[10px] text-neutral-500">還沒有圖層。</div>;
  return (
    <div className="space-y-2">
      {state.layers.map(layer => {
        const { w, h } = layerBoxMm(layer, 0);
        return (
          <div key={layer.id} className="flex items-center gap-2 p-2 rounded bg-neutral-700/20 border border-neutral-700">
            <img src={layer.imageUrl} alt={layer.name} className="w-8 h-8 rounded object-contain bg-neutral-900" draggable={false} />
            <div className="flex-1 min-w-0">
              <div className="text-neutral-200 text-xs truncate">{layer.name}</div>
              <div className="text-[10px] text-neutral-500">{formatMm(w)} × {formatMm(h)}</div>
              <div className="text-[10px] text-neutral-400">刀模{layer.underprint ? '＋白墨' : ''}</div>
            </div>
            <label className="flex items-center gap-1 text-[10px] text-neutral-400">
              總數
              <input
                type="number"
                min={0}
                value={layer.totalCount}
                onChange={e => onSetLayerTotalCount(layer.id, Number(e.target.value) || 0)}
                className="w-14 px-2 py-1 rounded bg-neutral-800 border border-neutral-600 text-white text-xs"
                title="設為 0 會刪除該圖層"
              />
            </label>
          </div>
        );
      })}
    </div>
  );
}

export function ImpositionPanel(props: ImpositionPanelProps) {
  const { state, update } = props;
  const placedCount = state.instances.length - state.notPlacedInstanceIds.length;
  const hasUnderprint = state.layers.some(l => l.underprint);
  const zoomOptions = ZOOM_OPTIONS.map(z => ({ value: String(z), label: `${z * 100}%` }));

  return (
    <>
      <UploadBox onUpload={props.onUpload} />
      <Section title="版面">
        <div className="grid grid-cols-2 gap-3">
          <MmInput label="寬（mm）" value={state.boundaryWidthMm} min={10} onChange={v => update(s => ({ ...s, boundaryWidthMm: v }))} />
          <MmInput label="高（mm）" value={state.boundaryHeightMm} min={10} onChange={v => update(s => ({ ...s, boundaryHeightMm: v }))} />
        </div>
        <MmInput label="最小間距（mm）" value={state.minGapMm} min={0} onChange={v => update(s => ({ ...s, minGapMm: v }))} />
        <ToggleField label="允許 90° 旋轉" checked={state.allowRotate90} onChange={v => update(s => setAllowRotate(s, v))} />
        <SelectField label="縮放" value={String(state.zoom)} options={zoomOptions} onChange={v => update(s => ({ ...s, zoom: Number(v) }))} />
      </Section>
      <Section title="顯示">
        {SHOW_LABELS.map(([key, label]) => (
          <ToggleField key={key} label={label} checked={state.show[key]} onChange={v => update(s => ({ ...s, show: { ...s.show, [key]: v } }))} />
        ))}
      </Section>
      <Section title="排圖">
        <InfoRow label="圖層" value={state.layers.length} testId="imposition-layer-count" />
        <InfoRow label="項目" value={state.instances.length} />
        <ActionButton onClick={props.onAutoLayout} disabled={state.instances.length === 0} testId="imposition-auto-layout">排圖</ActionButton>
        {state.lastLayoutMessage ? (
          <div className="p-2 rounded bg-neutral-900 border border-neutral-700 text-[10px] text-neutral-300">{state.lastLayoutMessage}</div>
        ) : null}
      </Section>
      <Section title="匯出（排除塞不進的項目）">
        <ActionButton variant="primary" onClick={props.onExportLayers} disabled={placedCount === 0} testId="export-imposition-layers">
          <Download className="w-3 h-3" /> 分層 SVG（原圖＋白墨＋刀模）
        </ActionButton>
        <ActionButton onClick={props.onExportCut} disabled={placedCount === 0} testId="export-imposition-cut">
          <Download className="w-3 h-3" /> 只有刀模 SVG
        </ActionButton>
        <ActionButton onClick={props.onExportUnderprint} disabled={placedCount === 0 || !hasUnderprint} testId="export-imposition-underprint">
          <Download className="w-3 h-3" /> 只有白墨 SVG
        </ActionButton>
        <ActionButton onClick={props.onExportPdf} disabled={placedCount === 0} testId="export-imposition-pdf">
          <FileText className="w-3 h-3" /> PDF 預覽（點陣）
        </ActionButton>
      </Section>
      <Section title="圖層">
        <LayerList state={state} onSetLayerTotalCount={props.onSetLayerTotalCount} />
      </Section>
    </>
  );
}
```

- [ ] **Step 9：刪除 `src/types.ts` 的舊 Imposition 型別**

刪除 `src/types.ts` 裡的 `ImpositionLayer`、`ImpositionInstance`、`ImpositionState`、`DEFAULT_IMPOSITION_STATE`（新版在 `src/imposition/types.ts`）。檔案最後只剩：`PathData`、`DisplayStyle`、`DEFAULT_CUT_STYLE`、`DEFAULT_UNDERPRINT_STYLE`、`ActiveTab`。

- [ ] **Step 10：修改 `src/App.tsx`**

以第 4 階段的 App 為基礎，做以下七處修改：

**10a.** import 區加入：

```tsx
import { Toast } from './components/Toast';
import { downloadImpositionSvg } from './imposition/exportFile';
import type { ImpositionLayerKind } from './imposition/exportSvg';
```

**10b.** 把 `const EXPORT_UNDERPRINT_COLOR = '#FFFFFF';` 換成：

```tsx
const EXPORT_UNDERPRINT_COLOR = '#FFFFFF';
const EXPORT_COLORS = { cut: EXPORT_CUT_COLOR, underprint: EXPORT_UNDERPRINT_COLOR };
```

**10c.** 把 `const imposition = useImposition(activeTab === 'imposition');` 換成：

```tsx
  const imposition = useImposition(activeTab === 'imposition', DEFAULT_DPI);
  const [notice, setNotice] = useState<string | null>(null);
  const clearNotice = useCallback(() => setNotice(null), []);
```

**10d.** 在 `exportUnderprint` 函式之後加入：

```tsx
  const sendToImposition = () => {
    const cutEditor = cut.ref.current;
    if (!source || !cutEditor) return;
    const underPaths = underprintEnabled ? under.ref.current?.getPathData() ?? [] : [];
    const { blob, widthPx, heightPx, dpi: d } = source.current;
    imposition.sendFromSource({
      sourceId: source.id,
      name: source.name,
      blob,
      widthPx,
      heightPx,
      dpi: d,
      cutPaths: cutEditor.getPathData(),
      cutBounds: cutEditor.getBounds(),
      underprint: underPaths.length > 0 ? underPaths : null,
    });
    setActiveTab('imposition');
    setNotice(underPaths.length > 0 ? '已送到 Imposition（含白墨）' : '已送到 Imposition（不含白墨）');
  };

  const exportImposition = (kinds: readonly ImpositionLayerKind[], filename: string) => {
    downloadImpositionSvg(imposition.state, kinds, EXPORT_COLORS, filename).catch((err: unknown) => {
      console.error('匯出 Imposition SVG 失敗', err);
      window.alert('匯出 SVG 失敗，請再試一次。');
    });
  };

  const uploadImposition = (files: File[]) => {
    imposition.uploadPairs(files).then(skipped => {
      if (skipped.length > 0) window.alert(`以下檔名沒有配對成「圖片＋SVG」或無法載入，已略過：\n\n${skipped.join('\n')}`);
    }).catch((err: unknown) => console.error('上傳配對失敗', err));
  };
```

**10e.** 在 `<CutlinePanel ... onExportPdf={exportPdf}` 之後加一行 `onSendToImposition={sendToImposition}`；在 `<UnderprintPanel ... onExport={exportUnderprint}` 之後加一行 `onSendToImposition={sendToImposition}`。

**10f.** 把整個 `<ImpositionPanel ... />` 換成：

```tsx
          <ImpositionPanel
            state={imposition.state}
            update={imposition.update}
            onUpload={uploadImposition}
            onSetLayerTotalCount={imposition.setLayerTotalCount}
            onAutoLayout={imposition.autoLayout}
            onExportLayers={() => exportImposition(['artwork', 'underprint', 'cut'], 'imposition-layers.svg')}
            onExportCut={() => exportImposition(['cut'], 'imposition-cut.svg')}
            onExportUnderprint={() => exportImposition(['underprint'], 'imposition-underprint.svg')}
            onExportPdf={() => {
              impositionRef.current?.exportPDF().catch((err: unknown) => {
                console.error('匯出 PDF 失敗', err);
                window.alert('匯出 PDF 失敗，請再試一次。');
              });
            }}
          />
```

**10g.** 把 `<main>` 結尾的這一段：

```tsx
        <div className="absolute inset-0" hidden={activeTab !== 'imposition'}>
          <ImpositionCanvas ref={impositionRef} impositionState={imposition.impositionState} setImpositionState={imposition.setImpositionState} />
        </div>
      </main>
```

換成：

```tsx
        <div className="absolute inset-0" hidden={activeTab !== 'imposition'}>
          <ImpositionCanvas ref={impositionRef} state={imposition.state} update={imposition.update} colors={EXPORT_COLORS} />
        </div>
        <Toast message={notice} onDone={clearNotice} />
      </main>
```

- [ ] **Step 11：自動驗證**

Run: `npm run typecheck && npm test && npm run build`
Expected: 全部通過。

Run: `grep -rnE "boundaryWidth\b|boundaryHeight\b|minGap\b|svgText|impositionState" src`
Expected: 沒有輸出（舊的 px 欄位與舊 props 都已移除）。

- [ ] **Step 12：手動驗證（`npm run dev`）**

1. Editor 上傳圖、Underprint 開過一次 → 在 Editor 按「送到 Imposition」→ 自動切到 Imposition，提示「已送到 Imposition（含白墨）」，版面上出現原圖＋白墨＋刀模。
2. 換一張沒開過白墨頁的新圖並送出 → 提示「不含白墨」，出現第二個圖層。
3. 對目前這張圖把外擴距離調大後再按一次「送到 Imposition」→ 圖層數不變，該圖層的外框變大，淡黃色的「塞不進」標記與排圖訊息被清除。
4. 版面寬高輸入 297 × 210 → 邊界是 A4 橫式比例；縮放 50%／200% 時所有項目等比例縮放。
5. 關閉「顯示原圖」「顯示白墨」「顯示刀模」各一次，畫面對應消失。
6. 拖曳項目、按 X 刪除、設定總數 3 → 排圖 → 項目以 3 mm 間距排列，塞不進的變淡黃色。
7. 允許 90° 旋轉後排圖 → 旋轉的項目刀模與原圖仍對齊。
8. 匯出分層 SVG，用 Inkscape 開啟：圖層面板有 artwork／underprint／cut 三個圖層，文件尺寸 297 × 210 mm，旋轉的項目對齊。
9. 匯出只有刀模／只有白墨 SVG；匯出 PDF 預覽，頁面為 mm。
10. 上傳 `cat.png` + `cat.svg`（SVG 內含 `<script>alert(1)</script>` 與 `onload`）→ 項目**立即**出現（修正了原本要點一下才顯示的 bug），沒有跳出 alert。

- [ ] **Step 13：Commit**

```bash
git add vitest.config.ts src/App.tsx src/types.ts src/hooks/useImposition.ts src/components/ImpositionCanvas.tsx src/components/panels/ImpositionPanel.tsx src/components/Toast.tsx src/imposition/measureSvg.ts src/imposition/loadUploadedLayer.ts src/imposition/exportFile.ts
git commit -m "feat: send cut and underprint to imposition with mm layout and layered SVG export

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
