# 第 3 階段：刀模線單一連通與 PathEditor

先讀 index 的 Global Constraints。這個階段把 Editor 分頁換成新的幾何引擎：Task 3.1–3.2 是可測試的純邏輯，Task 3.3–3.5 是 UI（由第 7 階段的 E2E 覆蓋）。

---

### Task 3.1：alpha 工具、歷史、確認訊息

**Files:**
- Create: `src/utils/alpha.ts`、`src/editor/pathHistory.ts`、`src/editor/guardMessage.ts`
- Test: `src/utils/alpha.test.ts`、`src/editor/pathHistory.test.ts`、`src/editor/guardMessage.test.ts`

**Interfaces:**
- Consumes：`AlphaImage` from `src/geometry/types.ts`
- Produces：
  ```ts
  // utils/alpha.ts
  export function hasTransparency(alpha: ArrayLike<number>): boolean
  export function extractAlpha(source: CanvasImageSource & { width: number; height: number }): AlphaImage  // DOM，只在瀏覽器使用
  // editor/pathHistory.ts
  export interface HistoryState { readonly entries: readonly string[]; readonly index: number }
  export const EMPTY_HISTORY: HistoryState;
  export function resetHistory(snapshot: string): HistoryState
  export function pushHistory(h: HistoryState, snapshot: string): HistoryState
  export function undoHistory(h: HistoryState): HistoryState
  export function redoHistory(h: HistoryState): HistoryState
  export function currentSnapshot(h: HistoryState): string | null
  export function canUndo(h: HistoryState): boolean
  export function canRedo(h: HistoryState): boolean
  export function isDirty(h: HistoryState): boolean   // index > 0：有基準以外的編輯
  // editor/guardMessage.ts
  export function buildOverwriteMessage(affected: readonly string[]): string
  ```

- [ ] **Step 1：寫失敗的測試**

`src/utils/alpha.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { hasTransparency } from './alpha';

describe('hasTransparency', () => {
  it('is false when every pixel is opaque', () => {
    expect(hasTransparency(new Uint8ClampedArray([255, 255, 255]))).toBe(false);
  });

  it('is true when any pixel is not fully opaque', () => {
    expect(hasTransparency(new Uint8ClampedArray([255, 254, 255]))).toBe(true);
    expect(hasTransparency([0])).toBe(true);
  });

  it('is false for an empty image', () => {
    expect(hasTransparency([])).toBe(false);
  });
});
```

`src/editor/pathHistory.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import {
  EMPTY_HISTORY,
  canRedo,
  canUndo,
  currentSnapshot,
  isDirty,
  pushHistory,
  redoHistory,
  resetHistory,
  undoHistory,
} from './pathHistory';

describe('pathHistory', () => {
  it('starts empty', () => {
    expect(currentSnapshot(EMPTY_HISTORY)).toBeNull();
    expect(canUndo(EMPTY_HISTORY)).toBe(false);
    expect(canRedo(EMPTY_HISTORY)).toBe(false);
    expect(isDirty(EMPTY_HISTORY)).toBe(false);
  });

  it('resets to a single base snapshot that is not dirty', () => {
    const h = resetHistory('a');
    expect(currentSnapshot(h)).toBe('a');
    expect(isDirty(h)).toBe(false);
    expect(canUndo(h)).toBe(false);
  });

  it('pushes, undoes and redoes', () => {
    const h1 = pushHistory(resetHistory('a'), 'b');
    expect(currentSnapshot(h1)).toBe('b');
    expect(isDirty(h1)).toBe(true);

    const h2 = undoHistory(h1);
    expect(currentSnapshot(h2)).toBe('a');
    expect(isDirty(h2)).toBe(false);
    expect(canRedo(h2)).toBe(true);

    const h3 = redoHistory(h2);
    expect(currentSnapshot(h3)).toBe('b');
  });

  it('truncates the redo branch on push', () => {
    const h = pushHistory(undoHistory(pushHistory(resetHistory('a'), 'b')), 'c');
    expect(h.entries).toEqual(['a', 'c']);
    expect(canRedo(h)).toBe(false);
  });

  it('ignores undo and redo at the ends', () => {
    const base = resetHistory('a');
    expect(undoHistory(base)).toBe(base);
    expect(redoHistory(base)).toBe(base);
  });

  it('does not mutate the previous state', () => {
    const base = resetHistory('a');
    pushHistory(base, 'b');
    expect(base.entries).toEqual(['a']);
  });
});
```

`src/editor/guardMessage.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { buildOverwriteMessage } from './guardMessage';

describe('buildOverwriteMessage', () => {
  it('names one page', () => {
    expect(buildOverwriteMessage(['Editor'])).toBe(
      '你已在 Editor 手動編輯過節點，這個變更會重新產生路徑並覆蓋編輯。',
    );
  });

  it('names several pages', () => {
    expect(buildOverwriteMessage(['Editor', 'Underprint'])).toBe(
      '你已在 Editor、Underprint 手動編輯過節點，這個變更會重新產生路徑並覆蓋編輯。',
    );
  });
});
```

- [ ] **Step 2：確認測試失敗**

Run: `npx vitest run src/utils/alpha.test.ts src/editor`
Expected: FAIL，三個檔案都是 `Failed to resolve import`

- [ ] **Step 3：實作**

`src/utils/alpha.ts`：

```ts
import type { AlphaImage } from '../geometry/types';

export function hasTransparency(alpha: ArrayLike<number>): boolean {
  for (let i = 0; i < alpha.length; i++) {
    if (alpha[i] < 255) return true;
  }
  return false;
}

/** 畫到 canvas 後取出 alpha 通道。只能在瀏覽器使用。 */
export function extractAlpha(source: CanvasImageSource & { width: number; height: number }): AlphaImage {
  const { width, height } = source;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('無法建立 canvas 2D context');
  ctx.drawImage(source, 0, 0);
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const alpha = new Uint8ClampedArray(width * height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
  return { width, height, alpha };
}
```

`src/editor/pathHistory.ts`：

```ts
export interface HistoryState {
  readonly entries: readonly string[];
  readonly index: number;
}

export const EMPTY_HISTORY: HistoryState = { entries: [], index: -1 };

export const resetHistory = (snapshot: string): HistoryState => ({ entries: [snapshot], index: 0 });

export const pushHistory = (h: HistoryState, snapshot: string): HistoryState => ({
  entries: [...h.entries.slice(0, h.index + 1), snapshot],
  index: h.index + 1,
});

export const undoHistory = (h: HistoryState): HistoryState =>
  h.index > 0 ? { ...h, index: h.index - 1 } : h;

export const redoHistory = (h: HistoryState): HistoryState =>
  h.index < h.entries.length - 1 ? { ...h, index: h.index + 1 } : h;

export const currentSnapshot = (h: HistoryState): string | null => h.entries[h.index] ?? null;

export const canUndo = (h: HistoryState): boolean => h.index > 0;

export const canRedo = (h: HistoryState): boolean => h.index < h.entries.length - 1;

/** 第一筆是產生路徑時的基準；index 大於 0 代表有手動編輯 */
export const isDirty = (h: HistoryState): boolean => h.index > 0;
```

`src/editor/guardMessage.ts`：

```ts
export const buildOverwriteMessage = (affected: readonly string[]): string =>
  `你已在 ${affected.join('、')} 手動編輯過節點，這個變更會重新產生路徑並覆蓋編輯。`;
```

- [ ] **Step 4：確認測試通過**

Run: `npx vitest run src/utils/alpha.test.ts src/editor`
Expected: PASS（alpha 3、pathHistory 6、guardMessage 2）

- [ ] **Step 5：Commit**

```bash
git add src/utils/alpha.ts src/utils/alpha.test.ts src/editor/pathHistory.ts src/editor/pathHistory.test.ts src/editor/guardMessage.ts src/editor/guardMessage.test.ts
git commit -m "feat: add alpha helpers, path history and overwrite message

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3.2：SVG 與 PDF 匯出

**Files:**
- Modify: `src/types.ts`（加入 `PathData`）
- Create: `src/export/svg.ts`、`src/export/cutPdf.ts`
- Test: `src/export/svg.test.ts`、`src/export/cutPdf.test.ts`

**Interfaces:**
- Consumes：`mmToPx`、`pxToMm` from `src/units.ts`；`Point` from `src/geometry/types.ts`
- Produces：
  ```ts
  // src/types.ts
  export interface PathData { d: string; fillRule?: 'evenodd' }
  // export/svg.ts
  export interface ViewBox { x: number; y: number; width: number; height: number }
  export const CUT_STROKE_MM = 0.25;
  export function formatNumber(n: number): string            // 最多 4 位小數
  export function escapeAttr(value: string): string
  export function pathElement(p: PathData): string
  export function cutGroup(paths: readonly PathData[], color: string, strokeWidth: number): string
  export function underprintGroup(paths: readonly PathData[], color: string): string
  export function svgDocument(o: { widthMm: number; heightMm: number; viewBox: ViewBox; body: string }): string
  export function buildAlignedSvg(o: { kind: 'cut' | 'underprint'; paths: readonly PathData[]; widthPx: number; heightPx: number; dpi: number; color: string }): string
  export function buildTrimmedCutSvg(o: { paths: readonly PathData[]; bounds: ViewBox; dpi: number; color: string }): string
  // export/cutPdf.ts
  export interface CurveSegment { c1: Point; c2: Point; end: Point }
  export interface CurveSet { start: Point; segments: CurveSegment[]; closed: boolean }
  export interface PdfLike { addImage(...); setDrawColor(r, g, b); setLineWidth(w); moveTo(x, y); curveTo(x1, y1, x2, y2, x3, y3); close(); stroke(); }
  export function hexToRgb(hex: string): [number, number, number]
  export function drawCutPdf(doc: PdfLike, o: CutPdfOptions): void
  export async function exportCutPdf(o: CutPdfOptions, filename?: string): Promise<void>
  export interface CutPdfOptions { image: HTMLImageElement | null; curveSets: readonly CurveSet[]; widthPx: number; heightPx: number; dpi: number; color: string }
  ```

- [ ] **Step 1：在 `src/types.ts` 最上面加入 `PathData`**

```ts
/** 一條 SVG 路徑（圖片 px 座標）。白墨的 CompoundPath 會帶 fillRule。 */
export interface PathData {
  d: string;
  fillRule?: 'evenodd';
}
```

- [ ] **Step 2：寫 SVG 的失敗測試**

`src/export/svg.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import {
  buildAlignedSvg,
  buildTrimmedCutSvg,
  escapeAttr,
  formatNumber,
  pathElement,
  svgDocument,
} from './svg';

describe('formatNumber', () => {
  it('keeps at most 4 decimals and drops trailing zeros', () => {
    expect(formatNumber(1.23456789)).toBe('1.2346');
    expect(formatNumber(2)).toBe('2');
    expect(formatNumber(2.5)).toBe('2.5');
    expect(formatNumber(-0.00001)).toBe('0');
  });
});

describe('escapeAttr', () => {
  it('escapes XML special characters', () => {
    expect(escapeAttr('a&b<c>"d')).toBe('a&amp;b&lt;c&gt;&quot;d');
  });
});

describe('pathElement', () => {
  it('adds fill-rule only when present', () => {
    expect(pathElement({ d: 'M0 0Z' })).toBe('<path d="M0 0Z"/>');
    expect(pathElement({ d: 'M0 0Z', fillRule: 'evenodd' })).toBe('<path d="M0 0Z" fill-rule="evenodd"/>');
  });
});

describe('svgDocument', () => {
  it('writes mm size and viewBox', () => {
    const svg = svgDocument({ widthMm: 10, heightMm: 5, viewBox: { x: 0, y: 0, width: 100, height: 50 }, body: '<g/>' });
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg" width="10mm" height="5mm" viewBox="0 0 100 50">');
    expect(svg).toContain('<g/>');
    expect(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });
});

describe('buildAlignedSvg', () => {
  it('builds a cut layer sized to the image in mm', () => {
    const svg = buildAlignedSvg({ kind: 'cut', paths: [{ d: 'M1 1L2 2Z' }], widthPx: 300, heightPx: 150, dpi: 300, color: '#FF0000' });
    expect(svg).toContain('width="25.4mm" height="12.7mm" viewBox="0 0 300 150"');
    expect(svg).toContain('<g id="cut" fill="none" stroke="#FF0000" stroke-width="2.9528" stroke-linejoin="round">');
    expect(svg).toContain('<path d="M1 1L2 2Z"/>');
  });

  it('builds an underprint layer', () => {
    const svg = buildAlignedSvg({ kind: 'underprint', paths: [{ d: 'M0 0Z', fillRule: 'evenodd' }], widthPx: 10, heightPx: 10, dpi: 25.4, color: '#FFFFFF' });
    expect(svg).toContain('<g id="underprint" fill="#FFFFFF" stroke="none"><path d="M0 0Z" fill-rule="evenodd"/></g>');
  });
});

describe('buildTrimmedCutSvg', () => {
  it('pads the bounds by half the stroke width', () => {
    const svg = buildTrimmedCutSvg({ paths: [{ d: 'M0 0Z' }], bounds: { x: 10, y: 20, width: 100, height: 50 }, dpi: 25.4, color: '#FF0000' });
    expect(svg).toContain('width="100.25mm" height="50.25mm" viewBox="9.875 19.875 100.25 50.25"');
  });
});
```

- [ ] **Step 3：確認測試失敗**

Run: `npx vitest run src/export/svg.test.ts`
Expected: FAIL，`Failed to resolve import "./svg"`

- [ ] **Step 4：實作 `src/export/svg.ts`**

```ts
import type { PathData } from '../types';
import { mmToPx, pxToMm } from '../units';

export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const CUT_STROKE_MM = 0.25;

export const formatNumber = (n: number): string => Number(n.toFixed(4)).toString();

export const escapeAttr = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const pathElement = (p: PathData): string =>
  `<path d="${escapeAttr(p.d)}"${p.fillRule ? ` fill-rule="${p.fillRule}"` : ''}/>`;

export const cutGroup = (paths: readonly PathData[], color: string, strokeWidth: number): string =>
  `<g id="cut" fill="none" stroke="${escapeAttr(color)}" stroke-width="${formatNumber(strokeWidth)}" stroke-linejoin="round">` +
  `${paths.map(pathElement).join('')}</g>`;

export const underprintGroup = (paths: readonly PathData[], color: string): string =>
  `<g id="underprint" fill="${escapeAttr(color)}" stroke="none">${paths.map(pathElement).join('')}</g>`;

const viewBoxAttr = (v: ViewBox) =>
  [v.x, v.y, v.width, v.height].map(formatNumber).join(' ');

export function svgDocument(o: { widthMm: number; heightMm: number; viewBox: ViewBox; body: string }): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${formatNumber(o.widthMm)}mm" height="${formatNumber(o.heightMm)}mm" viewBox="${viewBoxAttr(o.viewBox)}">\n` +
    `${o.body}\n</svg>\n`
  );
}

export function buildAlignedSvg(o: {
  kind: 'cut' | 'underprint';
  paths: readonly PathData[];
  widthPx: number;
  heightPx: number;
  dpi: number;
  color: string;
}): string {
  const body =
    o.kind === 'cut'
      ? cutGroup(o.paths, o.color, mmToPx(CUT_STROKE_MM, o.dpi))
      : underprintGroup(o.paths, o.color);
  return svgDocument({
    widthMm: pxToMm(o.widthPx, o.dpi),
    heightMm: pxToMm(o.heightPx, o.dpi),
    viewBox: { x: 0, y: 0, width: o.widthPx, height: o.heightPx },
    body,
  });
}

export function buildTrimmedCutSvg(o: {
  paths: readonly PathData[];
  bounds: ViewBox;
  dpi: number;
  color: string;
}): string {
  const strokeWidth = mmToPx(CUT_STROKE_MM, o.dpi);
  const pad = strokeWidth / 2;
  const viewBox: ViewBox = {
    x: o.bounds.x - pad,
    y: o.bounds.y - pad,
    width: o.bounds.width + pad * 2,
    height: o.bounds.height + pad * 2,
  };
  return svgDocument({
    widthMm: pxToMm(viewBox.width, o.dpi),
    heightMm: pxToMm(viewBox.height, o.dpi),
    viewBox,
    body: cutGroup(o.paths, o.color, strokeWidth),
  });
}
```

- [ ] **Step 5：確認 SVG 測試通過**

Run: `npx vitest run src/export/svg.test.ts`
Expected: PASS（8 tests）

- [ ] **Step 6：寫 PDF 的失敗測試**

`src/export/cutPdf.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { drawCutPdf, hexToRgb, type PdfLike } from './cutPdf';

// px → mm 的換算有浮點誤差，記錄時先四捨五入到 6 位小數
const round = (v: unknown) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v);

const recorder = () => {
  const calls: unknown[][] = [];
  const record = (name: string, args: unknown[]) => calls.push([name, ...args.map(round)]);
  const doc: PdfLike = {
    addImage: (...args: unknown[]) => { record('addImage', args.slice(1)); },
    setDrawColor: (...args: number[]) => { record('setDrawColor', args); },
    setLineWidth: (w: number) => { record('setLineWidth', [w]); },
    moveTo: (x: number, y: number) => { record('moveTo', [x, y]); },
    curveTo: (...args: number[]) => { record('curveTo', args); },
    close: () => { record('close', []); },
    stroke: () => { record('stroke', []); },
  };
  return { doc, calls };
};

describe('hexToRgb', () => {
  it('parses #RRGGBB', () => {
    expect(hexToRgb('#FF8000')).toEqual([255, 128, 0]);
  });

  it('falls back to red for invalid input', () => {
    expect(hexToRgb('red')).toEqual([255, 0, 0]);
  });
});

describe('drawCutPdf', () => {
  it('draws the image and the curves in mm', () => {
    const { doc, calls } = recorder();
    const image = {} as HTMLImageElement;
    drawCutPdf(doc, {
      image,
      widthPx: 254,
      heightPx: 127,
      dpi: 254, // 10 px = 1 mm
      color: '#FF0000',
      curveSets: [{
        start: [10, 20],
        segments: [{ c1: [20, 20], c2: [30, 20], end: [40, 20] }],
        closed: true,
      }],
    });
    expect(calls).toEqual([
      ['addImage', 'PNG', 0, 0, 25.4, 12.7],
      ['setDrawColor', 255, 0, 0],
      ['setLineWidth', 0.25],
      ['moveTo', 1, 2],
      ['curveTo', 2, 2, 3, 2, 4, 2],
      ['close'],
      ['stroke'],
    ]);
  });

  it('skips the image when missing and does not close open curves', () => {
    const { doc, calls } = recorder();
    drawCutPdf(doc, {
      image: null,
      widthPx: 10,
      heightPx: 10,
      dpi: 25.4,
      color: '#00FF00',
      curveSets: [{ start: [0, 0], segments: [], closed: false }],
    });
    expect(calls.map(c => c[0])).toEqual(['setDrawColor', 'setLineWidth', 'moveTo', 'stroke']);
  });
});
```

- [ ] **Step 7：確認測試失敗**

Run: `npx vitest run src/export/cutPdf.test.ts`
Expected: FAIL，`Failed to resolve import "./cutPdf"`

- [ ] **Step 8：實作 `src/export/cutPdf.ts`**

```ts
import type { Point } from '../geometry/types';
import { pxToMm } from '../units';
import { CUT_STROKE_MM } from './svg';

export interface CurveSegment {
  c1: Point;
  c2: Point;
  end: Point;
}

export interface CurveSet {
  start: Point;
  segments: CurveSegment[];
  closed: boolean;
}

/** jsPDF 用到的最小介面，方便測試 */
export interface PdfLike {
  addImage(image: HTMLImageElement, format: string, x: number, y: number, w: number, h: number): unknown;
  setDrawColor(r: number, g: number, b: number): unknown;
  setLineWidth(width: number): unknown;
  moveTo(x: number, y: number): unknown;
  curveTo(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): unknown;
  close(): unknown;
  stroke(): unknown;
}

export interface CutPdfOptions {
  image: HTMLImageElement | null;
  curveSets: readonly CurveSet[];
  widthPx: number;
  heightPx: number;
  dpi: number;
  color: string;
}

export function hexToRgb(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) return [255, 0, 0];
  return [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)];
}

export function drawCutPdf(doc: PdfLike, o: CutPdfOptions): void {
  const mm = (px: number) => pxToMm(px, o.dpi);
  if (o.image) {
    doc.addImage(o.image, 'PNG', 0, 0, mm(o.widthPx), mm(o.heightPx));
  }
  const [r, g, b] = hexToRgb(o.color);
  doc.setDrawColor(r, g, b);
  doc.setLineWidth(CUT_STROKE_MM);

  for (const set of o.curveSets) {
    doc.moveTo(mm(set.start[0]), mm(set.start[1]));
    for (const s of set.segments) {
      doc.curveTo(mm(s.c1[0]), mm(s.c1[1]), mm(s.c2[0]), mm(s.c2[1]), mm(s.end[0]), mm(s.end[1]));
    }
    if (set.closed) doc.close();
    doc.stroke();
  }
}

export async function exportCutPdf(o: CutPdfOptions, filename = 'contour-crafted-export.pdf'): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const widthMm = pxToMm(o.widthPx, o.dpi);
  const heightMm = pxToMm(o.heightPx, o.dpi);
  const doc = new jsPDF({ orientation: widthMm > heightMm ? 'l' : 'p', unit: 'mm', format: [widthMm, heightMm] });
  drawCutPdf(doc, o);
  doc.save(filename);
}
```

- [ ] **Step 9：確認測試通過**

Run: `npx vitest run src/export`
Expected: PASS（svg 8、cutPdf 4）

- [ ] **Step 10：驗證並 commit**

Run: `npm run typecheck && npm test && npm run build`

```bash
git add src/types.ts src/export/svg.ts src/export/svg.test.ts src/export/cutPdf.ts src/export/cutPdf.test.ts
git commit -m "feat: export cut and underprint SVG in mm and cut PDF

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3.3：PathEditorCanvas

**Files:**
- Modify: `src/types.ts`（加入 `DisplayStyle` 與兩組預設樣式）
- Create: `src/editor/keyboard.ts`、`src/editor/paperItems.ts`、`src/editor/editTool.ts`、`src/editor/PathEditorCanvas.tsx`
- Test: `src/editor/keyboard.test.ts`

**Interfaces:**
- Consumes：`Polygon`、`Ring` from `geometry/types.ts`；`PathData` from `src/types.ts`；`ViewBox` from `export/svg.ts`；`CurveSet` from `export/cutPdf.ts`；`pathHistory` 的所有函式
- Produces：
  ```ts
  // src/types.ts
  export interface DisplayStyle { showOriginal: boolean; showPoints: boolean; fillColor: string; fillOpacity: number; strokeColor: string; strokeOpacity: number; strokeWidth: number }
  export const DEFAULT_CUT_STYLE: DisplayStyle;
  export const DEFAULT_UNDERPRINT_STYLE: DisplayStyle;
  // editor/keyboard.ts
  export function isTypingTarget(target: EventTarget | null): boolean
  // editor/PathEditorCanvas.tsx
  export type OutlineMode = 'stroke' | 'fill';
  export interface PathEditorCanvasProps {
    imageUrl: string; widthPx: number; heightPx: number;
    polygons: readonly Polygon[] | null;  // 參照改變就重新產生
    mode: OutlineMode;                   // 'stroke'：每個外圈一條 Path；'fill'：一個 evenodd CompoundPath
    style: DisplayStyle;
    smoothness: number;                  // 改變時重新產生
    referencePaths?: readonly PathData[];
    active: boolean;                     // 只有作用中的分頁會處理 Ctrl/Cmd+Z
    testId?: string;
    onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void;
    onSegmentCount?: (count: number) => void;
    onDirtyChange?: (dirty: boolean) => void;
    onPathsChange?: (paths: PathData[]) => void;
  }
  export interface PathEditorHandle {
    undo(): void; redo(): void;
    getPathData(): PathData[];
    getBounds(): ViewBox | null;
    getCurveSets(): CurveSet[];
    getImage(): HTMLImageElement | null;
  }
  export default PathEditorCanvas;
  ```

**重點說明（實作前讀）：**
- 刀模和白墨各有一個 `PaperScope`。Paper 建立物件時使用「目前啟用的 scope」，所以**建立任何 item 前都要 `scope.activate()`**，並優先使用 `new scope.Path(...)` 這類 scope 上的建構子。
- 分頁切換時畫布不會 unmount（第 3.5 節用 `hidden` 切換），編輯與歷史才能保留。畫布從隱藏變成可見時尺寸會從 0 變成實際大小，所以用 `ResizeObserver` 觀察容器並更新 `view.viewSize`；圖片載入時如果畫布還是 0 大小，就等第一次有尺寸時再縮放到適合的比例。
- 所有 callback 透過 `propsRef` 讀取最新值，避免 Paper 事件拿到過期的 closure。

- [ ] **Step 1：在 `src/types.ts` 加入顯示樣式**

加在 `PathData` 之後：

```ts
export interface DisplayStyle {
  showOriginal: boolean;
  showPoints: boolean;
  fillColor: string;
  fillOpacity: number;
  strokeColor: string;
  strokeOpacity: number;
  strokeWidth: number;
}

export const DEFAULT_CUT_STYLE: DisplayStyle = {
  showOriginal: true,
  showPoints: true,
  fillColor: '#3b82f6',
  fillOpacity: 0.3,
  strokeColor: '#ef4444',
  strokeOpacity: 1,
  strokeWidth: 3,
};

export const DEFAULT_UNDERPRINT_STYLE: DisplayStyle = {
  showOriginal: true,
  showPoints: true,
  fillColor: '#ffffff',
  fillOpacity: 0.7,
  strokeColor: '#22d3ee',
  strokeOpacity: 1,
  strokeWidth: 1,
};
```

- [ ] **Step 2：寫 keyboard 的失敗測試**

`src/editor/keyboard.test.ts`：

```ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isTypingTarget } from './keyboard';

describe('isTypingTarget', () => {
  it('detects form fields and editable content', () => {
    expect(isTypingTarget(document.createElement('input'))).toBe(true);
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true);
    expect(isTypingTarget(document.createElement('select'))).toBe(true);
    const div = document.createElement('div');
    div.contentEditable = 'true';
    expect(isTypingTarget(div)).toBe(true);
  });

  it('ignores other targets', () => {
    expect(isTypingTarget(document.createElement('canvas'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget(window)).toBe(false);
  });
});
```

- [ ] **Step 3：確認測試失敗**

Run: `npx vitest run src/editor/keyboard.test.ts`
Expected: FAIL，`Failed to resolve import "./keyboard"`

- [ ] **Step 4：實作 `src/editor/keyboard.ts`**

jsdom 沒有實作 `isContentEditable`，所以另外檢查 attribute（瀏覽器裡兩者結果一致）。

```ts
const TYPING_TAGS = new Set(['input', 'textarea', 'select']);

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    TYPING_TAGS.has(target.tagName.toLowerCase()) ||
    target.isContentEditable === true ||
    target.getAttribute('contenteditable') === 'true'
  );
}
```

- [ ] **Step 5：確認測試通過**

Run: `npx vitest run src/editor/keyboard.test.ts`
Expected: PASS（2 tests）

- [ ] **Step 6：實作 `src/editor/paperItems.ts`**

```ts
import paper from 'paper';
import type { CurveSet } from '../export/cutPdf';
import type { Polygon, Ring } from '../geometry/types';
import type { DisplayStyle, PathData } from '../types';

export const OUTLINES = 'outlines';
export const RASTER = 'mainImage';
export const REFERENCE = 'reference';

export type OutlineMode = 'stroke' | 'fill';

const REFERENCE_COLOR = '#ef4444';
const REFERENCE_DASH = [6, 4];

const makePath = (scope: paper.PaperScope, ring: Ring, smoothness: number): paper.Path => {
  const path = new scope.Path({
    segments: ring.map(([x, y]) => new paper.Point(x, y)),
    closed: true,
    insert: false,
  });
  if (smoothness > 0) path.simplify(smoothness);
  return path;
};

/** 刀模：每個外圈一條 Path；白墨：所有外圈與洞放進一個 evenodd CompoundPath */
export function buildOutlineItem(
  scope: paper.PaperScope,
  polygons: readonly Polygon[],
  mode: OutlineMode,
  smoothness: number,
): paper.Group {
  scope.activate();
  const children: paper.Item[] =
    mode === 'stroke'
      ? polygons.map(p => makePath(scope, p.outer, smoothness))
      : [
          new scope.CompoundPath({
            children: polygons.flatMap(p => [p.outer, ...p.holes]).map(r => makePath(scope, r, smoothness)),
            fillRule: 'evenodd',
            insert: false,
          }),
        ];
  const group = new scope.Group({ children, insert: true });
  group.name = OUTLINES;
  return group;
}

const withAlpha = (hex: string, alpha: number): paper.Color => {
  const color = new paper.Color(hex);
  color.alpha = alpha;
  return color;
};

export function applyOutlineStyle(item: paper.Item, style: DisplayStyle): void {
  for (const child of item.children ?? []) {
    child.strokeColor = withAlpha(style.strokeColor, style.strokeOpacity);
    child.fillColor = withAlpha(style.fillColor, style.fillOpacity);
    child.strokeWidth = style.strokeWidth;
    child.strokeCap = 'round';
    child.strokeJoin = 'round';
    child.fullySelected = style.showPoints;
  }
}

export function buildReferenceItem(scope: paper.PaperScope, paths: readonly PathData[]): paper.Group {
  scope.activate();
  const group = new scope.Group(paths.map(p => new scope.CompoundPath(p.d)));
  group.name = REFERENCE;
  group.locked = true;
  group.strokeColor = new paper.Color(REFERENCE_COLOR);
  group.fillColor = null;
  group.dashArray = REFERENCE_DASH;
  group.strokeWidth = 1.5;
  group.strokeScaling = false;
  return group;
}

const isPathItem = (item: paper.Item): item is paper.PathItem =>
  item instanceof paper.Path || item instanceof paper.CompoundPath;

const leafPaths = (item: paper.Item): paper.Path[] =>
  item instanceof paper.Path ? [item] : (item.children ?? []).flatMap(leafPaths);

export function readPathData(item: paper.Item, mode: OutlineMode): PathData[] {
  return (item.children ?? [])
    .filter(isPathItem)
    .map(child => (mode === 'fill' ? { d: child.pathData, fillRule: 'evenodd' as const } : { d: child.pathData }));
}

export function readCurveSets(item: paper.Item): CurveSet[] {
  return leafPaths(item)
    .filter(path => path.segments.length > 0)
    .map(path => ({
      start: [path.firstSegment.point.x, path.firstSegment.point.y] as const,
      segments: path.curves.map(c => ({
        c1: [c.point1.x + c.handle1.x, c.point1.y + c.handle1.y] as const,
        c2: [c.point2.x + c.handle2.x, c.point2.y + c.handle2.y] as const,
        end: [c.point2.x, c.point2.y] as const,
      })),
      closed: path.closed,
    }));
}

export const countSegments = (item: paper.Item): number =>
  leafPaths(item).reduce((n, path) => n + path.segments.length, 0);

export function placeAboveRaster(scope: paper.PaperScope, item: paper.Item): void {
  const raster = scope.project.getItem({ name: RASTER });
  if (raster) item.insertAbove(raster);
}
```

- [ ] **Step 7：實作 `src/editor/editTool.ts`**

互動行為與現有 `EditorCanvas` 相同：拖曳節點、點線段新增節點、雙擊節點刪除。

```ts
import paper from 'paper';
import { OUTLINES } from './paperItems';

const HIT_TOLERANCE = 5;
const DOUBLE_CLICK_MS = 300;

const insideOutlines = (item: paper.Item | null): boolean => {
  for (let current = item; current; current = current.parent) {
    if (current.name === OUTLINES) return true;
  }
  return false;
};

export function attachEditTool(scope: paper.PaperScope, onEdit: () => void): paper.Tool {
  scope.activate();
  const tool = new scope.Tool();
  let segment: paper.Segment | null = null;
  let dragged = false;
  let lastClick = 0;

  const hitOptions = {
    segments: true,
    stroke: true,
    fill: false,
    tolerance: HIT_TOLERANCE,
    match: (hit: paper.HitResult) => insideOutlines(hit.item),
  };

  tool.onMouseDown = (event: paper.ToolEvent) => {
    segment = null;
    dragged = false;
    const now = Date.now();
    const isDoubleClick = now - lastClick < DOUBLE_CLICK_MS;
    lastClick = now;

    const hit = scope.project.hitTest(event.point, hitOptions);
    if (!hit) return;
    if (hit.type === 'segment') {
      if (isDoubleClick) {
        hit.segment.remove();
        onEdit();
        return;
      }
      segment = hit.segment;
      return;
    }
    if (hit.type === 'stroke' && hit.location && hit.item instanceof paper.Path) {
      segment = hit.item.insert(hit.location.index + 1, event.point);
      onEdit();
    }
  };

  tool.onMouseDrag = (event: paper.ToolEvent) => {
    if (!segment) return;
    dragged = true;
    segment.point = segment.point.add(event.delta);
  };

  tool.onMouseUp = () => {
    if (dragged) onEdit();
    segment = null;
    dragged = false;
  };

  tool.activate();
  return tool;
}
```

- [ ] **Step 8：實作 `src/editor/PathEditorCanvas.tsx`**

```tsx
import paper from 'paper';
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import type { CurveSet } from '../export/cutPdf';
import type { ViewBox } from '../export/svg';
import type { Polygon } from '../geometry/types';
import type { DisplayStyle, PathData } from '../types';
import { attachEditTool } from './editTool';
import { isTypingTarget } from './keyboard';
import {
  canRedo,
  canUndo,
  currentSnapshot,
  EMPTY_HISTORY,
  isDirty,
  pushHistory,
  redoHistory,
  resetHistory,
  undoHistory,
  type HistoryState,
} from './pathHistory';
import {
  applyOutlineStyle,
  buildOutlineItem,
  buildReferenceItem,
  countSegments,
  OUTLINES,
  placeAboveRaster,
  RASTER,
  readCurveSets,
  readPathData,
  REFERENCE,
  type OutlineMode,
} from './paperItems';

export type { OutlineMode } from './paperItems';

const FIT_PADDING = 50;
const DIMMED_IMAGE_OPACITY = 0.4;

export interface PathEditorCanvasProps {
  imageUrl: string;
  widthPx: number;
  heightPx: number;
  polygons: readonly Polygon[] | null;
  mode: OutlineMode;
  style: DisplayStyle;
  smoothness: number;
  referencePaths?: readonly PathData[];
  active: boolean;
  testId?: string;
  onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void;
  onSegmentCount?: (count: number) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onPathsChange?: (paths: PathData[]) => void;
}

export interface PathEditorHandle {
  undo(): void;
  redo(): void;
  getPathData(): PathData[];
  getBounds(): ViewBox | null;
  getCurveSets(): CurveSet[];
  getImage(): HTMLImageElement | null;
}

const fitView = (scope: paper.PaperScope, w: number, h: number): boolean => {
  const { width, height } = scope.view.viewSize;
  if (width === 0 || height === 0) return false;
  scope.view.center = new paper.Point(w / 2, h / 2);
  scope.view.zoom = Math.min((width - FIT_PADDING) / w, (height - FIT_PADDING) / h, 1);
  return true;
};

const PathEditorCanvas = forwardRef<PathEditorHandle, PathEditorCanvasProps>((props, ref) => {
  const { imageUrl, widthPx, heightPx, polygons, mode, style, smoothness, referencePaths, active, testId } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scopeRef = useRef<paper.PaperScope | null>(null);
  const historyRef = useRef<HistoryState>(EMPTY_HISTORY);
  const pendingFitRef = useRef<{ w: number; h: number } | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const outlines = useCallback(
    (): paper.Item | null => scopeRef.current?.project.getItem({ name: OUTLINES }) ?? null,
    [],
  );

  const notify = useCallback(() => {
    const h = historyRef.current;
    const p = propsRef.current;
    const item = outlines();
    p.onHistoryChange?.(canUndo(h), canRedo(h));
    p.onDirtyChange?.(isDirty(h));
    p.onSegmentCount?.(item ? countSegments(item) : 0);
    p.onPathsChange?.(item ? readPathData(item, p.mode) : []);
  }, [outlines]);

  const recordEdit = useCallback(() => {
    const item = outlines();
    if (!item) return;
    historyRef.current = pushHistory(historyRef.current, item.exportJSON());
    notify();
  }, [notify, outlines]);

  const restore = useCallback((json: string) => {
    const scope = scopeRef.current;
    if (!scope) return;
    scope.activate();
    outlines()?.remove();
    const item = scope.project.importJSON(json) as paper.Item;
    item.name = OUTLINES;
    placeAboveRaster(scope, item);
    applyOutlineStyle(item, propsRef.current.style);
    scope.view.update();
    notify();
  }, [notify, outlines]);

  const move = useCallback((step: (h: HistoryState) => HistoryState) => {
    const next = step(historyRef.current);
    if (next === historyRef.current) return;
    historyRef.current = next;
    const snapshot = currentSnapshot(next);
    if (snapshot) restore(snapshot);
  }, [restore]);

  const undo = useCallback(() => move(undoHistory), [move]);
  const redo = useCallback(() => move(redoHistory), [move]);

  useImperativeHandle(ref, () => ({
    undo,
    redo,
    getPathData: () => {
      const item = outlines();
      return item ? readPathData(item, propsRef.current.mode) : [];
    },
    getBounds: () => {
      const item = outlines();
      if (!item || item.isEmpty()) return null;
      const b = item.bounds;
      return { x: b.x, y: b.y, width: b.width, height: b.height };
    },
    getCurveSets: () => {
      const item = outlines();
      return item ? readCurveSets(item) : [];
    },
    getImage: () => {
      const raster = scopeRef.current?.project.getItem({ name: RASTER }) as paper.Raster | null;
      return raster?.image instanceof HTMLImageElement ? raster.image : null;
    },
  }), [undo, redo, outlines]);

  // 1. 建立 scope、編輯工具與尺寸追蹤（只做一次）
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const scope = new paper.PaperScope();
    scope.setup(canvas);
    scopeRef.current = scope;
    const tool = attachEditTool(scope, recordEdit);

    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width === 0 || height === 0) return;
      scope.view.viewSize = new paper.Size(width, height);
      const pending = pendingFitRef.current;
      if (pending && fitView(scope, pending.w, pending.h)) pendingFitRef.current = null;
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      tool.remove();
      scope.project.remove();
      scopeRef.current = null;
    };
  }, [recordEdit]);

  // 2. 換圖時重新載入底圖並縮放
  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope) return;
    scope.activate();
    scope.project.getItem({ name: RASTER })?.remove();
    const raster = new scope.Raster(imageUrl);
    raster.name = RASTER;
    raster.locked = true;
    raster.opacity = propsRef.current.style.showOriginal ? 1 : DIMMED_IMAGE_OPACITY;
    raster.onLoad = () => {
      raster.position = new paper.Point(widthPx / 2, heightPx / 2);
      raster.sendToBack();
      pendingFitRef.current = fitView(scope, widthPx, heightPx) ? null : { w: widthPx, h: heightPx };
    };
  }, [imageUrl, widthPx, heightPx]);

  // 3. 幾何結果或平滑度改變：重新產生路徑並重設歷史
  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope) return;
    outlines()?.remove();
    if (!polygons) {
      historyRef.current = EMPTY_HISTORY;
      notify();
      return;
    }
    const item = buildOutlineItem(scope, polygons, mode, smoothness);
    placeAboveRaster(scope, item);
    applyOutlineStyle(item, propsRef.current.style);
    historyRef.current = resetHistory(item.exportJSON());
    notify();
  }, [polygons, smoothness, mode, notify, outlines]);

  // 4. 只改外觀：不重新產生
  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope) return;
    const raster = scope.project.getItem({ name: RASTER });
    if (raster) raster.opacity = style.showOriginal ? 1 : DIMMED_IMAGE_OPACITY;
    const item = outlines();
    if (item) applyOutlineStyle(item, style);
  }, [style, outlines]);

  // 5. 參考線（白墨頁顯示刀模）
  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope) return;
    scope.project.getItem({ name: REFERENCE })?.remove();
    if (referencePaths && referencePaths.length > 0) buildReferenceItem(scope, referencePaths);
  }, [referencePaths]);

  // 6. 作用中分頁的快捷鍵
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z' || isTypingTarget(e.target)) return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, undo, redo]);

  return (
    <div ref={containerRef} className="absolute inset-0" data-testid={testId}>
      <canvas ref={canvasRef} className="block w-full h-full cursor-crosshair" />
    </div>
  );
});

PathEditorCanvas.displayName = 'PathEditorCanvas';
export default PathEditorCanvas;
```

- [ ] **Step 9：驗證**

這個元件在 Task 3.5 才會接上畫面，這一步只確認型別與 build。

Run: `npm run typecheck && npm test && npm run build`
Expected: 全部通過。（型別來自 paper 自帶的 `node_modules/paper/dist/paper.d.ts`，上面用到的成員都已確認存在。）

- [ ] **Step 10：Commit**

```bash
git add src/types.ts src/editor/keyboard.ts src/editor/keyboard.test.ts src/editor/paperItems.ts src/editor/editTool.ts src/editor/PathEditorCanvas.tsx
git commit -m "feat: add shared PathEditorCanvas with per-scope history and shortcuts

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3.4：來源圖片與幾何 hooks

**Files:**
- Create: `src/utils/id.ts`、`src/source/sourceModel.ts`、`src/source/loadImageVersion.ts`
- Create: `src/hooks/useDebouncedValue.ts`、`src/hooks/useGeometryClient.ts`、`src/hooks/useWorkerImage.ts`、`src/hooks/useGeometry.ts`、`src/hooks/useSourceImage.ts`
- Test: `src/utils/id.test.ts`、`src/source/sourceModel.test.ts`
- Modify: `vitest.config.ts`（coverage include 加上 `src/source/sourceModel.ts`）
- Modify: `src/App.tsx`（移除 Task 2.7 暫時加的 `void createGeometryClient;` 那兩行）

**Interfaces:**
- Consumes：`GeometryClient`、`createGeometryClient`、`JobParams` from `geometry/client.ts`；`AlphaImage`、`GeometryResult`、`GeometryJobKind`；`readDpiFromBlob`；`extractAlpha`、`hasTransparency`；`loadImage` from `utils/imageProcessing.ts`
- Produces：
  ```ts
  // utils/id.ts
  export const newId: () => string
  // source/sourceModel.ts
  export type DpiSource = 'metadata' | 'default' | 'manual';
  export interface ImageVersion { versionId: string; blob: Blob; url: string; widthPx: number; heightPx: number; dpi: number; dpiSource: DpiSource; alpha: AlphaImage; transparent: boolean }
  export interface SourceImage { id: string; name: string; current: ImageVersion; original: ImageVersion | null }
  export const LARGE_IMAGE_PIXELS = 40_000_000;
  export const fileStem: (filename: string) => string
  export const scaleDpiForWidth: (dpi: number, oldWidthPx: number, newWidthPx: number) => number
  export const withManualDpi: (source: SourceImage, dpi: number) => SourceImage
  export const isLargeImage: (v: ImageVersion) => boolean
  // source/loadImageVersion.ts
  export async function loadImageVersion(blob: Blob, defaultDpi: number): Promise<ImageVersion>
  // hooks
  export function useDebouncedValue<T>(value: T, delayMs: number): T
  export function useGeometryClient(): GeometryClient | null
  export function useWorkerImage(client: GeometryClient | null, version: ImageVersion | null): string | null // 回傳 worker 已載入的 versionId
  export type GeometryStatus = 'idle' | 'processing' | 'ready' | 'error';
  export interface GeometryState { status: GeometryStatus; result: GeometryResult | null; error: string | null }
  export function useGeometry<K extends GeometryJobKind>(client: GeometryClient | null, kind: K, imageId: string | null, params: JobParams[K] | null, delayMs?: number): GeometryState
  export interface SourceImageApi { source: SourceImage | null; loading: boolean; error: string | null; upload(file: File): Promise<void>; setDpi(dpi: number): void; replaceCurrent(blob: Blob): Promise<void>; revertToOriginal(): void }
  export function useSourceImage(defaultDpi: number): SourceImageApi
  ```
  `params` 為 `null` 時不計算（白墨頁還沒開過時使用）。換圖時 `result` 先清成 `null`，畫布不會殘留上一張圖的路徑。

**Object URL 的擁有權：** `SourceImage` 的 URL 由 `useSourceImage` 管理，被取代時會 revoke。送到 Imposition 的圖層（第 5 階段）要自己用 `blob` 建新的 URL，不能共用。

- [ ] **Step 1：寫失敗的測試**

`src/utils/id.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { newId } from './id';

describe('newId', () => {
  it('returns distinct non-empty strings', () => {
    const ids = new Set(Array.from({ length: 100 }, newId));
    expect(ids.size).toBe(100);
    expect([...ids].every(id => id.length > 0)).toBe(true);
  });
});
```

`src/source/sourceModel.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { fileStem, isLargeImage, scaleDpiForWidth, withManualDpi, type ImageVersion, type SourceImage } from './sourceModel';

const version = (overrides: Partial<ImageVersion> = {}): ImageVersion => ({
  versionId: 'v1',
  blob: new Blob(),
  url: 'blob:v1',
  widthPx: 3000,
  heightPx: 2000,
  dpi: 300,
  dpiSource: 'metadata',
  alpha: { width: 1, height: 1, alpha: new Uint8ClampedArray([255]) },
  transparent: false,
  ...overrides,
});

describe('sourceModel', () => {
  it('strips the extension from filenames', () => {
    expect(fileStem('cat.png')).toBe('cat');
    expect(fileStem('my.cat.v2.jpg')).toBe('my.cat.v2');
    expect(fileStem('noext')).toBe('noext');
  });

  it('scales dpi to keep the physical size', () => {
    expect(scaleDpiForWidth(300, 3000, 600)).toBe(60);
    expect(scaleDpiForWidth(300, 3000, 3000)).toBe(300);
  });

  it('sets a manual dpi without mutating the source', () => {
    const source: SourceImage = { id: 's', name: 'cat', current: version(), original: null };
    const next = withManualDpi(source, 150);
    expect(next.current.dpi).toBe(150);
    expect(next.current.dpiSource).toBe('manual');
    expect(source.current.dpi).toBe(300);
  });

  it('flags images above 40 MP', () => {
    expect(isLargeImage(version({ widthPx: 8000, heightPx: 5000 }))).toBe(false);
    expect(isLargeImage(version({ widthPx: 8000, heightPx: 5001 }))).toBe(true);
  });
});
```

- [ ] **Step 2：確認測試失敗**

Run: `npx vitest run src/utils/id.test.ts src/source`
Expected: FAIL，兩個檔案都是 `Failed to resolve import`

- [ ] **Step 3：實作 `src/utils/id.ts` 與 `src/source/sourceModel.ts`**

`src/utils/id.ts`：

```ts
export const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
```

`src/source/sourceModel.ts`：

```ts
import type { AlphaImage } from '../geometry/types';

export type DpiSource = 'metadata' | 'default' | 'manual';

export interface ImageVersion {
  versionId: string;
  blob: Blob;
  url: string;
  widthPx: number;
  heightPx: number;
  dpi: number;
  dpiSource: DpiSource;
  alpha: AlphaImage;
  transparent: boolean;
}

export interface SourceImage {
  /** 上傳時產生，去背或還原都不變；Imposition 用它對應同一個來源 */
  id: string;
  name: string;
  current: ImageVersion;
  /** 去背前的原圖；沒有去背時為 null */
  original: ImageVersion | null;
}

export const LARGE_IMAGE_PIXELS = 40_000_000;

export const fileStem = (filename: string): string => filename.replace(/\.[^.]+$/, '');

export const scaleDpiForWidth = (dpi: number, oldWidthPx: number, newWidthPx: number): number =>
  (dpi * newWidthPx) / oldWidthPx;

export const withManualDpi = (source: SourceImage, dpi: number): SourceImage => ({
  ...source,
  current: { ...source.current, dpi, dpiSource: 'manual' },
});

export const isLargeImage = (v: ImageVersion): boolean => v.widthPx * v.heightPx > LARGE_IMAGE_PIXELS;
```

- [ ] **Step 4：確認測試通過**

Run: `npx vitest run src/utils/id.test.ts src/source`
Expected: PASS（id 1、sourceModel 4）

- [ ] **Step 5：coverage 加上 sourceModel**

在 `vitest.config.ts` 的 `coverage.include` 陣列加入 `'src/source/sourceModel.ts',`。

- [ ] **Step 6：實作圖片載入 `src/source/loadImageVersion.ts`**

```ts
import { extractAlpha, hasTransparency } from '../utils/alpha';
import { readDpiFromBlob } from '../utils/dpi';
import { newId } from '../utils/id';
import { loadImage } from '../utils/imageProcessing';
import type { ImageVersion } from './sourceModel';

export async function loadImageVersion(blob: Blob, defaultDpi: number): Promise<ImageVersion> {
  const url = URL.createObjectURL(blob);
  try {
    const [img, metadataDpi] = await Promise.all([loadImage(url), readDpiFromBlob(blob)]);
    const alpha = extractAlpha(img);
    return {
      versionId: newId(),
      blob,
      url,
      widthPx: alpha.width,
      heightPx: alpha.height,
      dpi: metadataDpi ?? defaultDpi,
      dpiSource: metadataDpi ? 'metadata' : 'default',
      alpha,
      transparent: hasTransparency(alpha.alpha),
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}
```

- [ ] **Step 7：實作 hooks**

`src/hooks/useDebouncedValue.ts`：

```ts
import { useEffect, useState } from 'react';

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
```

`src/hooks/useGeometryClient.ts`：

```ts
import { useEffect, useState } from 'react';
import { createGeometryClient, type GeometryClient } from '../geometry/client';

export function useGeometryClient(): GeometryClient | null {
  const [client, setClient] = useState<GeometryClient | null>(null);
  useEffect(() => {
    const created = createGeometryClient();
    setClient(created);
    return () => created.terminate();
  }, []);
  return client;
}
```

`src/hooks/useWorkerImage.ts`：

```ts
import { useEffect, useState } from 'react';
import type { GeometryClient } from '../geometry/client';
import type { ImageVersion } from '../source/sourceModel';

/** 把目前的圖片版本送進 worker，回傳 worker 已載入的 versionId */
export function useWorkerImage(client: GeometryClient | null, version: ImageVersion | null): string | null {
  const [readyId, setReadyId] = useState<string | null>(null);
  const versionId = version?.versionId ?? null;
  const alpha = version?.alpha ?? null;

  useEffect(() => {
    if (!client || !versionId || !alpha) {
      setReadyId(null);
      return;
    }
    client.setImage(versionId, alpha);
    setReadyId(versionId);
    return () => client.dropImage(versionId);
  }, [client, versionId, alpha]);

  return readyId;
}
```

`src/hooks/useGeometry.ts`：

```ts
import { useEffect, useState } from 'react';
import type { GeometryClient, JobParams } from '../geometry/client';
import type { GeometryJobKind, GeometryResult } from '../geometry/types';
import { useDebouncedValue } from './useDebouncedValue';

export type GeometryStatus = 'idle' | 'processing' | 'ready' | 'error';

export interface GeometryState {
  status: GeometryStatus;
  result: GeometryResult | null;
  error: string | null;
}

const IDLE: GeometryState = { status: 'idle', result: null, error: null };
export const GEOMETRY_DEBOUNCE_MS = 150;

export function useGeometry<K extends GeometryJobKind>(
  client: GeometryClient | null,
  kind: K,
  imageId: string | null,
  params: JobParams[K] | null,
  delayMs = GEOMETRY_DEBOUNCE_MS,
): GeometryState {
  const debounced = useDebouncedValue(params, delayMs);
  const [state, setState] = useState<GeometryState>(IDLE);

  // 換圖時先清掉上一張圖的結果
  useEffect(() => setState(IDLE), [imageId]);

  useEffect(() => {
    if (!client || !imageId || !debounced) return;
    let cancelled = false;
    setState(s => ({ ...s, status: 'processing' }));
    client
      .run(kind, imageId, debounced)
      .then(result => {
        if (!cancelled && result) setState({ status: 'ready', result, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error('幾何運算失敗', err);
        const message = err instanceof Error ? err.message : String(err);
        setState(s => ({ status: 'error', result: s.result, error: message }));
      });
    return () => {
      cancelled = true;
    };
  }, [client, kind, imageId, debounced]);

  return state;
}
```

`src/hooks/useSourceImage.ts`：

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadImageVersion } from '../source/loadImageVersion';
import {
  fileStem,
  scaleDpiForWidth,
  withManualDpi,
  type ImageVersion,
  type SourceImage,
} from '../source/sourceModel';
import { newId } from '../utils/id';

export interface SourceImageApi {
  source: SourceImage | null;
  loading: boolean;
  error: string | null;
  upload(file: File): Promise<void>;
  setDpi(dpi: number): void;
  replaceCurrent(blob: Blob): Promise<void>;
  revertToOriginal(): void;
}

const LOAD_ERROR = '無法載入圖片，請確認檔案是 PNG、JPG 或 WebP。';

const revoke = (v: ImageVersion | null | undefined) => {
  if (v) URL.revokeObjectURL(v.url);
};

export function useSourceImage(defaultDpi: number): SourceImageApi {
  const [source, setSource] = useState<SourceImage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sourceRef = useRef<SourceImage | null>(null);
  sourceRef.current = source;

  // unmount 時釋放所有 URL
  useEffect(() => () => {
    revoke(sourceRef.current?.current);
    revoke(sourceRef.current?.original);
  }, []);

  const run = useCallback(async (task: () => Promise<void>) => {
    setLoading(true);
    setError(null);
    try {
      await task();
    } catch (err) {
      console.error('載入圖片失敗', err);
      setError(LOAD_ERROR);
    } finally {
      setLoading(false);
    }
  }, []);

  const upload = useCallback((file: File) => run(async () => {
    const version = await loadImageVersion(file, defaultDpi);
    const previous = sourceRef.current;
    setSource({ id: newId(), name: fileStem(file.name), current: version, original: null });
    revoke(previous?.current);
    revoke(previous?.original);
  }), [defaultDpi, run]);

  const replaceCurrent = useCallback((blob: Blob) => run(async () => {
    const previous = sourceRef.current;
    if (!previous) return;
    const loaded = await loadImageVersion(blob, defaultDpi);
    const prev = previous.current;
    const version: ImageVersion = {
      ...loaded,
      dpi: scaleDpiForWidth(prev.dpi, prev.widthPx, loaded.widthPx),
      dpiSource: prev.dpiSource,
    };
    setSource({ ...previous, current: version, original: previous.original ?? prev });
    // 已經去背過一次時，被取代的是中間版本，可以釋放
    if (previous.original) revoke(prev);
  }), [defaultDpi, run]);

  const revertToOriginal = useCallback(() => {
    const previous = sourceRef.current;
    if (!previous?.original) return;
    setSource({ ...previous, current: previous.original, original: null });
    revoke(previous.current);
  }, []);

  const setDpi = useCallback((dpi: number) => {
    setSource(s => (s ? withManualDpi(s, dpi) : s));
  }, []);

  return { source, loading, error, upload, setDpi, replaceCurrent, revertToOriginal };
}
```

- [ ] **Step 8：移除 Task 2.7 的暫時 import**

刪除 `src/App.tsx` 頂端這兩行（Task 3.5 會透過 `useGeometryClient` 正式使用）：

```ts
import { createGeometryClient } from './geometry/client';
void createGeometryClient;
```

- [ ] **Step 9：驗證**

hooks 還沒接上畫面，這一步確認型別與 build。Worker 在這一步會暫時不被打包，Task 3.5 接上 `useGeometryClient` 後就會回來。

Run: `npm run typecheck && npm test && npm run build`
Expected: 全部通過。

- [ ] **Step 10：Commit**

```bash
git add vitest.config.ts src/App.tsx src/utils/id.ts src/utils/id.test.ts src/source src/hooks
git commit -m "feat: add source image and geometry hooks

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3.5：面板、Sidebar 與 App 串接

這個 task 把所有東西接起來，完成後 Editor 分頁使用新的幾何引擎。步驟較多但只有一個 commit，因為中間狀態無法運作。

**Files:**
- Create: `src/components/panels/fields.tsx`、`src/components/panels/EditSection.tsx`、`src/components/panels/StylePanel.tsx`、`src/components/panels/SourcePanel.tsx`、`src/components/panels/CutlinePanel.tsx`
- Create: `src/components/ConfirmDialog.tsx`、`src/editor/useRegenerateGuard.ts`、`src/components/GeometryView.tsx`、`src/components/Sidebar.tsx`
- Modify: `src/App.tsx`（改寫）、`src/types.ts`（刪除 `AppState`、`DEFAULT_STATE`，`ActiveTab` 加入 `'underprint'`）、`src/utils/imageProcessing.ts`（只留 `loadImage`）
- Delete: `src/components/Controls.tsx`、`src/components/EditorCanvas.tsx`

**Interfaces:**
- Consumes：前面 task 的所有 hooks、`PathEditorCanvas`、`buildAlignedSvg`、`buildTrimmedCutSvg`、`exportCutPdf`、`downloadText`、`DEFAULT_CUTLINE_PARAMS`、`cutlineParamsToPx`、`DEFAULT_CUT_STYLE`
- Produces（第 4–6 階段會用到）：
  ```ts
  // components/panels/fields.tsx
  export function Section(p: { title: string; aside?: ReactNode; children: ReactNode }): JSX.Element
  export function SliderField(p: { label: string; value: number; min: number; max: number; step: number; display?: string; hint?: string; testId?: string; onChange(v: number): void }): JSX.Element
  export function ToggleField(p: { label: string; checked: boolean; testId?: string; onChange(v: boolean): void }): JSX.Element
  export function SelectField<T extends string>(p: { label: string; value: T; options: readonly { value: T; label: string }[]; testId?: string; onChange(v: T): void }): JSX.Element
  export function ColorOpacityField(p: { label: string; color: string; opacity: number; onColorChange(c: string): void; onOpacityChange(o: number): void }): JSX.Element
  export function ActionButton(p: { children: ReactNode; onClick(): void; disabled?: boolean; variant?: 'primary' | 'secondary'; testId?: string; title?: string }): JSX.Element
  export function InfoRow(p: { label: string; value: ReactNode; testId?: string }): JSX.Element
  export function Warnings(p: { messages: readonly string[] }): JSX.Element | null
  // components/panels/EditSection.tsx
  export function EditSection(p: { canUndo: boolean; canRedo: boolean; onUndo(): void; onRedo(): void; segmentCount: number; nodeCountTestId: string; children?: ReactNode }): JSX.Element
  // components/panels/StylePanel.tsx
  export function StylePanel(p: { style: DisplayStyle; onChange(s: DisplayStyle): void; children?: ReactNode }): JSX.Element
  // editor/useRegenerateGuard.ts
  export interface RegenerateGuard { guard(affected: readonly string[], action: () => void): void; dialog: ConfirmDialogProps }
  export function useRegenerateGuard(): RegenerateGuard
  // components/GeometryView.tsx
  export function GeometryView(p: GeometryViewProps): JSX.Element   // 見 Step 4
  // src/types.ts
  export type ActiveTab = 'editor' | 'underprint' | 'imposition';
  ```
  第 6 階段會把 `ActiveTab` 再加上 `'settings'`。

- [ ] **Step 1：共用表單元件 `src/components/panels/fields.tsx`**

```tsx
import React from 'react';

export function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-neutral-200 font-semibold text-xs uppercase tracking-wider">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

interface SliderFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display?: string;
  hint?: string;
  testId?: string;
  onChange: (value: number) => void;
}

export function SliderField({ label, value, min, max, step, display, hint, testId, onChange }: SliderFieldProps) {
  return (
    <label className="block space-y-1">
      <span className="flex justify-between text-xs">
        <span className="text-neutral-400">{label}</span>
        <span className="text-blue-400 font-mono">{display ?? value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        data-testid={testId}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1 bg-neutral-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
      />
      {hint ? <span className="block text-[10px] text-neutral-500">{hint}</span> : null}
    </label>
  );
}

export function ToggleField({ label, checked, testId, onChange }: { label: string; checked: boolean; testId?: string; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 p-2 bg-neutral-700/30 rounded border border-neutral-700 text-xs">
      <span className="text-neutral-300">{label}</span>
      <input type="checkbox" className="h-4 w-4" checked={checked} data-testid={testId} onChange={e => onChange(e.target.checked)} />
    </label>
  );
}

interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  testId?: string;
  onChange: (v: T) => void;
}

export function SelectField<T extends string>({ label, value, options, testId, onChange }: SelectFieldProps<T>) {
  return (
    <label className="block space-y-1 text-xs">
      <span className="text-neutral-400">{label}</span>
      <select
        value={value}
        data-testid={testId}
        onChange={e => onChange(e.target.value as T)}
        className="w-full px-2 py-1 rounded bg-neutral-700 border border-neutral-600 text-white"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

interface ColorOpacityFieldProps {
  label: string;
  color: string;
  opacity: number;
  onColorChange: (c: string) => void;
  onOpacityChange: (o: number) => void;
}

export function ColorOpacityField({ label, color, opacity, onColorChange, onOpacityChange }: ColorOpacityFieldProps) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center text-xs">
        <span className="text-neutral-400">{label}</span>
        <span className="text-[10px] text-neutral-500 font-mono">{Math.round(opacity * 100)}%</span>
      </div>
      <div className="flex items-center gap-3">
        <input type="color" value={color} onChange={e => onColorChange(e.target.value)} className="w-8 h-8 rounded bg-transparent border-none cursor-pointer shrink-0" />
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={opacity}
          onChange={e => onOpacityChange(Number(e.target.value))}
          className="flex-1 h-1 bg-neutral-600 rounded-lg appearance-none cursor-pointer accent-neutral-400"
        />
      </div>
    </div>
  );
}

interface ActionButtonProps {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
  testId?: string;
  title?: string;
}

export function ActionButton({ children, onClick, disabled, variant = 'secondary', testId, title }: ActionButtonProps) {
  const color = variant === 'primary' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-neutral-700 hover:bg-neutral-600';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-testid={testId}
      className={`w-full flex items-center justify-center gap-2 py-2 rounded text-xs text-white transition disabled:opacity-30 disabled:cursor-not-allowed ${color}`}
    >
      {children}
    </button>
  );
}

export function InfoRow({ label, value, testId }: { label: string; value: React.ReactNode; testId?: string }) {
  return (
    <div className="flex items-center justify-between p-2 bg-neutral-700/30 rounded border border-neutral-700 text-xs">
      <span className="text-neutral-400">{label}</span>
      <span className="text-white font-mono" data-testid={testId}>{value}</span>
    </div>
  );
}

export function Warnings({ messages }: { messages: readonly string[] }) {
  if (messages.length === 0) return null;
  return (
    <ul className="p-2 rounded bg-amber-900/30 border border-amber-700 text-[11px] text-amber-200 space-y-1" data-testid="warnings">
      {messages.map(m => (
        <li key={m}>{m}</li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2：確認視窗與 guard**

`src/components/ConfirmDialog.tsx`：

```tsx
import React, { useEffect } from 'react';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, message, confirmLabel, cancelLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60">
      <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="w-96 max-w-[90vw] rounded-lg bg-neutral-800 border border-neutral-600 p-5 space-y-4 shadow-2xl">
        <h2 id="confirm-title" className="text-white font-semibold">{title}</h2>
        <p className="text-sm text-neutral-300">{message}</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} data-testid="cancel-overwrite" className="px-3 py-1.5 rounded text-sm bg-neutral-700 hover:bg-neutral-600 text-white">
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} data-testid="confirm-overwrite" className="px-3 py-1.5 rounded text-sm bg-red-600 hover:bg-red-500 text-white">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
```

`src/editor/useRegenerateGuard.ts`：

```ts
import { useCallback, useState } from 'react';
import type { ConfirmDialogProps } from '../components/ConfirmDialog';
import { buildOverwriteMessage } from './guardMessage';

interface Pending {
  affected: readonly string[];
  action: () => void;
}

export interface RegenerateGuard {
  /** affected 為會被覆蓋的分頁名稱；空陣列時直接執行 */
  guard(affected: readonly string[], action: () => void): void;
  dialog: ConfirmDialogProps;
}

export function useRegenerateGuard(): RegenerateGuard {
  const [pending, setPending] = useState<Pending | null>(null);

  const guard = useCallback((affected: readonly string[], action: () => void) => {
    if (affected.length === 0) action();
    // 拖拉桿時會連續觸發，保留最後一次的值
    else setPending({ affected, action });
  }, []);

  const onCancel = useCallback(() => setPending(null), []);
  const onConfirm = useCallback(() => {
    pending?.action();
    setPending(null);
  }, [pending]);

  return {
    guard,
    dialog: {
      open: pending !== null,
      title: '覆蓋手動編輯？',
      message: pending ? buildOverwriteMessage(pending.affected) : '',
      confirmLabel: '覆蓋並套用',
      cancelLabel: '取消',
      onConfirm,
      onCancel,
    },
  };
}
```

- [ ] **Step 3：編輯區與外觀面板**

`src/components/panels/EditSection.tsx`：

```tsx
import { RotateCcw, RotateCw } from 'lucide-react';
import React from 'react';
import { InfoRow, Section } from './fields';

interface EditSectionProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  segmentCount: number;
  nodeCountTestId: string;
  children?: React.ReactNode;
}

const buttonClass =
  'flex-1 flex items-center justify-center gap-2 py-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded text-xs transition disabled:opacity-30 disabled:cursor-not-allowed';

export function EditSection({ canUndo, canRedo, onUndo, onRedo, segmentCount, nodeCountTestId, children }: EditSectionProps) {
  return (
    <Section title="路徑編輯">
      <div className="flex gap-2">
        <button type="button" onClick={onUndo} disabled={!canUndo} className={buttonClass} title="Undo (Ctrl/Cmd+Z)">
          <RotateCcw className="w-3 h-3" /> Undo
        </button>
        <button type="button" onClick={onRedo} disabled={!canRedo} className={buttonClass} title="Redo (Ctrl/Cmd+Shift+Z)">
          <RotateCw className="w-3 h-3" /> Redo
        </button>
      </div>
      {children}
      <InfoRow label="節點數" value={segmentCount} testId={nodeCountTestId} />
    </Section>
  );
}
```

`src/components/panels/StylePanel.tsx`：

```tsx
import React from 'react';
import type { DisplayStyle } from '../../types';
import { ColorOpacityField, Section, SliderField, ToggleField } from './fields';

interface StylePanelProps {
  style: DisplayStyle;
  onChange: (style: DisplayStyle) => void;
  children?: React.ReactNode;
}

export function StylePanel({ style, onChange, children }: StylePanelProps) {
  const set = <K extends keyof DisplayStyle>(key: K, value: DisplayStyle[K]) => onChange({ ...style, [key]: value });
  return (
    <Section title="外觀（只影響預覽）">
      <ToggleField label="顯示原圖" checked={style.showOriginal} onChange={v => set('showOriginal', v)} />
      <ToggleField label="顯示可編輯節點" checked={style.showPoints} onChange={v => set('showPoints', v)} />
      {children}
      <ColorOpacityField
        label="描邊顏色與透明度"
        color={style.strokeColor}
        opacity={style.strokeOpacity}
        onColorChange={c => set('strokeColor', c)}
        onOpacityChange={o => set('strokeOpacity', o)}
      />
      <ColorOpacityField
        label="填色與透明度"
        color={style.fillColor}
        opacity={style.fillOpacity}
        onColorChange={c => set('fillColor', c)}
        onOpacityChange={o => set('fillOpacity', o)}
      />
      <SliderField label="描邊寬度" value={style.strokeWidth} min={1} max={10} step={1} display={`${style.strokeWidth}px`} onChange={v => set('strokeWidth', v)} />
    </Section>
  );
}
```

- [ ] **Step 4：畫布外層 `src/components/GeometryView.tsx`**

```tsx
import React from 'react';
import PathEditorCanvas, { type OutlineMode, type PathEditorHandle } from '../editor/PathEditorCanvas';
import type { GeometryState } from '../hooks/useGeometry';
import type { SourceImage } from '../source/sourceModel';
import type { DisplayStyle, PathData } from '../types';

export interface GeometryViewProps {
  source: SourceImage | null;
  geometry: GeometryState;
  editorRef: React.Ref<PathEditorHandle>;
  mode: OutlineMode;
  style: DisplayStyle;
  smoothness: number;
  referencePaths?: readonly PathData[];
  active: boolean;
  testId: string;
  onHistoryChange: (canUndo: boolean, canRedo: boolean) => void;
  onSegmentCount: (count: number) => void;
  onDirtyChange: (dirty: boolean) => void;
  onPathsChange: (paths: PathData[]) => void;
}

function EmptyState() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-500 pointer-events-none">
      <div className="w-24 h-24 mb-4 border-2 border-dashed border-neutral-700 rounded-xl flex items-center justify-center opacity-50">
        <span className="text-4xl">🖼️</span>
      </div>
      <p className="text-lg font-medium">尚未載入圖片</p>
      <p className="text-sm opacity-60">上傳 PNG、JPG 或 WebP 開始產生路徑。</p>
    </div>
  );
}

export function GeometryView(props: GeometryViewProps) {
  const { source, geometry, editorRef, testId, ...editorProps } = props;
  if (!source) return <EmptyState />;
  const { current } = source;
  return (
    <div className="absolute inset-0">
      <PathEditorCanvas
        ref={editorRef}
        imageUrl={current.url}
        widthPx={current.widthPx}
        heightPx={current.heightPx}
        polygons={geometry.result?.polygons ?? null}
        testId={testId}
        {...editorProps}
      />
      <div
        className="absolute top-3 right-3 px-2 py-1 rounded bg-black/60 text-xs text-white pointer-events-none"
        data-testid={`${testId}-status`}
        data-status={geometry.status}
      >
        {geometry.status === 'processing' ? '計算中…' : geometry.status === 'error' ? '產生路徑失敗' : ''}
      </div>
      {geometry.error ? (
        <div className="absolute bottom-3 left-3 right-3 p-2 rounded bg-red-900/70 text-xs text-red-100">{geometry.error}</div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5：來源圖片面板 `src/components/panels/SourcePanel.tsx`**

去背按鈕在第 6 階段加入；這裡先顯示「沒有透明背景」的警告文字。

```tsx
import { Upload } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { isLargeImage, type DpiSource, type SourceImage } from '../../source/sourceModel';
import { DPI_MAX, DPI_MIN, formatMm, isValidDpi, pxToMm } from '../../units';
import { Section, Warnings } from './fields';

const DPI_SOURCE_LABEL: Record<DpiSource, string> = { metadata: '來自圖檔', default: '預設值', manual: '手動' };

interface SourcePanelProps {
  source: SourceImage | null;
  loading: boolean;
  error: string | null;
  onUpload: (file: File) => void;
  onDpiChange: (dpi: number) => void;
  children?: React.ReactNode; // 第 6 階段放去背按鈕
}

function DpiField({ dpi, source, onCommit }: { dpi: number; source: DpiSource; onCommit: (dpi: number) => void }) {
  const shown = String(Number(dpi.toFixed(1)));
  const [draft, setDraft] = useState(shown);
  useEffect(() => setDraft(shown), [shown]);

  const commit = () => {
    const value = Number(draft);
    if (isValidDpi(value) && value !== dpi) onCommit(value);
    else setDraft(shown);
  };

  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      <span className="text-neutral-400">DPI（{DPI_SOURCE_LABEL[source]}）</span>
      <input
        type="number"
        min={DPI_MIN}
        max={DPI_MAX}
        value={draft}
        data-testid="source-dpi"
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
        }}
        className="w-24 px-2 py-1 rounded bg-neutral-700 border border-neutral-600 text-white text-right"
      />
    </label>
  );
}

export function SourcePanel({ source, loading, error, onUpload, onDpiChange, children }: SourcePanelProps) {
  const v = source?.current;
  const warnings = [
    ...(v && !v.transparent ? ['此圖沒有透明背景，無法產生輪廓。'] : []),
    ...(v && isLargeImage(v) ? ['圖片很大，處理可能較慢。'] : []),
    ...(v && v.dpi < DPI_MIN ? ['有效 DPI 偏低，印刷可能不夠清晰。'] : []),
    ...(error ? [error] : []),
  ];

  return (
    <Section title="來源圖片">
      <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-neutral-600 rounded-lg hover:border-blue-500 hover:bg-neutral-700/50 transition cursor-pointer">
        <Upload className="w-6 h-6 mb-1 text-neutral-500" />
        <span className="text-xs text-neutral-400">{loading ? '載入中…' : '點擊上傳 PNG／JPG／WebP'}</span>
        <input
          type="file"
          className="hidden"
          accept="image/png,image/jpeg,image/webp"
          data-testid="source-upload"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) onUpload(file);
            e.target.value = '';
          }}
        />
      </label>
      {v && source ? (
        <div className="space-y-2">
          <div className="text-xs text-neutral-300 truncate" title={source.name}>{source.name}</div>
          <div className="text-[11px] text-neutral-500">
            {v.widthPx} × {v.heightPx} px ／ {formatMm(pxToMm(v.widthPx, v.dpi))} × {formatMm(pxToMm(v.heightPx, v.dpi))}
          </div>
          <DpiField dpi={v.dpi} source={v.dpiSource} onCommit={onDpiChange} />
        </div>
      ) : null}
      {children}
      <Warnings messages={warnings} />
    </Section>
  );
}
```

注意：`e.target.value = ''` 讓同一個檔案可以再次上傳；這是對 DOM input 的必要操作，不違反不可變原則。

- [ ] **Step 6：刀模面板 `src/components/panels/CutlinePanel.tsx`**

```tsx
import { Download, FileText, Send } from 'lucide-react';
import React from 'react';
import type { CutlineParams, CutlineMode, BridgeMode } from '../../geometry/types';
import type { GeometryState } from '../../hooks/useGeometry';
import type { DisplayStyle } from '../../types';
import { formatMm, pxToMm } from '../../units';
import { EditSection } from './EditSection';
import { ActionButton, InfoRow, Section, SelectField, SliderField, ToggleField, Warnings } from './fields';
import { StylePanel } from './StylePanel';

const MODE_OPTIONS: readonly { value: CutlineMode; label: string }[] = [
  { value: 'precise', label: '精確距離' },
  { value: 'legacy', label: '舊模式（模糊＋門檻）' },
];

const BRIDGE_OPTIONS: readonly { value: BridgeMode; label: string }[] = [
  { value: 'auto', label: '自動' },
  { value: 'manual', label: '手動' },
];

export interface CutlinePanelProps {
  params: CutlineParams;
  onParamsChange: (next: CutlineParams) => void;
  geometry: GeometryState;
  dpi: number | null;
  hasSource: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  segmentCount: number;
  style: DisplayStyle;
  onStyleChange: (style: DisplayStyle) => void;
  onExportAligned: () => void;
  onExportTrimmed: () => void;
  onExportPdf: () => void;
  onSendToImposition?: () => void;
}

function GenerationSection({ params, onParamsChange }: Pick<CutlinePanelProps, 'params' | 'onParamsChange'>) {
  const set = <K extends keyof CutlineParams>(key: K, value: CutlineParams[K]) => onParamsChange({ ...params, [key]: value });
  return (
    <Section title="產生設定">
      <SelectField label="產生方式" value={params.mode} options={MODE_OPTIONS} testId="cut-mode" onChange={v => set('mode', v)} />
      {params.mode === 'precise' ? (
        <>
          <SliderField label="Alpha 門檻" value={params.alphaThreshold} min={1} max={254} step={1} onChange={v => set('alphaThreshold', v)} />
          <SliderField label="外擴距離" value={params.offsetMm} min={0} max={20} step={0.1} display={formatMm(params.offsetMm)} testId="cut-offset" onChange={v => set('offsetMm', v)} />
        </>
      ) : (
        <>
          <SliderField label="Blur" value={params.legacyBlurPx} min={0} max={50} step={1} display={`${params.legacyBlurPx}px`} onChange={v => set('legacyBlurPx', v)} />
          <SliderField label="Threshold" value={params.legacyThreshold} min={1} max={100} step={1} hint="數值越低外框越寬" onChange={v => set('legacyThreshold', v)} />
        </>
      )}
      <SliderField label="最小島面積" value={params.minIslandAreaMm2} min={0} max={50} step={0.1} display={`${params.minIslandAreaMm2.toFixed(1)} mm²`} onChange={v => set('minIslandAreaMm2', v)} />
      <ToggleField label="單一連通（刀模只有一圈）" checked={params.singleConnected} testId="cut-single" onChange={v => set('singleConnected', v)} />
      {params.singleConnected ? (
        <>
          <SelectField label="橋接半徑" value={params.bridgeMode} options={BRIDGE_OPTIONS} onChange={v => set('bridgeMode', v)} />
          {params.bridgeMode === 'manual' ? (
            <SliderField label="手動橋接半徑" value={params.bridgeRadiusMm} min={0} max={30} step={0.1} display={formatMm(params.bridgeRadiusMm)} onChange={v => set('bridgeRadiusMm', v)} />
          ) : (
            <SliderField label="自動橋接上限" value={params.bridgeMaxMm} min={1} max={50} step={0.5} display={formatMm(params.bridgeMaxMm)} onChange={v => set('bridgeMaxMm', v)} />
          )}
        </>
      ) : null}
    </Section>
  );
}

function StatusSection({ geometry, dpi }: { geometry: GeometryState; dpi: number | null }) {
  const stats = geometry.result?.stats;
  if (!stats || dpi === null) return null;
  return (
    <div className="space-y-2">
      <InfoRow label="區塊數" value={stats.islandCount} testId="cut-island-count" />
      {stats.bridgeRadiusPx !== undefined ? (
        <InfoRow label="橋接半徑" value={formatMm(pxToMm(stats.bridgeRadiusPx, dpi))} />
      ) : null}
      <Warnings messages={geometry.result?.warnings ?? []} />
    </div>
  );
}

export function CutlinePanel(props: CutlinePanelProps) {
  const { params, onParamsChange, geometry, dpi, hasSource } = props;
  const smoothHint = dpi ? `可能偏移約 ${formatMm(pxToMm(params.smoothness, dpi), 2)}` : undefined;
  return (
    <>
      <GenerationSection params={params} onParamsChange={onParamsChange} />
      <StatusSection geometry={geometry} dpi={dpi} />
      <EditSection
        canUndo={props.canUndo}
        canRedo={props.canRedo}
        onUndo={props.onUndo}
        onRedo={props.onRedo}
        segmentCount={props.segmentCount}
        nodeCountTestId="cut-node-count"
      >
        <SliderField label="平滑度" value={params.smoothness} min={0} max={20} step={0.5} hint={smoothHint} onChange={v => onParamsChange({ ...params, smoothness: v })} />
      </EditSection>
      <StylePanel style={props.style} onChange={props.onStyleChange} />
      <Section title="匯出">
        <ActionButton onClick={props.onExportAligned} disabled={!hasSource} testId="export-cut-aligned">
          <Download className="w-3 h-3" /> 匯出 SVG（對齊原圖）
        </ActionButton>
        <ActionButton onClick={props.onExportTrimmed} disabled={!hasSource} testId="export-cut-trimmed">
          <Download className="w-3 h-3" /> 匯出 SVG（裁切外框）
        </ActionButton>
        <ActionButton onClick={props.onExportPdf} disabled={!hasSource} testId="export-cut-pdf">
          <FileText className="w-3 h-3" /> 匯出 PDF
        </ActionButton>
        {props.onSendToImposition ? (
          <ActionButton variant="primary" onClick={props.onSendToImposition} disabled={!hasSource} testId="send-to-imposition-cut">
            <Send className="w-3 h-3" /> 送到 Imposition
          </ActionButton>
        ) : null}
      </Section>
    </>
  );
}
```

- [ ] **Step 7：Imposition 的舊程式先搬出 App 與 Controls（行為不變）**

`Controls.tsx` 與 `App.tsx` 都要刪除，但 Imposition 在第 5 階段才改寫。這一步只**搬移**，不改邏輯。

**7a.** 建立 `src/hooks/useImposition.ts`。把 `src/App.tsx` 中以下項目的程式碼**原封不動**搬進 hook 本體（Task 1.3 改名後的版本）：`normalizeSvgForOverlay`、`measureSvgBBox`、`setLayerTotalCount`、`handleAutoLayout`、`deleteSelectedInstance`、`handleImpositionUpload`、以及 `activeTab !== 'imposition'` 時提早 return 的 keydown `useEffect`。另外做三個機械式修改：
- `newId` 改成 import `src/utils/id.ts` 的版本（刪掉 App 內的定義）。
- keydown effect 的條件從 `activeTab !== 'imposition'` 改成 `!active`，依賴陣列從 `[activeTab, deleteSelectedInstance]` 改成 `[active, deleteSelectedInstance]`。
- keydown effect 裡判斷「是否正在輸入」的三行，改成 `if (isTypingTarget(e.target)) return;`。

hook 的外殼：

```ts
import React, { useCallback, useEffect, useState } from 'react';
import { isTypingTarget } from '../editor/keyboard';
import { packWithinBoundary, type PackPlacement, type PackRect } from '../imposition/packing';
import {
  DEFAULT_IMPOSITION_STATE,
  type ImpositionInstance,
  type ImpositionLayer,
  type ImpositionState,
} from '../types';
import { newId } from '../utils/id';
import { loadImage } from '../utils/imageProcessing';

export interface ImpositionApi {
  impositionState: ImpositionState;
  setImpositionState: React.Dispatch<React.SetStateAction<ImpositionState>>;
  setLayerTotalCount: (layerId: string, totalCount: number) => void;
  handleAutoLayout: () => void;
  handleImpositionUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
}

/** 第 5 階段會改寫成 mm 版面與純函式 reducer；這裡只是從 App.tsx 搬出來 */
export function useImposition(active: boolean): ImpositionApi {
  const [impositionState, setImpositionState] = useState<ImpositionState>(DEFAULT_IMPOSITION_STATE);

  // ↓↓↓ 從 App.tsx 搬來的 normalizeSvgForOverlay、measureSvgBBox、setLayerTotalCount、
  //     handleAutoLayout、deleteSelectedInstance、keydown useEffect、handleImpositionUpload ↓↓↓

  return { impositionState, setImpositionState, setLayerTotalCount, handleAutoLayout, handleImpositionUpload };
}
```

（上面的註解是搬移位置的標記，搬完後刪掉。搬移後 `useCallback`、`useEffect`、`ImpositionInstance`、`ImpositionLayer`、`PackPlacement`、`PackRect`、`packWithinBoundary`、`loadImage` 都會被用到。）

**7b.** 建立 `src/components/panels/ImpositionPanel.tsx`，內容是 `Controls.tsx` 裡 Imposition 的上傳區塊與參數區塊，改成獨立元件：

```tsx
import { FileText, Upload } from 'lucide-react';
import React from 'react';
import type { ImpositionState } from '../../types';

interface ImpositionPanelProps {
  impositionState: ImpositionState;
  setImpositionState: React.Dispatch<React.SetStateAction<ImpositionState>>;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSetLayerTotalCount: (layerId: string, totalCount: number) => void;
  onAutoLayout: () => void;
  onExportPDF: () => void;
}

const inputClass = 'w-full px-2 py-1 rounded bg-neutral-700 border border-neutral-600 text-white text-xs';
const headingClass = 'text-neutral-200 font-semibold text-xs uppercase tracking-wider';

export function ImpositionPanel({ impositionState: s, setImpositionState, onUpload, onSetLayerTotalCount, onAutoLayout, onExportPDF }: ImpositionPanelProps) {
  const setNumber = (key: 'boundaryWidth' | 'boundaryHeight' | 'minGap') => (e: React.ChangeEvent<HTMLInputElement>) =>
    setImpositionState(prev => ({ ...prev, [key]: Math.max(0, Number(e.target.value) || 0) }));

  return (
    <>
      <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-neutral-600 rounded-lg hover:border-blue-500 hover:bg-neutral-700/50 transition cursor-pointer">
        <Upload className="w-8 h-8 mb-2 text-neutral-500" />
        <p className="text-xs text-neutral-400 text-center"><span className="font-semibold">Click to upload</span> image + SVG (multiple)</p>
        <p className="text-[10px] text-neutral-500 mt-1 text-center">Pairing: same filename stem (cat.png + cat.svg)</p>
        <input type="file" className="hidden" multiple accept="image/*,image/svg+xml,.svg" onChange={onUpload} />
      </label>

      <div className="space-y-4">
        <h2 className={headingClass}>Imposition Boundary</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-xs text-neutral-400">Width (px)
            <input type="number" min={100} value={s.boundaryWidth} onChange={setNumber('boundaryWidth')} className={inputClass} />
          </label>
          <label className="space-y-1 text-xs text-neutral-400">Height (px)
            <input type="number" min={100} value={s.boundaryHeight} onChange={setNumber('boundaryHeight')} className={inputClass} />
          </label>
        </div>
        <div className="flex items-center justify-between p-2 bg-neutral-700/30 rounded border border-neutral-700 text-xs">
          <span className="text-neutral-400">Items</span>
          <span className="text-white font-mono">{s.instances.length}</span>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className={headingClass}>Layout</h2>
        <label className="space-y-1 text-xs text-neutral-400 block">Min Gap (px)
          <input type="number" min={0} value={s.minGap} onChange={setNumber('minGap')} className={inputClass} />
        </label>
        <label className="flex items-center justify-between gap-3 p-2 bg-neutral-700/30 rounded border border-neutral-700 text-xs text-neutral-400">
          允許 90° 旋轉
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={s.allowRotate90}
            onChange={e => {
              const allow = e.target.checked;
              setImpositionState(prev => ({
                ...prev,
                allowRotate90: allow,
                instances: allow ? prev.instances : prev.instances.map(i => ({ ...i, rotationDeg: 0 as const })),
                notPlacedInstanceIds: [],
                lastLayoutMessage: null,
              }));
            }}
          />
        </label>
        <button type="button" onClick={onAutoLayout} disabled={s.instances.length === 0} className="w-full py-2 rounded text-xs text-white bg-neutral-700 hover:bg-neutral-600 disabled:opacity-30">
          排圖
        </button>
        <button
          type="button"
          onClick={onExportPDF}
          disabled={s.instances.length === 0 || s.notPlacedInstanceIds.length === s.instances.length}
          title="只匯出塞得進去的項目（不含淺黃色項目）"
          className="w-full flex items-center justify-center gap-2 py-2 rounded text-xs text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-30"
        >
          <FileText className="w-3 h-3" /> 匯出 PDF（排除塞不進）
        </button>
        {s.lastLayoutMessage ? (
          <div className="p-2 rounded bg-neutral-900 border border-neutral-700 text-[10px] text-neutral-300">{s.lastLayoutMessage}</div>
        ) : null}
      </div>

      <div className="space-y-3">
        <h2 className={headingClass}>Layers</h2>
        {s.layers.length === 0 ? (
          <div className="text-[10px] text-neutral-500">No layers yet. Upload image + SVG pairs.</div>
        ) : (
          s.layers.map(layer => (
            <div key={layer.id} className="flex items-center gap-2 p-2 rounded bg-neutral-700/20 border border-neutral-700">
              <img src={layer.imageUrl} alt={layer.name} className="w-8 h-8 rounded object-contain bg-neutral-900" draggable={false} />
              <div className="flex-1 min-w-0">
                <div className="text-neutral-200 text-xs truncate">{layer.name}</div>
                <div className="text-[10px] text-neutral-500">{layer.width}×{layer.height}</div>
              </div>
              <label className="flex items-center gap-2 text-[10px] text-neutral-400">總數
                <input
                  type="number"
                  min={0}
                  value={layer.totalCount}
                  onChange={e => onSetLayerTotalCount(layer.id, Number(e.target.value) || 0)}
                  className="w-16 px-2 py-1 rounded bg-neutral-800 border border-neutral-600 text-white text-xs"
                  title="總數為 1 代表只有 1 個；設為 0 代表刪除該圖層"
                />
              </label>
            </div>
          ))
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 8：編輯器狀態 hook `src/hooks/useEditorSlot.ts`**

刀模與白墨各用一個，集中管理 PathEditor 回報的狀態。

```ts
import { useCallback, useMemo, useRef, useState, type RefObject } from 'react';
import type { PathEditorHandle } from '../editor/PathEditorCanvas';
import type { PathData } from '../types';

export interface EditorSlot {
  ref: RefObject<PathEditorHandle | null>;
  canUndo: boolean;
  canRedo: boolean;
  segmentCount: number;
  dirty: boolean;
  paths: PathData[];
  clearDirty: () => void;
  callbacks: {
    onHistoryChange: (canUndo: boolean, canRedo: boolean) => void;
    onSegmentCount: (count: number) => void;
    onDirtyChange: (dirty: boolean) => void;
    onPathsChange: (paths: PathData[]) => void;
  };
}

export function useEditorSlot(): EditorSlot {
  const ref = useRef<PathEditorHandle | null>(null);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [segmentCount, setSegmentCount] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [paths, setPaths] = useState<PathData[]>([]);

  const onHistoryChange = useCallback((canUndo: boolean, canRedo: boolean) => setHistory({ canUndo, canRedo }), []);
  const clearDirty = useCallback(() => setDirty(false), []);
  const callbacks = useMemo(
    () => ({ onHistoryChange, onSegmentCount: setSegmentCount, onDirtyChange: setDirty, onPathsChange: setPaths }),
    [onHistoryChange],
  );

  return { ref, ...history, segmentCount, dirty, paths, clearDirty, callbacks };
}
```

- [ ] **Step 9：Sidebar `src/components/Sidebar.tsx`**

```tsx
import { Settings2 } from 'lucide-react';
import React from 'react';
import type { ActiveTab } from '../types';

export interface TabDef {
  id: ActiveTab;
  label: string;
}

interface SidebarProps {
  tabs: readonly TabDef[];
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export function Sidebar({ tabs, activeTab, onTabChange, footer, children }: SidebarProps) {
  return (
    <aside className="w-80 shrink-0 bg-neutral-800 border-r border-neutral-700 flex flex-col h-full overflow-y-auto text-sm select-none">
      <div className="p-4 border-b border-neutral-700">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-blue-500" />
          Contour Crafted
        </h1>
        <p className="text-neutral-400 text-xs mt-1">刀模、白墨與排版</p>
        <nav className="mt-3 grid grid-cols-2 gap-2">
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              data-testid={`tab-${tab.id}`}
              onClick={() => onTabChange(tab.id)}
              className={`py-2 rounded text-xs transition border ${
                activeTab === tab.id
                  ? 'bg-neutral-700 text-white border-neutral-600'
                  : 'bg-neutral-800 text-neutral-300 border-neutral-700 hover:bg-neutral-700/40'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="p-4 space-y-6 flex-1">{children}</div>
      {footer ? (
        <div className="p-4 bg-neutral-900 border-t border-neutral-700 text-[10px] text-neutral-500 space-y-2">{footer}</div>
      ) : null}
    </aside>
  );
}
```

- [ ] **Step 10：更新型別與舊工具**

`src/types.ts`：
1. 刪除 `interface AppState` 與 `DEFAULT_STATE`（已由 `DisplayStyle`、`CutlineParams`、`SourceImage` 取代）。
2. `ActiveTab` 改成：

```ts
export type ActiveTab = 'editor' | 'underprint' | 'imposition';
```

`src/utils/imageProcessing.ts`：刪除 `blurAlphaChannel` 與 `generateOutlineCoordinates`（已由 `geometry/trace.ts` 取代），整個檔案只留下：

```ts
/** 載入圖片 URL */
export const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => resolve(img);
    img.onerror = e => reject(e);
    img.src = src;
  });
```

刪除舊元件：

```bash
git rm src/components/Controls.tsx src/components/EditorCanvas.tsx
```

- [ ] **Step 11：改寫 `src/App.tsx`**

整個檔案換成以下內容（Imposition 的邏輯已在 Step 7 搬走）：

```tsx
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ConfirmDialog } from './components/ConfirmDialog';
import { GeometryView } from './components/GeometryView';
import ImpositionCanvas, { type ImpositionCanvasHandle } from './components/ImpositionCanvas';
import { CutlinePanel } from './components/panels/CutlinePanel';
import { ImpositionPanel } from './components/panels/ImpositionPanel';
import { SourcePanel } from './components/panels/SourcePanel';
import { Sidebar, type TabDef } from './components/Sidebar';
import { useRegenerateGuard } from './editor/useRegenerateGuard';
import { exportCutPdf } from './export/cutPdf';
import { buildAlignedSvg, buildTrimmedCutSvg } from './export/svg';
import { cutlineParamsToPx, DEFAULT_CUTLINE_PARAMS } from './geometry/params';
import type { CutlineParams } from './geometry/types';
import { useEditorSlot } from './hooks/useEditorSlot';
import { useGeometry } from './hooks/useGeometry';
import { useGeometryClient } from './hooks/useGeometryClient';
import { useImposition } from './hooks/useImposition';
import { useSourceImage } from './hooks/useSourceImage';
import { useWorkerImage } from './hooks/useWorkerImage';
import { DEFAULT_CUT_STYLE, type ActiveTab, type DisplayStyle } from './types';
import { DEFAULT_DPI } from './units';
import { downloadText } from './utils/download';

const TABS: readonly TabDef[] = [
  { id: 'editor', label: 'Editor' },
  { id: 'imposition', label: 'Imposition' },
];

const SVG_MIME = 'image/svg+xml;charset=utf-8';
/** 第 6 階段改為讀取設定頁的顏色 */
const EXPORT_CUT_COLOR = '#FF0000';

const confirmExport = (warnings: readonly string[]): boolean =>
  warnings.length === 0 || window.confirm(`${warnings.join('\n')}\n\n確定要匯出嗎？`);

const EDITOR_TIPS = (
  <>
    <div>拖曳節點調整形狀。</div>
    <div>雙擊節點刪除。</div>
    <div>點線段新增節點。Ctrl/Cmd+Z 復原。</div>
  </>
);

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('editor');
  const sourceApi = useSourceImage(DEFAULT_DPI);
  const { source } = sourceApi;
  const client = useGeometryClient();
  const imageId = useWorkerImage(client, source?.current ?? null);

  const [cutParams, setCutParams] = useState<CutlineParams>(DEFAULT_CUTLINE_PARAMS);
  const [cutStyle, setCutStyle] = useState<DisplayStyle>(DEFAULT_CUT_STYLE);
  const dpi = source?.current.dpi ?? null;
  const cutParamsPx = useMemo(() => (dpi ? cutlineParamsToPx(cutParams, dpi) : null), [cutParams, dpi]);
  const cutGeometry = useGeometry(client, 'cutline', imageId, cutParamsPx);
  const cut = useEditorSlot();

  const imposition = useImposition(activeTab === 'imposition');
  const impositionRef = useRef<ImpositionCanvasHandle>(null);
  const { guard, dialog } = useRegenerateGuard();

  // 會重新產生刀模的操作都經過這裡；確認後立刻清掉 dirty，避免拖拉桿時重複詢問
  const guardCut = useCallback(
    (action: () => void) => guard(cut.dirty ? ['Editor'] : [], () => { cut.clearDirty(); action(); }),
    [guard, cut],
  );

  const exportCut = (kind: 'aligned' | 'trimmed') => {
    const editor = cut.ref.current;
    if (!source || !editor || !confirmExport(cutGeometry.result?.warnings ?? [])) return;
    const { widthPx, heightPx, dpi: d } = source.current;
    const paths = editor.getPathData();
    if (kind === 'aligned') {
      downloadText(buildAlignedSvg({ kind: 'cut', paths, widthPx, heightPx, dpi: d, color: EXPORT_CUT_COLOR }), `${source.name}-cut.svg`, SVG_MIME);
      return;
    }
    const bounds = editor.getBounds();
    if (bounds) downloadText(buildTrimmedCutSvg({ paths, bounds, dpi: d, color: EXPORT_CUT_COLOR }), `${source.name}-cut-trimmed.svg`, SVG_MIME);
  };

  const exportPdf = () => {
    const editor = cut.ref.current;
    if (!source || !editor || !confirmExport(cutGeometry.result?.warnings ?? [])) return;
    const { widthPx, heightPx, dpi: d } = source.current;
    exportCutPdf(
      { image: editor.getImage(), curveSets: editor.getCurveSets(), widthPx, heightPx, dpi: d, color: EXPORT_CUT_COLOR },
      `${source.name}-cut.pdf`,
    ).catch((err: unknown) => {
      console.error('匯出 PDF 失敗', err);
      window.alert('匯出 PDF 失敗，請再試一次。');
    });
  };

  const sourcePanel = (
    <SourcePanel
      source={source}
      loading={sourceApi.loading}
      error={sourceApi.error}
      onUpload={file => guardCut(() => void sourceApi.upload(file))}
      onDpiChange={d => guardCut(() => sourceApi.setDpi(d))}
    />
  );

  return (
    <div className="flex h-screen w-screen bg-black overflow-hidden font-sans">
      <Sidebar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} footer={activeTab === 'editor' ? EDITOR_TIPS : null}>
        {activeTab === 'editor' ? (
          <>
            {sourcePanel}
            <CutlinePanel
              params={cutParams}
              onParamsChange={next => guardCut(() => setCutParams(next))}
              geometry={cutGeometry}
              dpi={dpi}
              hasSource={Boolean(source)}
              canUndo={cut.canUndo}
              canRedo={cut.canRedo}
              onUndo={() => cut.ref.current?.undo()}
              onRedo={() => cut.ref.current?.redo()}
              segmentCount={cut.segmentCount}
              style={cutStyle}
              onStyleChange={setCutStyle}
              onExportAligned={() => exportCut('aligned')}
              onExportTrimmed={() => exportCut('trimmed')}
              onExportPdf={exportPdf}
            />
          </>
        ) : null}
        {activeTab === 'imposition' ? (
          <ImpositionPanel
            impositionState={imposition.impositionState}
            setImpositionState={imposition.setImpositionState}
            onUpload={imposition.handleImpositionUpload}
            onSetLayerTotalCount={imposition.setLayerTotalCount}
            onAutoLayout={imposition.handleAutoLayout}
            onExportPDF={() => void impositionRef.current?.exportPDF()}
          />
        ) : null}
      </Sidebar>

      <main className="flex-1 relative h-full bg-[radial-gradient(#333_1px,transparent_1px)] [background-size:16px_16px] bg-neutral-900">
        {/* 分頁切換時不 unmount，保留 Paper 的編輯與歷史 */}
        <div className="absolute inset-0" hidden={activeTab !== 'editor'}>
          <GeometryView
            source={source}
            geometry={cutGeometry}
            editorRef={cut.ref}
            mode="stroke"
            style={cutStyle}
            smoothness={cutParams.smoothness}
            active={activeTab === 'editor'}
            testId="cut-canvas"
            {...cut.callbacks}
          />
        </div>
        <div className="absolute inset-0" hidden={activeTab !== 'imposition'}>
          <ImpositionCanvas ref={impositionRef} impositionState={imposition.impositionState} setImpositionState={imposition.setImpositionState} />
        </div>
      </main>

      <ConfirmDialog {...dialog} />
    </div>
  );
};

export default App;
```

- [ ] **Step 12：自動驗證**

Run: `npm run typecheck && npm test && npm run build`
Expected: 全部通過；build 輸出包含 `dist/assets/worker-*.js`；`grep -rn "Controls\|EditorCanvas\|AppState\|generateOutlineCoordinates" src` 沒有輸出。

- [ ] **Step 13：手動驗證（`npm run dev`，開 http://localhost:3000/）**

準備一張有兩個分離圖形的透明 PNG（例如兩個相距約 5 mm 的貼紙圖案）。逐項確認：

1. 上傳後出現刀模線，右上角狀態從「計算中…」變成空白，面板顯示「區塊數 1」與橋接半徑（mm）。
2. 關閉「單一連通」→ 區塊數變成 2；再打開 → 回到 1。
3. 把「自動橋接上限」調到 1 mm → 出現「仍有 2 個分離區塊」警告。
4. 調整外擴距離，路徑即時更新（約 150ms 延遲），畫面不卡頓。
5. 拖曳一個節點 → Undo 可用；按 Ctrl/Cmd+Z 復原、Ctrl/Cmd+Shift+Z 重做。
6. 拖曳節點後調整外擴距離 → 跳出「覆蓋手動編輯？」；按取消，滑桿回到原值；再調一次按「覆蓋並套用」，路徑重新產生，之後繼續拖拉桿不會再跳出。
7. 修改 DPI（例如 300 → 150）→ 面板的 mm 尺寸加倍，刀模外擴在畫面上變窄（同樣 mm 對應更少 px）。
8. 三個匯出都能下載；用瀏覽器開 SVG，確認 `width`／`height` 是 mm、只有紅色細線。
9. 切到 Imposition → 功能與改版前相同（上傳配對、排圖、匯出 PDF、X 鍵刪除）；切回 Editor，剛才的節點編輯仍在。
10. 切換「舊模式」→ 出現 Blur 與 Threshold 滑桿，路徑依模糊產生。

- [ ] **Step 14：Commit**

```bash
git add src/App.tsx src/types.ts src/utils/imageProcessing.ts src/hooks/useImposition.ts src/hooks/useEditorSlot.ts src/editor/useRegenerateGuard.ts src/components/ConfirmDialog.tsx src/components/GeometryView.tsx src/components/Sidebar.tsx src/components/panels
git commit -m "feat: switch Editor to vector geometry engine with single-connected cut lines

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

（`git rm` 已經 stage 了 `Controls.tsx` 與 `EditorCanvas.tsx` 的刪除。）
