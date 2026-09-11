# 第 2 階段：向量幾何引擎

先讀 index 的 Global Constraints。這個階段全部是純函式與 worker，UI 不變；所有模組都要先寫測試。

---

### Task 2.1：單位換算

**Files:**
- Create: `src/units.ts`
- Test: `src/units.test.ts`

**Interfaces:**
- Produces：
  ```ts
  export const MM_PER_INCH = 25.4;
  export const CSS_PX_PER_MM: number;   // 96 / 25.4
  export const DPI_MIN = 72;
  export const DPI_MAX = 2400;
  export const DEFAULT_DPI = 300;
  export const mmToPx: (mm: number, dpi: number) => number;
  export const pxToMm: (px: number, dpi: number) => number;
  export const mm2ToPx2: (mm2: number, dpi: number) => number;
  export const isValidDpi: (dpi: number) => boolean;
  export const formatMm: (mm: number, digits?: number) => string; // '2.3 mm'
  ```

- [ ] **Step 1：寫失敗的測試**

`src/units.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { CSS_PX_PER_MM, formatMm, isValidDpi, mm2ToPx2, mmToPx, pxToMm } from './units';

describe('units', () => {
  it('converts mm to px', () => {
    expect(mmToPx(25.4, 300)).toBe(300);
    expect(mmToPx(2, 300)).toBeCloseTo(23.622, 3);
  });

  it('converts px to mm and back', () => {
    expect(pxToMm(300, 300)).toBe(25.4);
    expect(mmToPx(pxToMm(123.4, 150), 150)).toBeCloseTo(123.4, 9);
  });

  it('converts areas with the square of the scale', () => {
    expect(mm2ToPx2(1, 25.4)).toBe(1);
    expect(mm2ToPx2(0.5, 300)).toBeCloseTo(69.75, 1);
  });

  it('validates dpi range', () => {
    expect(isValidDpi(72)).toBe(true);
    expect(isValidDpi(2400)).toBe(true);
    expect(isValidDpi(71)).toBe(false);
    expect(isValidDpi(2401)).toBe(false);
    expect(isValidDpi(Number.NaN)).toBe(false);
    expect(isValidDpi(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it('formats mm', () => {
    expect(formatMm(2.345)).toBe('2.3 mm');
    expect(formatMm(2, 2)).toBe('2.00 mm');
  });

  it('exposes css px per mm', () => {
    expect(CSS_PX_PER_MM).toBeCloseTo(3.7795, 4);
  });
});
```

- [ ] **Step 2：確認測試失敗**

Run: `npx vitest run src/units.test.ts`
Expected: FAIL，`Failed to resolve import "./units"`

- [ ] **Step 3：實作 `src/units.ts`**

```ts
export const MM_PER_INCH = 25.4;
export const CSS_PX_PER_MM = 96 / MM_PER_INCH;
export const DPI_MIN = 72;
export const DPI_MAX = 2400;
export const DEFAULT_DPI = 300;

export const mmToPx = (mm: number, dpi: number): number => (mm / MM_PER_INCH) * dpi;

export const pxToMm = (px: number, dpi: number): number => (px * MM_PER_INCH) / dpi;

export const mm2ToPx2 = (mm2: number, dpi: number): number => mm2 * (dpi / MM_PER_INCH) ** 2;

export const isValidDpi = (dpi: number): boolean =>
  Number.isFinite(dpi) && dpi >= DPI_MIN && dpi <= DPI_MAX;

export const formatMm = (mm: number, digits = 1): string => `${mm.toFixed(digits)} mm`;
```

- [ ] **Step 4：確認測試通過**

Run: `npx vitest run src/units.test.ts`
Expected: PASS（6 tests）

- [ ] **Step 5：Commit**

```bash
git add src/units.ts src/units.test.ts
git commit -m "feat: add mm/px/dpi unit helpers

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.2：讀取 DPI

**Files:**
- Create: `src/utils/dpi.ts`
- Test: `src/utils/dpi.test.ts`

**Interfaces:**
- Consumes：`isValidDpi` from `src/units.ts`
- Produces：
  ```ts
  export function readDpiFromBytes(bytes: Uint8Array): number | null
  export async function readDpiFromBlob(blob: Blob): Promise<number | null>
  ```
  只讀檔頭前 256 KB。PNG 讀 `pHYs`（單位必須是公尺），JPEG 讀 JFIF APP0（單位 1 = dpi、2 = dpcm）。其他格式、沒有資訊、超出 72–2400 一律回傳 `null`。

- [ ] **Step 1：寫失敗的測試**

`src/utils/dpi.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { readDpiFromBlob, readDpiFromBytes } from './dpi';

const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const be16 = (n: number) => [(n >> 8) & 255, n & 255];
const bytesOf = (s: string) => [...s].map(c => c.charCodeAt(0));

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const pngChunk = (type: string, data: number[]) => [...be32(data.length), ...bytesOf(type), ...data, 0, 0, 0, 0];
const phys = (pixelsPerMeter: number, unit: number) =>
  pngChunk('pHYs', [...be32(pixelsPerMeter), ...be32(pixelsPerMeter), unit]);
const png = (...chunks: number[][]) =>
  new Uint8Array([...PNG_SIG, ...pngChunk('IHDR', new Array(13).fill(0)), ...chunks.flat(), ...pngChunk('IEND', [])]);

const jfif = (units: number, density: number) =>
  new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe0, ...be16(16), ...bytesOf('JFIF'), 0x00, 1, 1, units, ...be16(density), ...be16(density), 0, 0,
    0xff, 0xd9,
  ]);

describe('readDpiFromBytes (PNG)', () => {
  it('reads pHYs in pixels per meter', () => {
    expect(readDpiFromBytes(png(phys(11811, 1)))).toBe(300);
  });

  it('ignores pHYs with unknown unit', () => {
    expect(readDpiFromBytes(png(phys(11811, 0)))).toBeNull();
  });

  it('returns null without pHYs', () => {
    expect(readDpiFromBytes(png())).toBeNull();
  });

  it('stops at IDAT', () => {
    expect(readDpiFromBytes(png(pngChunk('IDAT', [0]), phys(11811, 1)))).toBeNull();
  });

  it('rejects out-of-range values', () => {
    expect(readDpiFromBytes(png(phys(100, 1)))).toBeNull();
  });
});

describe('readDpiFromBytes (JPEG)', () => {
  it('reads JFIF density in dpi', () => {
    expect(readDpiFromBytes(jfif(1, 300))).toBe(300);
  });

  it('converts dots per cm', () => {
    expect(readDpiFromBytes(jfif(2, 118))).toBe(300);
  });

  it('returns null for aspect-ratio-only density', () => {
    expect(readDpiFromBytes(jfif(0, 1))).toBeNull();
  });

  it('returns null without APP0', () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, ...be16(4), 0, 0, 0xff, 0xda, 0, 2]);
    expect(readDpiFromBytes(bytes)).toBeNull();
  });
});

describe('readDpiFromBytes (other)', () => {
  it('returns null for unknown formats', () => {
    expect(readDpiFromBytes(new Uint8Array(bytesOf('RIFF....WEBP')))).toBeNull();
    expect(readDpiFromBytes(new Uint8Array([]))).toBeNull();
  });
});

describe('readDpiFromBlob', () => {
  it('reads from a blob', async () => {
    expect(await readDpiFromBlob(new Blob([png(phys(11811, 1))]))).toBe(300);
  });
});
```

- [ ] **Step 2：確認測試失敗**

Run: `npx vitest run src/utils/dpi.test.ts`
Expected: FAIL，`Failed to resolve import "./dpi"`

- [ ] **Step 3：實作 `src/utils/dpi.ts`**

```ts
import { isValidDpi } from '../units';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const METERS_PER_INCH = 0.0254;
const CM_PER_INCH = 2.54;
const DPI_HEADER_BYTES = 256 * 1024;

const u32 = (b: Uint8Array, o: number): number =>
  ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u16 = (b: Uint8Array, o: number): number => (b[o] << 8) | b[o + 1];
const ascii = (b: Uint8Array, o: number, n: number): string =>
  String.fromCharCode(...b.subarray(o, o + n));

const isPng = (b: Uint8Array) => b.length >= 8 && PNG_SIGNATURE.every((v, i) => b[i] === v);
const isJpeg = (b: Uint8Array) => b.length >= 4 && b[0] === 0xff && b[1] === 0xd8;

const validOrNull = (dpi: number): number | null => (isValidDpi(dpi) ? dpi : null);

function readPngDpi(b: Uint8Array): number | null {
  let offset = 8;
  while (offset + 12 <= b.length) {
    const length = u32(b, offset);
    const type = ascii(b, offset + 4, 4);
    const data = offset + 8;
    if (type === 'pHYs' && length >= 9 && data + 9 <= b.length) {
      const unit = b[data + 8];
      return unit === 1 ? validOrNull(Math.round(u32(b, data) * METERS_PER_INCH)) : null;
    }
    // pHYs 規定要在 IDAT 之前
    if (type === 'IDAT' || type === 'IEND') return null;
    offset = data + length + 4;
  }
  return null;
}

function readJfifDensity(b: Uint8Array, offset: number): number | null {
  const units = b[offset + 11];
  const density = u16(b, offset + 12);
  if (units === 1) return validOrNull(density);
  if (units === 2) return validOrNull(Math.round(density * CM_PER_INCH));
  return null;
}

function readJpegDpi(b: Uint8Array): number | null {
  let offset = 2;
  while (offset + 4 <= b.length) {
    if (b[offset] !== 0xff) return null;
    const marker = b[offset + 1];
    if (marker === 0xff) {
      offset += 1; // 填充位元組
      continue;
    }
    if (marker === 0xda || marker === 0xd9) return null; // SOS 或 EOI 之後不會再有 APP0
    if (marker === 0xe0 && offset + 16 <= b.length && ascii(b, offset + 4, 5) === 'JFIF\0') {
      return readJfifDensity(b, offset);
    }
    offset += 2 + u16(b, offset + 2);
  }
  return null;
}

export function readDpiFromBytes(bytes: Uint8Array): number | null {
  if (isPng(bytes)) return readPngDpi(bytes);
  if (isJpeg(bytes)) return readJpegDpi(bytes);
  return null;
}

export async function readDpiFromBlob(blob: Blob): Promise<number | null> {
  const buffer = await blob.slice(0, DPI_HEADER_BYTES).arrayBuffer();
  return readDpiFromBytes(new Uint8Array(buffer));
}
```

- [ ] **Step 4：確認測試通過**

Run: `npx vitest run src/utils/dpi.test.ts`
Expected: PASS（11 tests）

- [ ] **Step 5：Commit**

```bash
git add src/utils/dpi.ts src/utils/dpi.test.ts
git commit -m "feat: read dpi from PNG pHYs and JPEG JFIF headers

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.3：型別、參數與 Clipper 包裝

**Files:**
- Create: `src/geometry/types.ts`、`src/geometry/messages.ts`、`src/geometry/params.ts`、`src/geometry/polygon.ts`
- Test: `src/geometry/params.test.ts`、`src/geometry/polygon.test.ts`

**Interfaces:**
- Consumes：`mmToPx`、`mm2ToPx2` from `src/units.ts`
- Produces（`src/geometry/types.ts`，之後所有 task 共用）：
  ```ts
  export type Point = readonly [number, number];
  export type Ring = readonly Point[];
  export interface Polygon { readonly outer: Ring; readonly holes: readonly Ring[] }
  export interface AlphaImage { readonly width: number; readonly height: number; readonly alpha: Uint8ClampedArray }
  export type CutlineMode = 'precise' | 'legacy';
  export type BridgeMode = 'auto' | 'manual';
  export interface CutlineParams { mode; alphaThreshold; offsetMm; legacyBlurPx; legacyThreshold; minIslandAreaMm2; singleConnected; bridgeMode; bridgeRadiusMm; bridgeMaxMm; smoothness }
  export interface UnderprintParams { alphaThreshold; insetMm; minIslandAreaMm2; fillHoles; smoothness }
  export interface CutlineParamsPx { mode; alphaThreshold; offsetPx; legacyBlurPx; legacyThreshold; minIslandAreaPx2; singleConnected; bridgeMode; bridgeRadiusPx; bridgeMaxPx; bridgePrecisionPx }
  export interface UnderprintParamsPx { alphaThreshold; insetPx; minIslandAreaPx2; fillHoles }
  export interface GeometryStats { islandCount: number; bridgeRadiusPx?: number }
  export interface GeometryResult { polygons: Polygon[]; warnings: string[]; stats: GeometryStats }
  export type GeometryJobKind = 'cutline' | 'underprint';
  export type WorkerRequest = ...; export type WorkerResponse = ...;
  ```
- Produces（`src/geometry/messages.ts`）：`MSG_NO_OPAQUE`、`MSG_NOTHING_LEFT`、`disconnectedMessage(count: number): string`
- Produces（`src/geometry/params.ts`）：`BRIDGE_PRECISION_MM = 0.1`、`DEFAULT_CUTLINE_PARAMS`、`DEFAULT_UNDERPRINT_PARAMS`、`cutlineParamsToPx(p, dpi)`、`underprintParamsToPx(p, dpi)`
- Produces（`src/geometry/polygon.ts`）：
  ```ts
  export const TRACE_SIMPLIFY_EPS_PX = 0.5;
  export function normalizeRings(rings: readonly Ring[]): Polygon[]            // EvenOdd union → 外圈加洞
  export function inflate(polys: readonly Polygon[], deltaPx: number): Polygon[] // 正數外擴、負數內縮，圓角
  export function simplify(polys: readonly Polygon[], epsilonPx: number): Polygon[]
  export function removeSmallIslands(polys: readonly Polygon[], minAreaPx2: number): Polygon[]
  export function fillHoles(polys: readonly Polygon[]): Polygon[]
  export function prepareBase(rings: readonly Ring[], minIslandAreaPx2: number): Polygon[] // normalize → simplify → 去雜點
  export function ringArea(ring: Ring): number     // 有號面積 px²；外圈為正、洞為負
  export function polygonArea(p: Polygon): number  // 外圈面積減洞
  export interface Bounds { minX: number; minY: number; maxX: number; maxY: number }
  export function polygonsBounds(polys: readonly Polygon[]): Bounds | null
  ```

- [ ] **Step 1：安裝 clipper2-ts**

```bash
npm i -E clipper2-ts@2.0.1
```

- [ ] **Step 2：建立型別與訊息（沒有邏輯，不需要測試）**

`src/geometry/types.ts`：

```ts
export type Point = readonly [number, number];
export type Ring = readonly Point[];

export interface Polygon {
  readonly outer: Ring;
  readonly holes: readonly Ring[];
}

export interface AlphaImage {
  readonly width: number;
  readonly height: number;
  readonly alpha: Uint8ClampedArray;
}

export type CutlineMode = 'precise' | 'legacy';
export type BridgeMode = 'auto' | 'manual';

/** 面板使用的刀模參數（mm） */
export interface CutlineParams {
  mode: CutlineMode;
  alphaThreshold: number;
  offsetMm: number;
  legacyBlurPx: number;
  legacyThreshold: number;
  minIslandAreaMm2: number;
  singleConnected: boolean;
  bridgeMode: BridgeMode;
  bridgeRadiusMm: number;
  bridgeMaxMm: number;
  smoothness: number;
}

/** 面板使用的白墨參數（mm） */
export interface UnderprintParams {
  alphaThreshold: number;
  insetMm: number;
  minIslandAreaMm2: number;
  fillHoles: boolean;
  smoothness: number;
}

/** 送進 worker 的刀模參數（px）。smoothness 在主執行緒套用，不會送進來。 */
export interface CutlineParamsPx {
  mode: CutlineMode;
  alphaThreshold: number;
  offsetPx: number;
  legacyBlurPx: number;
  legacyThreshold: number;
  minIslandAreaPx2: number;
  singleConnected: boolean;
  bridgeMode: BridgeMode;
  bridgeRadiusPx: number;
  bridgeMaxPx: number;
  bridgePrecisionPx: number;
}

export interface UnderprintParamsPx {
  alphaThreshold: number;
  insetPx: number;
  minIslandAreaPx2: number;
  fillHoles: boolean;
}

export interface GeometryStats {
  islandCount: number;
  bridgeRadiusPx?: number;
}

export interface GeometryResult {
  polygons: Polygon[];
  warnings: string[];
  stats: GeometryStats;
}

export type GeometryJobKind = 'cutline' | 'underprint';

export type WorkerRequest =
  | { type: 'setImage'; imageId: string; width: number; height: number; alpha: Uint8ClampedArray }
  | { type: 'dropImage'; imageId: string }
  | { type: 'cutline'; jobId: number; imageId: string; params: CutlineParamsPx }
  | { type: 'underprint'; jobId: number; imageId: string; params: UnderprintParamsPx };

export type WorkerResponse =
  | ({ type: 'result'; jobId: number } & GeometryResult)
  | { type: 'error'; jobId: number; message: string };
```

`src/geometry/messages.ts`：

```ts
export const MSG_NO_OPAQUE = '找不到不透明的區域';
export const MSG_NOTHING_LEFT = '內縮後沒有剩餘區域';
export const disconnectedMessage = (count: number): string => `仍有 ${count} 個分離區塊`;
```

- [ ] **Step 3：寫參數換算的失敗測試**

`src/geometry/params.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CUTLINE_PARAMS,
  DEFAULT_UNDERPRINT_PARAMS,
  cutlineParamsToPx,
  underprintParamsToPx,
} from './params';

describe('params', () => {
  it('has the defaults from the spec', () => {
    expect(DEFAULT_CUTLINE_PARAMS).toEqual({
      mode: 'precise',
      alphaThreshold: 16,
      offsetMm: 2,
      legacyBlurPx: 15,
      legacyThreshold: 10,
      minIslandAreaMm2: 0.5,
      singleConnected: true,
      bridgeMode: 'auto',
      bridgeRadiusMm: 3,
      bridgeMaxMm: 10,
      smoothness: 2,
    });
    expect(DEFAULT_UNDERPRINT_PARAMS).toEqual({
      alphaThreshold: 128,
      insetMm: 0.2,
      minIslandAreaMm2: 0.2,
      fillHoles: false,
      smoothness: 1,
    });
  });

  it('converts cutline mm params to px (1 mm = 1 px at 25.4 dpi)', () => {
    expect(cutlineParamsToPx(DEFAULT_CUTLINE_PARAMS, 25.4)).toEqual({
      mode: 'precise',
      alphaThreshold: 16,
      offsetPx: 2,
      legacyBlurPx: 15,
      legacyThreshold: 10,
      minIslandAreaPx2: 0.5,
      singleConnected: true,
      bridgeMode: 'auto',
      bridgeRadiusPx: 3,
      bridgeMaxPx: 10,
      bridgePrecisionPx: expect.closeTo(0.1, 9),
    });
  });

  it('scales with dpi', () => {
    expect(cutlineParamsToPx(DEFAULT_CUTLINE_PARAMS, 300).offsetPx).toBeCloseTo(23.622, 3);
  });

  it('converts underprint mm params to px', () => {
    expect(underprintParamsToPx(DEFAULT_UNDERPRINT_PARAMS, 25.4)).toEqual({
      alphaThreshold: 128,
      insetPx: 0.2,
      minIslandAreaPx2: expect.closeTo(0.2, 9),
      fillHoles: false,
    });
  });
});
```

- [ ] **Step 4：確認測試失敗**

Run: `npx vitest run src/geometry/params.test.ts`
Expected: FAIL，`Failed to resolve import "./params"`

- [ ] **Step 5：實作 `src/geometry/params.ts`**

```ts
import { mm2ToPx2, mmToPx } from '../units';
import type { CutlineParams, CutlineParamsPx, UnderprintParams, UnderprintParamsPx } from './types';

export const BRIDGE_PRECISION_MM = 0.1;

export const DEFAULT_CUTLINE_PARAMS: CutlineParams = {
  mode: 'precise',
  alphaThreshold: 16,
  offsetMm: 2,
  legacyBlurPx: 15,
  legacyThreshold: 10,
  minIslandAreaMm2: 0.5,
  singleConnected: true,
  bridgeMode: 'auto',
  bridgeRadiusMm: 3,
  bridgeMaxMm: 10,
  smoothness: 2,
};

export const DEFAULT_UNDERPRINT_PARAMS: UnderprintParams = {
  alphaThreshold: 128,
  insetMm: 0.2,
  minIslandAreaMm2: 0.2,
  fillHoles: false,
  smoothness: 1,
};

export function cutlineParamsToPx(p: CutlineParams, dpi: number): CutlineParamsPx {
  return {
    mode: p.mode,
    alphaThreshold: p.alphaThreshold,
    offsetPx: mmToPx(p.offsetMm, dpi),
    legacyBlurPx: p.legacyBlurPx,
    legacyThreshold: p.legacyThreshold,
    minIslandAreaPx2: mm2ToPx2(p.minIslandAreaMm2, dpi),
    singleConnected: p.singleConnected,
    bridgeMode: p.bridgeMode,
    bridgeRadiusPx: mmToPx(p.bridgeRadiusMm, dpi),
    bridgeMaxPx: mmToPx(p.bridgeMaxMm, dpi),
    bridgePrecisionPx: mmToPx(BRIDGE_PRECISION_MM, dpi),
  };
}

export function underprintParamsToPx(p: UnderprintParams, dpi: number): UnderprintParamsPx {
  return {
    alphaThreshold: p.alphaThreshold,
    insetPx: mmToPx(p.insetMm, dpi),
    minIslandAreaPx2: mm2ToPx2(p.minIslandAreaMm2, dpi),
    fillHoles: p.fillHoles,
  };
}
```

- [ ] **Step 6：確認參數測試通過**

Run: `npx vitest run src/geometry/params.test.ts`
Expected: PASS（4 tests）

- [ ] **Step 7：寫 Clipper 包裝的失敗測試**

`src/geometry/polygon.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import type { Ring } from './types';
import {
  fillHoles,
  inflate,
  normalizeRings,
  polygonArea,
  polygonsBounds,
  prepareBase,
  removeSmallIslands,
  ringArea,
  simplify,
} from './polygon';

const sq = (x: number, y: number, w: number, h: number): Ring => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

describe('normalizeRings', () => {
  it('turns an outer ring and an inner ring into one polygon with a hole', () => {
    const polys = normalizeRings([sq(0, 0, 100, 100), sq(30, 30, 40, 40)]);
    expect(polys).toHaveLength(1);
    expect(polys[0].holes).toHaveLength(1);
    expect(polygonArea(polys[0])).toBeCloseTo(8400, 6);
  });

  it('orients outers positive and holes negative', () => {
    const [p] = normalizeRings([sq(0, 0, 100, 100), sq(30, 30, 40, 40)]);
    expect(ringArea(p.outer)).toBeGreaterThan(0);
    expect(ringArea(p.holes[0])).toBeLessThan(0);
  });

  it('splits a self-intersecting bow-tie into two parts', () => {
    const bowTie: Ring = [[0, 0], [10, 10], [10, 0], [0, 10]];
    expect(normalizeRings([bowTie])).toHaveLength(2);
  });

  it('keeps an island inside a hole as a separate polygon', () => {
    const polys = normalizeRings([sq(0, 0, 100, 100), sq(20, 20, 60, 60), sq(40, 40, 20, 20)]);
    expect(polys).toHaveLength(2);
    expect(polys.map(p => p.holes.length).sort()).toEqual([0, 1]);
  });
});

describe('inflate', () => {
  it('grows a square by the delta', () => {
    const b = polygonsBounds(inflate(normalizeRings([sq(0, 0, 100, 100)]), 10));
    expect(b?.minX).toBeCloseTo(-10, 1);
    expect(b?.maxX).toBeCloseTo(110, 1);
    expect(b?.maxY).toBeCloseTo(110, 1);
  });

  it('shrinks a square with a negative delta', () => {
    const b = polygonsBounds(inflate(normalizeRings([sq(0, 0, 100, 100)]), -10));
    expect(b?.minX).toBeCloseTo(10, 1);
    expect(b?.maxX).toBeCloseTo(90, 1);
  });

  it('returns a copy for a zero delta and an empty list for empty input', () => {
    const polys = normalizeRings([sq(0, 0, 10, 10)]);
    const same = inflate(polys, 0);
    expect(same).toEqual(polys);
    expect(same).not.toBe(polys);
    expect(inflate([], 5)).toEqual([]);
  });

  it('merges islands only when the grown shapes overlap', () => {
    // 相距 30px，各自外擴 d 後間距為 30 − 2d，d > 15 才會重疊
    const polys = normalizeRings([sq(0, 0, 100, 100), sq(130, 0, 100, 100)]);
    expect(inflate(polys, 15.5)).toHaveLength(1);
    expect(inflate(polys, 14.9)).toHaveLength(2);
    expect(inflate(polys, 10)).toHaveLength(2);
  });
});

describe('simplify', () => {
  it('removes jitter along straight edges', () => {
    const jittery: Ring = Array.from({ length: 400 }, (_, i) => {
      const t = (i % 100) / 100;
      const j = i % 2 === 0 ? 0.2 : -0.2;
      const side = Math.floor(i / 100);
      if (side === 0) return [t * 100, j] as const;
      if (side === 1) return [100 + j, t * 100] as const;
      if (side === 2) return [100 - t * 100, 100 + j] as const;
      return [j, 100 - t * 100] as const;
    });
    const [p] = simplify(normalizeRings([jittery]), 0.5);
    expect(p.outer.length).toBeLessThan(20);
  });

  it('handles empty input', () => {
    expect(simplify([], 0.5)).toEqual([]);
  });
});

describe('removeSmallIslands', () => {
  it('drops polygons whose outer area is below the minimum', () => {
    const polys = normalizeRings([sq(0, 0, 100, 100), sq(200, 200, 2, 2)]);
    expect(removeSmallIslands(polys, 10)).toHaveLength(1);
    expect(removeSmallIslands(polys, 0)).toHaveLength(2);
  });
});

describe('fillHoles', () => {
  it('removes holes', () => {
    const polys = fillHoles(normalizeRings([sq(0, 0, 100, 100), sq(30, 30, 40, 40)]));
    expect(polys).toHaveLength(1);
    expect(polys[0].holes).toHaveLength(0);
  });

  it('absorbs islands inside holes', () => {
    const polys = fillHoles(normalizeRings([sq(0, 0, 100, 100), sq(20, 20, 60, 60), sq(40, 40, 20, 20)]));
    expect(polys).toHaveLength(1);
    expect(polys[0].holes).toHaveLength(0);
  });

  it('handles empty input', () => {
    expect(fillHoles([])).toEqual([]);
  });
});

describe('prepareBase and polygonsBounds', () => {
  it('normalizes, simplifies and removes small islands', () => {
    const polys = prepareBase([sq(0, 0, 100, 100), sq(200, 200, 2, 2)], 10);
    expect(polys).toHaveLength(1);
  });

  it('returns null bounds for nothing', () => {
    expect(prepareBase([], 0)).toEqual([]);
    expect(polygonsBounds([])).toBeNull();
  });
});
```

- [ ] **Step 8：確認測試失敗**

Run: `npx vitest run src/geometry/polygon.test.ts`
Expected: FAIL，`Failed to resolve import "./polygon"`

- [ ] **Step 9：實作 `src/geometry/polygon.ts`**

```ts
import {
  area,
  booleanOpWithPolyTree,
  ClipType,
  EndType,
  FillRule,
  inflatePaths,
  JoinType,
  PolyTree64,
  simplifyPaths,
  type Path64,
  type Paths64,
  type PolyPath64,
} from 'clipper2-ts';
import type { Polygon, Ring } from './types';

/** Clipper 使用整數座標：px 乘以 100，精度 0.01px */
const SCALE = 100;
const ARC_TOLERANCE_PX = 0.25;
const MITER_LIMIT = 2;
export const TRACE_SIMPLIFY_EPS_PX = 0.5;

const toPath = (ring: Ring): Path64 =>
  ring.map(([x, y]) => ({ x: Math.round(x * SCALE), y: Math.round(y * SCALE) }));

const toRing = (path: Path64): Ring => path.map(p => [p.x / SCALE, p.y / SCALE] as const);

const polygonsToPaths = (polys: readonly Polygon[]): Paths64 =>
  polys.flatMap(p => [toPath(p.outer), ...p.holes.map(toPath)]);

const childrenOf = (node: PolyPath64): PolyPath64[] =>
  Array.from({ length: node.count }, (_, i) => node.child(i));

/** PolyTree 的第一層是外圈、第二層是洞、第三層是洞裡的島（變成獨立的 Polygon） */
const treeToPolygons = (node: PolyPath64): Polygon[] =>
  childrenOf(node).flatMap(outer => {
    const holeNodes = childrenOf(outer);
    const polygon: Polygon = {
      outer: toRing(outer.poly ?? []),
      holes: holeNodes.map(h => toRing(h.poly ?? [])),
    };
    return [polygon, ...holeNodes.flatMap(treeToPolygons)];
  });

const unionPaths = (paths: Paths64, fillRule: FillRule): Polygon[] => {
  const tree = new PolyTree64();
  booleanOpWithPolyTree(ClipType.Union, paths, null, tree, fillRule);
  return treeToPolygons(tree);
};

export function normalizeRings(rings: readonly Ring[]): Polygon[] {
  if (rings.length === 0) return [];
  return unionPaths(rings.map(toPath), FillRule.EvenOdd);
}

export function inflate(polys: readonly Polygon[], deltaPx: number): Polygon[] {
  if (polys.length === 0) return [];
  if (deltaPx === 0) return [...polys];
  const inflated = inflatePaths(
    polygonsToPaths(polys),
    deltaPx * SCALE,
    JoinType.Round,
    EndType.Polygon,
    MITER_LIMIT,
    ARC_TOLERANCE_PX * SCALE,
  );
  return unionPaths(inflated, FillRule.NonZero);
}

export function simplify(polys: readonly Polygon[], epsilonPx: number): Polygon[] {
  if (polys.length === 0) return [];
  return unionPaths(simplifyPaths(polygonsToPaths(polys), epsilonPx * SCALE, true), FillRule.NonZero);
}

export const ringArea = (ring: Ring): number => area(toPath(ring)) / (SCALE * SCALE);

export const polygonArea = (p: Polygon): number =>
  Math.abs(ringArea(p.outer)) - p.holes.reduce((sum, h) => sum + Math.abs(ringArea(h)), 0);

export function removeSmallIslands(polys: readonly Polygon[], minAreaPx2: number): Polygon[] {
  if (minAreaPx2 <= 0) return [...polys];
  return polys.filter(p => Math.abs(ringArea(p.outer)) >= minAreaPx2);
}

export function fillHoles(polys: readonly Polygon[]): Polygon[] {
  if (polys.length === 0) return [];
  return unionPaths(polys.map(p => toPath(p.outer)), FillRule.NonZero);
}

export function prepareBase(rings: readonly Ring[], minIslandAreaPx2: number): Polygon[] {
  return removeSmallIslands(simplify(normalizeRings(rings), TRACE_SIMPLIFY_EPS_PX), minIslandAreaPx2);
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function polygonsBounds(polys: readonly Polygon[]): Bounds | null {
  const points = polys.flatMap(p => p.outer);
  if (points.length === 0) return null;
  return points.reduce<Bounds>(
    (b, [x, y]) => ({
      minX: Math.min(b.minX, x),
      minY: Math.min(b.minY, y),
      maxX: Math.max(b.maxX, x),
      maxY: Math.max(b.maxY, y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}
```

- [ ] **Step 10：確認測試通過**

Run: `npx vitest run src/geometry`
Expected: PASS（params 4 tests、polygon 16 tests）。

- [ ] **Step 11：驗證並 commit**

Run: `npm run typecheck && npm test && npm run build`
Expected: 全部通過。

```bash
git add package.json package-lock.json src/geometry/types.ts src/geometry/messages.ts src/geometry/params.ts src/geometry/params.test.ts src/geometry/polygon.ts src/geometry/polygon.test.ts
git commit -m "feat: add geometry types, params and clipper2 polygon helpers

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.4：描邊

**Files:**
- Create: `src/geometry/testUtils.ts`（測試用，不計入 coverage）
- Create: `src/geometry/trace.ts`
- Test: `src/geometry/trace.test.ts`

**Interfaces:**
- Consumes：`Ring`、`AlphaImage` from `types.ts`；測試用 `normalizeRings`、`polygonArea`、`polygonsBounds` from `polygon.ts`
- Produces：
  ```ts
  // trace.ts
  export function blurAlpha(alpha: ArrayLike<number>, width: number, height: number, radius: number): Uint8Array
  export function traceRings(values: ArrayLike<number>, width: number, height: number, threshold: number): Ring[]
  export const tracePrecise: (img: AlphaImage, alphaThreshold: number) => Ring[]
  export const traceLegacy: (img: AlphaImage, blurPx: number, threshold: number) => Ring[] // blurPx 最小為 1，與舊版相同
  // testUtils.ts
  export type Mask = (x: number, y: number) => boolean;
  export function makeAlpha(width: number, height: number, inside: Mask, value?: number): AlphaImage
  export const rect: (x0: number, y0: number, w: number, h: number) => Mask
  export const disc: (cx: number, cy: number, r: number) => Mask
  export const anyOf: (...masks: Mask[]) => Mask
  export const minus: (a: Mask, b: Mask) => Mask
  ```
  回傳的 ring 是開放的（最後一點不等於第一點），包含外圈與洞，方向不保證，交給 `normalizeRings` 統一。

- [ ] **Step 1：建立測試工具 `src/geometry/testUtils.ts`**

```ts
import type { AlphaImage } from './types';

export type Mask = (x: number, y: number) => boolean;

export function makeAlpha(width: number, height: number, inside: Mask, value = 255): AlphaImage {
  const alpha = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (inside(x, y)) alpha[y * width + x] = value;
    }
  }
  return { width, height, alpha };
}

export const rect = (x0: number, y0: number, w: number, h: number): Mask =>
  (x, y) => x >= x0 && x < x0 + w && y >= y0 && y < y0 + h;

export const disc = (cx: number, cy: number, r: number): Mask =>
  (x, y) => (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r;

export const anyOf = (...masks: Mask[]): Mask => (x, y) => masks.some(m => m(x, y));

export const minus = (a: Mask, b: Mask): Mask => (x, y) => a(x, y) && !b(x, y);
```

- [ ] **Step 2：寫失敗的測試**

`src/geometry/trace.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { normalizeRings, polygonArea, polygonsBounds } from './polygon';
import { disc, makeAlpha, minus, rect } from './testUtils';
import { blurAlpha, traceLegacy, tracePrecise } from './trace';

describe('blurAlpha', () => {
  it('returns a copy when radius is 0', () => {
    const src = [0, 0, 255, 0, 0];
    const out = blurAlpha(src, 5, 1, 0);
    expect(Array.from(out)).toEqual(src);
  });

  it('box-blurs with clamped edges and truncation', () => {
    expect(Array.from(blurAlpha([0, 0, 255, 0, 0], 5, 1, 1))).toEqual([0, 85, 85, 85, 0]);
  });
});

describe('tracePrecise', () => {
  it('returns nothing for a fully transparent image', () => {
    expect(tracePrecise(makeAlpha(20, 20, () => false), 128)).toEqual([]);
  });

  it('traces a square on pixel edges at threshold 128', () => {
    const rings = tracePrecise(makeAlpha(40, 40, rect(10, 10, 20, 20)), 128);
    const b = polygonsBounds(normalizeRings(rings));
    expect(b?.minX).toBeCloseTo(10, 1);
    expect(b?.maxX).toBeCloseTo(30, 1);
    expect(b?.minY).toBeCloseTo(10, 1);
    expect(b?.maxY).toBeCloseTo(30, 1);
  });

  it('returns open rings', () => {
    const [ring] = tracePrecise(makeAlpha(40, 40, rect(10, 10, 20, 20)), 128);
    expect(ring[0]).not.toEqual(ring[ring.length - 1]);
  });

  it('approximates a disc area within 2%', () => {
    const polys = normalizeRings(tracePrecise(makeAlpha(120, 120, disc(60, 60, 50)), 128));
    expect(polys).toHaveLength(1);
    const expected = Math.PI * 50 * 50;
    expect(Math.abs(polygonArea(polys[0]) - expected) / expected).toBeLessThan(0.02);
  });

  it('keeps holes', () => {
    const img = makeAlpha(120, 120, minus(disc(60, 60, 40), disc(60, 60, 20)));
    const polys = normalizeRings(tracePrecise(img, 128));
    expect(polys).toHaveLength(1);
    expect(polys[0].holes).toHaveLength(1);
  });
});

describe('traceLegacy', () => {
  const img = makeAlpha(60, 60, rect(20, 20, 20, 20));

  it('expands the outline through blur', () => {
    const b = polygonsBounds(normalizeRings(traceLegacy(img, 5, 10)));
    expect(b?.minX).toBeLessThan(17);
    expect(b?.minX).toBeGreaterThan(12);
  });

  it('treats blur 0 as blur 1 like the old implementation', () => {
    expect(traceLegacy(img, 0, 128)).toEqual(traceLegacy(img, 1, 128));
  });
});
```

- [ ] **Step 3：確認測試失敗**

Run: `npx vitest run src/geometry/trace.test.ts`
Expected: FAIL，`Failed to resolve import "./trace"`

- [ ] **Step 4：實作 `src/geometry/trace.ts`**

模糊的演算法照搬 `src/utils/imageProcessing.ts` 的 `blurAlphaChannel`（包含 `Uint8Array` 的截斷行為），但改成回傳新陣列、不修改輸入。

```ts
import { contours } from 'd3-contour';
import type { AlphaImage, Point, Ring } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 水平與垂直各一次的 box blur；和舊版 blurAlphaChannel 的結果完全相同 */
export function blurAlpha(alpha: ArrayLike<number>, width: number, height: number, radius: number): Uint8Array {
  const len = width * height;
  const source = Uint8Array.from({ length: len }, (_, i) => alpha[i]);
  if (radius <= 0) return source;

  const count = radius * 2 + 1;
  const temp = new Uint8Array(len);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += source[y * width + clamp(x + k, 0, width - 1)];
      temp[y * width + x] = sum / count;
    }
  }

  const out = new Uint8Array(len);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += temp[clamp(y + k, 0, height - 1) * width + x];
      out[y * width + x] = sum / count;
    }
  }
  return out;
}

const openRing = (ring: Point[]): Ring => {
  if (ring.length < 2) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : ring;
};

/** 在 threshold 取等值線；座標系與圖片 px 相同（像素 i 佔 [i, i+1]） */
export function traceRings(values: ArrayLike<number>, width: number, height: number, threshold: number): Ring[] {
  const [multiPolygon] = contours().size([width, height]).thresholds([threshold])(values as unknown as number[]);
  if (!multiPolygon) return [];
  return multiPolygon.coordinates.flatMap(polygon =>
    polygon.map(ring => openRing(ring.map(([x, y]) => [x, y] as const))),
  );
}

export const tracePrecise = (img: AlphaImage, alphaThreshold: number): Ring[] =>
  traceRings(img.alpha, img.width, img.height, alphaThreshold);

export const traceLegacy = (img: AlphaImage, blurPx: number, threshold: number): Ring[] =>
  traceRings(blurAlpha(img.alpha, img.width, img.height, Math.max(1, blurPx)), img.width, img.height, threshold);
```

- [ ] **Step 5：確認測試通過**

Run: `npx vitest run src/geometry/trace.test.ts`
Expected: PASS（9 tests）

- [ ] **Step 6：驗證並 commit**

Run: `npm run typecheck && npm test`

```bash
git add src/geometry/testUtils.ts src/geometry/trace.ts src/geometry/trace.test.ts
git commit -m "feat: trace alpha contours for precise and legacy modes

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.5：刀模 pipeline 與自動橋接

**Files:**
- Create: `src/geometry/autoBridge.ts`、`src/geometry/cutline.ts`
- Test: `src/geometry/autoBridge.test.ts`、`src/geometry/cutline.test.ts`

**Interfaces:**
- Consumes：`inflate`、`fillHoles`、`prepareBase` from `polygon.ts`；`tracePrecise`、`traceLegacy` from `trace.ts`；`MSG_NO_OPAQUE`、`disconnectedMessage` from `messages.ts`
- Produces：
  ```ts
  // autoBridge.ts
  export function closeAndFill(base: readonly Polygon[], offsetPx: number, radiusPx: number): Polygon[]
  export function findBridgeRadius(base: readonly Polygon[], offsetPx: number, maxPx: number, precisionPx: number): number
  // cutline.ts
  export function buildCutline(img: AlphaImage, p: CutlineParamsPx): GeometryResult
  ```
  `closeAndFill` = 外擴 `offset + R`、內縮 `R`、補洞。`findBridgeRadius` 回傳能連成一塊的最小 R（區間上界）；已連通回傳 0；上限仍不連通回傳上限。

- [ ] **Step 1：寫自動橋接的失敗測試**

`src/geometry/autoBridge.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { closeAndFill, findBridgeRadius } from './autoBridge';
import { prepareBase } from './polygon';
import { anyOf, makeAlpha, minus, rect } from './testUtils';
import { tracePrecise } from './trace';

const baseOf = (img: ReturnType<typeof makeAlpha>) => prepareBase(tracePrecise(img, 128), 0);
// 兩個 100×100 正方形，中間相距 30px
const twoSquares = baseOf(makeAlpha(300, 160, anyOf(rect(20, 30, 100, 100), rect(150, 30, 100, 100))));
const oneSquare = baseOf(makeAlpha(200, 200, rect(50, 50, 100, 100)));

describe('closeAndFill', () => {
  it('connects islands when offset + radius covers half the gap', () => {
    expect(closeAndFill(twoSquares, 2, 14)).toHaveLength(1);
    expect(closeAndFill(twoSquares, 2, 12)).toHaveLength(2);
  });

  it('fills holes', () => {
    const donut = baseOf(makeAlpha(200, 200, minus(rect(40, 40, 120, 120), rect(80, 80, 40, 40))));
    const [p] = closeAndFill(donut, 0, 0);
    expect(p.holes).toHaveLength(0);
  });
});

describe('findBridgeRadius', () => {
  it('returns 0 when already connected', () => {
    expect(findBridgeRadius(oneSquare, 2, 40, 0.25)).toBe(0);
  });

  it('finds the smallest connecting radius within the precision', () => {
    const r = findBridgeRadius(twoSquares, 2, 40, 0.25);
    expect(closeAndFill(twoSquares, 2, r)).toHaveLength(1);
    expect(closeAndFill(twoSquares, 2, r - 0.25)).toHaveLength(2);
    expect(r).toBeGreaterThan(12.9);
    expect(r).toBeLessThan(13.4);
  });

  it('returns the maximum when it cannot connect', () => {
    expect(findBridgeRadius(twoSquares, 2, 5, 0.25)).toBe(5);
  });

  it('terminates even with zero precision', () => {
    expect(findBridgeRadius(twoSquares, 2, 40, 0)).toBeGreaterThan(12.9);
  });
});
```

- [ ] **Step 2：確認測試失敗**

Run: `npx vitest run src/geometry/autoBridge.test.ts`
Expected: FAIL，`Failed to resolve import "./autoBridge"`

- [ ] **Step 3：實作 `src/geometry/autoBridge.ts`**

```ts
import { fillHoles, inflate } from './polygon';
import type { Polygon } from './types';

const MIN_PRECISION_PX = 0.01;

/** 外擴 offset 後做半徑 R 的 closing，再補洞 */
export function closeAndFill(base: readonly Polygon[], offsetPx: number, radiusPx: number): Polygon[] {
  const grown = inflate(base, offsetPx + radiusPx);
  const closed = radiusPx > 0 ? inflate(grown, -radiusPx) : grown;
  return fillHoles(closed);
}

/**
 * R 越大 closing 結果越大、區塊數不會增加，所以可以二分搜尋。
 * 回傳能連成一塊的最小 R（區間上界，保證連通）；上限仍不連通時回傳上限。
 */
export function findBridgeRadius(
  base: readonly Polygon[],
  offsetPx: number,
  maxPx: number,
  precisionPx: number,
): number {
  const connected = (r: number) => closeAndFill(base, offsetPx, r).length <= 1;
  if (connected(0)) return 0;
  if (!connected(maxPx)) return maxPx;

  const step = Math.max(precisionPx, MIN_PRECISION_PX);
  let lo = 0;
  let hi = maxPx;
  while (hi - lo > step) {
    const mid = (lo + hi) / 2;
    if (connected(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}
```

- [ ] **Step 4：確認測試通過**

Run: `npx vitest run src/geometry/autoBridge.test.ts`
Expected: PASS（6 tests）

- [ ] **Step 5：寫刀模 pipeline 的失敗測試**

`src/geometry/cutline.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { buildCutline } from './cutline';
import { MSG_NO_OPAQUE } from './messages';
import { polygonsBounds } from './polygon';
import { anyOf, makeAlpha, minus, rect } from './testUtils';
import type { CutlineParamsPx } from './types';

const params = (overrides: Partial<CutlineParamsPx> = {}): CutlineParamsPx => ({
  mode: 'precise',
  alphaThreshold: 128,
  offsetPx: 2,
  legacyBlurPx: 5,
  legacyThreshold: 10,
  minIslandAreaPx2: 0,
  singleConnected: true,
  bridgeMode: 'auto',
  bridgeRadiusPx: 5,
  bridgeMaxPx: 40,
  bridgePrecisionPx: 0.25,
  ...overrides,
});

const square = makeAlpha(200, 200, rect(50, 50, 100, 100));
const twoSquares = makeAlpha(300, 160, anyOf(rect(20, 30, 100, 100), rect(150, 30, 100, 100)));
const donut = makeAlpha(200, 200, minus(rect(40, 40, 120, 120), rect(80, 80, 40, 40)));

describe('buildCutline', () => {
  it('offsets by the exact distance', () => {
    const { polygons } = buildCutline(square, params({ offsetPx: 10, singleConnected: false }));
    const b = polygonsBounds(polygons);
    expect(b?.minX).toBeCloseTo(40, 0);
    expect(b?.maxX).toBeCloseTo(160, 0);
  });

  it('keeps separate islands when single-connected is off', () => {
    const result = buildCutline(twoSquares, params({ singleConnected: false }));
    expect(result.polygons).toHaveLength(2);
    expect(result.warnings).toEqual([]);
  });

  it('bridges islands into one closed outline in auto mode', () => {
    const result = buildCutline(twoSquares, params());
    expect(result.polygons).toHaveLength(1);
    expect(result.polygons[0].holes).toHaveLength(0);
    expect(result.warnings).toEqual([]);
    expect(result.stats.bridgeRadiusPx).toBeGreaterThan(12.9);
    expect(result.stats.bridgeRadiusPx).toBeLessThan(13.4);
  });

  it('warns when a manual radius is too small', () => {
    const result = buildCutline(twoSquares, params({ bridgeMode: 'manual', bridgeRadiusPx: 5 }));
    expect(result.polygons).toHaveLength(2);
    expect(result.warnings).toEqual(['仍有 2 個分離區塊']);
    expect(result.stats.bridgeRadiusPx).toBe(5);
  });

  it('warns when auto mode hits the maximum', () => {
    const result = buildCutline(twoSquares, params({ bridgeMaxPx: 5 }));
    expect(result.stats.bridgeRadiusPx).toBe(5);
    expect(result.warnings).toEqual(['仍有 2 個分離區塊']);
  });

  it('fills holes only in single-connected mode', () => {
    expect(buildCutline(donut, params()).polygons[0].holes).toHaveLength(0);
    expect(buildCutline(donut, params({ singleConnected: false })).polygons[0].holes).toHaveLength(1);
  });

  it('removes small islands', () => {
    const img = makeAlpha(200, 200, anyOf(rect(50, 50, 100, 100), rect(185, 185, 2, 2)));
    const result = buildCutline(img, params({ singleConnected: false, minIslandAreaPx2: 10 }));
    expect(result.polygons).toHaveLength(1);
  });

  it('reports an empty image', () => {
    const result = buildCutline(makeAlpha(50, 50, () => false), params());
    expect(result).toEqual({ polygons: [], warnings: [MSG_NO_OPAQUE], stats: { islandCount: 0 } });
  });

  it('uses blur for the offset in legacy mode and ignores offsetPx', () => {
    const legacy = (offsetPx: number) =>
      buildCutline(square, params({ mode: 'legacy', offsetPx, singleConnected: false }));
    const b = polygonsBounds(legacy(0).polygons);
    expect(b?.minX).toBeLessThan(48);
    expect(b?.minX).toBeGreaterThan(40);
    expect(legacy(30)).toEqual(legacy(0));
  });
});
```

- [ ] **Step 6：確認測試失敗**

Run: `npx vitest run src/geometry/cutline.test.ts`
Expected: FAIL，`Failed to resolve import "./cutline"`

- [ ] **Step 7：實作 `src/geometry/cutline.ts`**

```ts
import { closeAndFill, findBridgeRadius } from './autoBridge';
import { disconnectedMessage, MSG_NO_OPAQUE } from './messages';
import { inflate, prepareBase } from './polygon';
import { traceLegacy, tracePrecise } from './trace';
import type { AlphaImage, CutlineParamsPx, GeometryResult, Ring } from './types';

const traceFor = (img: AlphaImage, p: CutlineParamsPx): Ring[] =>
  p.mode === 'precise'
    ? tracePrecise(img, p.alphaThreshold)
    : traceLegacy(img, p.legacyBlurPx, p.legacyThreshold);

export function buildCutline(img: AlphaImage, p: CutlineParamsPx): GeometryResult {
  const base = prepareBase(traceFor(img, p), p.minIslandAreaPx2);
  if (base.length === 0) {
    return { polygons: [], warnings: [MSG_NO_OPAQUE], stats: { islandCount: 0 } };
  }

  // 舊模式的外擴距離由模糊決定
  const offsetPx = p.mode === 'precise' ? p.offsetPx : 0;

  if (!p.singleConnected) {
    const polygons = inflate(base, offsetPx);
    return { polygons, warnings: [], stats: { islandCount: polygons.length } };
  }

  const radiusPx =
    p.bridgeMode === 'auto'
      ? findBridgeRadius(base, offsetPx, p.bridgeMaxPx, p.bridgePrecisionPx)
      : p.bridgeRadiusPx;
  const polygons = closeAndFill(base, offsetPx, radiusPx);
  const warnings = polygons.length > 1 ? [disconnectedMessage(polygons.length)] : [];
  return { polygons, warnings, stats: { islandCount: polygons.length, bridgeRadiusPx: radiusPx } };
}
```

- [ ] **Step 8：確認測試通過**

Run: `npx vitest run src/geometry`
Expected: PASS（cutline 9 tests，其他檔案維持通過）

- [ ] **Step 9：驗證並 commit**

Run: `npm run typecheck && npm test`

```bash
git add src/geometry/autoBridge.ts src/geometry/autoBridge.test.ts src/geometry/cutline.ts src/geometry/cutline.test.ts
git commit -m "feat: build single-connected cut lines with auto bridging

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.6：白墨 pipeline

**Files:**
- Create: `src/geometry/underprint.ts`
- Test: `src/geometry/underprint.test.ts`

**Interfaces:**
- Consumes：`prepareBase`、`inflate`、`removeSmallIslands`、`fillHoles` from `polygon.ts`；`tracePrecise`；`MSG_NO_OPAQUE`、`MSG_NOTHING_LEFT`
- Produces：`export function buildUnderprint(img: AlphaImage, p: UnderprintParamsPx): GeometryResult`

- [ ] **Step 1：寫失敗的測試**

`src/geometry/underprint.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { MSG_NO_OPAQUE, MSG_NOTHING_LEFT } from './messages';
import { polygonsBounds } from './polygon';
import { anyOf, makeAlpha, minus, rect } from './testUtils';
import type { UnderprintParamsPx } from './types';
import { buildUnderprint } from './underprint';

const params = (overrides: Partial<UnderprintParamsPx> = {}): UnderprintParamsPx => ({
  alphaThreshold: 128,
  insetPx: 2,
  minIslandAreaPx2: 0,
  fillHoles: false,
  ...overrides,
});

const square = makeAlpha(200, 200, rect(50, 50, 100, 100));

describe('buildUnderprint', () => {
  it('insets by the exact distance', () => {
    const b = polygonsBounds(buildUnderprint(square, params()).polygons);
    expect(b?.minX).toBeCloseTo(52, 0);
    expect(b?.maxX).toBeCloseTo(148, 0);
  });

  it('keeps the traced edge when inset is 0', () => {
    const b = polygonsBounds(buildUnderprint(square, params({ insetPx: 0 })).polygons);
    expect(b?.minX).toBeCloseTo(50, 0);
  });

  it('removes lines thinner than twice the inset', () => {
    const result = buildUnderprint(makeAlpha(120, 140, rect(50, 20, 4, 100)), params({ insetPx: 3 }));
    expect(result.polygons).toEqual([]);
    expect(result.warnings).toEqual([MSG_NOTHING_LEFT]);
  });

  it('keeps holes unless fillHoles is on', () => {
    const donut = makeAlpha(200, 200, minus(rect(40, 40, 120, 120), rect(80, 80, 40, 40)));
    expect(buildUnderprint(donut, params()).polygons[0].holes).toHaveLength(1);
    expect(buildUnderprint(donut, params({ fillHoles: true })).polygons[0].holes).toHaveLength(0);
  });

  it('allows multiple islands', () => {
    const img = makeAlpha(300, 160, anyOf(rect(20, 30, 100, 100), rect(150, 30, 100, 100)));
    const result = buildUnderprint(img, params());
    expect(result.polygons).toHaveLength(2);
    expect(result.stats.islandCount).toBe(2);
  });

  it('reports an empty image', () => {
    const result = buildUnderprint(makeAlpha(50, 50, () => false), params());
    expect(result.warnings).toEqual([MSG_NO_OPAQUE]);
  });
});
```

- [ ] **Step 2：確認測試失敗**

Run: `npx vitest run src/geometry/underprint.test.ts`
Expected: FAIL，`Failed to resolve import "./underprint"`

- [ ] **Step 3：實作 `src/geometry/underprint.ts`**

```ts
import { MSG_NO_OPAQUE, MSG_NOTHING_LEFT } from './messages';
import { fillHoles, inflate, prepareBase, removeSmallIslands } from './polygon';
import { tracePrecise } from './trace';
import type { AlphaImage, GeometryResult, UnderprintParamsPx } from './types';

export function buildUnderprint(img: AlphaImage, p: UnderprintParamsPx): GeometryResult {
  const base = prepareBase(tracePrecise(img, p.alphaThreshold), p.minIslandAreaPx2);
  if (base.length === 0) {
    return { polygons: [], warnings: [MSG_NO_OPAQUE], stats: { islandCount: 0 } };
  }

  // 內縮後細的部分可能分裂出小碎片，再去一次雜點
  const shrunk = removeSmallIslands(inflate(base, -p.insetPx), p.minIslandAreaPx2);
  const polygons = p.fillHoles ? fillHoles(shrunk) : shrunk;
  const warnings = polygons.length === 0 ? [MSG_NOTHING_LEFT] : [];
  return { polygons, warnings, stats: { islandCount: polygons.length } };
}
```

- [ ] **Step 4：確認測試通過**

Run: `npx vitest run src/geometry/underprint.test.ts`
Expected: PASS（6 tests）

- [ ] **Step 5：驗證並 commit**

Run: `npm run typecheck && npm test`

```bash
git add src/geometry/underprint.ts src/geometry/underprint.test.ts
git commit -m "feat: build underprint areas by insetting the artwork outline

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.7：Worker 與 client

**Files:**
- Create: `src/geometry/handler.ts`、`src/geometry/worker.ts`、`src/geometry/client.ts`
- Test: `src/geometry/handler.test.ts`、`src/geometry/handler.error.test.ts`、`src/geometry/client.test.ts`

**Interfaces:**
- Consumes：`buildCutline`、`buildUnderprint`；`WorkerRequest`、`WorkerResponse` 等型別
- Produces：
  ```ts
  // handler.ts
  export type RequestHandler = (req: WorkerRequest) => WorkerResponse | null;
  export function createRequestHandler(): RequestHandler
  // client.ts
  export interface WorkerLike {
    postMessage(message: WorkerRequest, transfer?: Transferable[]): void;
    addEventListener(type: 'message', listener: (event: MessageEvent<WorkerResponse>) => void): void;
    terminate(): void;
  }
  export interface JobParams { cutline: CutlineParamsPx; underprint: UnderprintParamsPx }
  export class GeometryClient {
    constructor(worker: WorkerLike);
    setImage(imageId: string, image: AlphaImage): void;   // 傳送 alpha 的複本（transfer）
    dropImage(imageId: string): void;
    run(kind: 'cutline', imageId: string, params: CutlineParamsPx): Promise<GeometryResult | null>;
    run(kind: 'underprint', imageId: string, params: UnderprintParamsPx): Promise<GeometryResult | null>;
    terminate(): void;
  }
  export function createGeometryClient(): GeometryClient
  ```
  `run` 在同一種工作被更新的工作取代時 resolve `null`；worker 回報錯誤時 reject。

- [ ] **Step 1：寫 handler 的失敗測試**

`src/geometry/handler.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { createRequestHandler } from './handler';
import { cutlineParamsToPx, DEFAULT_CUTLINE_PARAMS, DEFAULT_UNDERPRINT_PARAMS, underprintParamsToPx } from './params';
import { makeAlpha, rect } from './testUtils';

const img = makeAlpha(100, 100, rect(20, 20, 60, 60));
const cutParams = cutlineParamsToPx(DEFAULT_CUTLINE_PARAMS, 300);
const underParams = underprintParamsToPx(DEFAULT_UNDERPRINT_PARAMS, 300);

describe('createRequestHandler', () => {
  it('stores images without responding', () => {
    const handle = createRequestHandler();
    expect(handle({ type: 'setImage', imageId: 'a', ...img })).toBeNull();
    expect(handle({ type: 'dropImage', imageId: 'a' })).toBeNull();
  });

  it('runs cutline and underprint jobs on a stored image', () => {
    const handle = createRequestHandler();
    handle({ type: 'setImage', imageId: 'a', ...img });

    const cut = handle({ type: 'cutline', jobId: 1, imageId: 'a', params: cutParams });
    expect(cut).toMatchObject({ type: 'result', jobId: 1, stats: { islandCount: 1 } });

    const under = handle({ type: 'underprint', jobId: 2, imageId: 'a', params: underParams });
    expect(under).toMatchObject({ type: 'result', jobId: 2, stats: { islandCount: 1 } });
  });

  it('reports a missing image', () => {
    const handle = createRequestHandler();
    handle({ type: 'setImage', imageId: 'a', ...img });
    handle({ type: 'dropImage', imageId: 'a' });
    expect(handle({ type: 'cutline', jobId: 3, imageId: 'a', params: cutParams })).toEqual({
      type: 'error',
      jobId: 3,
      message: '找不到圖片 a',
    });
  });
});
```

`src/geometry/handler.error.test.ts`（另一個檔案，因為 `vi.mock` 會影響整個檔案）：

```ts
import { describe, expect, it, vi } from 'vitest';
import { createRequestHandler } from './handler';
import { cutlineParamsToPx, DEFAULT_CUTLINE_PARAMS } from './params';
import { makeAlpha, rect } from './testUtils';

vi.mock('./cutline', () => ({
  buildCutline: () => {
    throw new Error('boom');
  },
}));

describe('createRequestHandler errors', () => {
  it('turns exceptions into error responses', () => {
    const handle = createRequestHandler();
    handle({ type: 'setImage', imageId: 'a', ...makeAlpha(10, 10, rect(2, 2, 5, 5)) });
    const params = cutlineParamsToPx(DEFAULT_CUTLINE_PARAMS, 300);
    expect(handle({ type: 'cutline', jobId: 1, imageId: 'a', params })).toEqual({
      type: 'error',
      jobId: 1,
      message: 'boom',
    });
  });
});
```

- [ ] **Step 2：確認測試失敗**

Run: `npx vitest run src/geometry/handler`
Expected: FAIL，`Failed to resolve import "./handler"`

- [ ] **Step 3：實作 `src/geometry/handler.ts`**

```ts
import { buildCutline } from './cutline';
import { buildUnderprint } from './underprint';
import type { AlphaImage, GeometryResult, WorkerRequest, WorkerResponse } from './types';

export type RequestHandler = (req: WorkerRequest) => WorkerResponse | null;

export function createRequestHandler(): RequestHandler {
  const images = new Map<string, AlphaImage>();

  const run = (jobId: number, imageId: string, build: (img: AlphaImage) => GeometryResult): WorkerResponse => {
    const img = images.get(imageId);
    if (!img) return { type: 'error', jobId, message: `找不到圖片 ${imageId}` };
    try {
      return { type: 'result', jobId, ...build(img) };
    } catch (err) {
      return { type: 'error', jobId, message: err instanceof Error ? err.message : String(err) };
    }
  };

  return req => {
    switch (req.type) {
      case 'setImage':
        images.set(req.imageId, { width: req.width, height: req.height, alpha: req.alpha });
        return null;
      case 'dropImage':
        images.delete(req.imageId);
        return null;
      case 'cutline':
        return run(req.jobId, req.imageId, img => buildCutline(img, req.params));
      case 'underprint':
        return run(req.jobId, req.imageId, img => buildUnderprint(img, req.params));
    }
  };
}
```

- [ ] **Step 4：確認 handler 測試通過**

Run: `npx vitest run src/geometry/handler`
Expected: PASS（4 tests）

- [ ] **Step 5：寫 client 的失敗測試**

`src/geometry/client.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { GeometryClient, type WorkerLike } from './client';
import { cutlineParamsToPx, DEFAULT_CUTLINE_PARAMS, DEFAULT_UNDERPRINT_PARAMS, underprintParamsToPx } from './params';
import type { WorkerRequest, WorkerResponse } from './types';

class FakeWorker implements WorkerLike {
  posted: { message: WorkerRequest; transfer?: Transferable[] }[] = [];
  terminated = false;
  private listener: ((event: MessageEvent<WorkerResponse>) => void) | null = null;

  postMessage(message: WorkerRequest, transfer?: Transferable[]): void {
    this.posted.push({ message, transfer });
  }
  addEventListener(_type: 'message', listener: (event: MessageEvent<WorkerResponse>) => void): void {
    this.listener = listener;
  }
  terminate(): void {
    this.terminated = true;
  }
  respond(response: WorkerResponse): void {
    this.listener?.({ data: response } as MessageEvent<WorkerResponse>);
  }
}

const RESULT = { polygons: [], warnings: [], stats: { islandCount: 0 } };
const cutParams = cutlineParamsToPx(DEFAULT_CUTLINE_PARAMS, 300);
const underParams = underprintParamsToPx(DEFAULT_UNDERPRINT_PARAMS, 300);

const setup = () => {
  const worker = new FakeWorker();
  return { worker, client: new GeometryClient(worker) };
};

describe('GeometryClient', () => {
  it('transfers a copy of the alpha channel', () => {
    const { worker, client } = setup();
    const image = { width: 2, height: 1, alpha: new Uint8ClampedArray([1, 2]) };
    client.setImage('img', image);
    const { message, transfer } = worker.posted[0];
    expect(message).toMatchObject({ type: 'setImage', imageId: 'img', width: 2, height: 1 });
    if (message.type !== 'setImage') throw new Error('unexpected message');
    expect(message.alpha).not.toBe(image.alpha);
    expect(Array.from(message.alpha)).toEqual([1, 2]);
    expect(transfer).toEqual([message.alpha.buffer]);
  });

  it('posts dropImage', () => {
    const { worker, client } = setup();
    client.dropImage('img');
    expect(worker.posted[0].message).toEqual({ type: 'dropImage', imageId: 'img' });
  });

  it('resolves the latest job with its result', async () => {
    const { worker, client } = setup();
    const job = client.run('cutline', 'img', cutParams);
    expect(worker.posted[0].message).toEqual({ type: 'cutline', jobId: 1, imageId: 'img', params: cutParams });
    worker.respond({ type: 'result', jobId: 1, ...RESULT });
    await expect(job).resolves.toEqual(RESULT);
  });

  it('resolves superseded jobs of the same kind with null', async () => {
    const { worker, client } = setup();
    const first = client.run('cutline', 'img', cutParams);
    const second = client.run('cutline', 'img', cutParams);
    worker.respond({ type: 'result', jobId: 1, ...RESULT });
    worker.respond({ type: 'result', jobId: 2, ...RESULT });
    await expect(first).resolves.toBeNull();
    await expect(second).resolves.toEqual(RESULT);
  });

  it('does not let different kinds supersede each other', async () => {
    const { worker, client } = setup();
    const cut = client.run('cutline', 'img', cutParams);
    client.run('underprint', 'img', underParams);
    worker.respond({ type: 'result', jobId: 1, ...RESULT });
    await expect(cut).resolves.toEqual(RESULT);
  });

  it('rejects on worker errors', async () => {
    const { worker, client } = setup();
    const job = client.run('cutline', 'img', cutParams);
    worker.respond({ type: 'error', jobId: 1, message: 'boom' });
    await expect(job).rejects.toThrow('boom');
  });

  it('ignores unknown job ids', () => {
    const { worker } = setup();
    expect(() => worker.respond({ type: 'result', jobId: 99, ...RESULT })).not.toThrow();
  });

  it('resolves pending jobs with null on terminate', async () => {
    const { worker, client } = setup();
    const job = client.run('cutline', 'img', cutParams);
    client.terminate();
    expect(worker.terminated).toBe(true);
    await expect(job).resolves.toBeNull();
  });
});
```

- [ ] **Step 6：確認測試失敗**

Run: `npx vitest run src/geometry/client.test.ts`
Expected: FAIL，`Failed to resolve import "./client"`

- [ ] **Step 7：實作 `src/geometry/client.ts`**

```ts
import type {
  AlphaImage,
  CutlineParamsPx,
  GeometryJobKind,
  GeometryResult,
  UnderprintParamsPx,
  WorkerRequest,
  WorkerResponse,
} from './types';

export interface WorkerLike {
  postMessage(message: WorkerRequest, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<WorkerResponse>) => void): void;
  terminate(): void;
}

export interface JobParams {
  cutline: CutlineParamsPx;
  underprint: UnderprintParamsPx;
}

interface PendingJob {
  kind: GeometryJobKind;
  resolve: (result: GeometryResult | null) => void;
  reject: (error: Error) => void;
}

export class GeometryClient {
  private nextJobId = 1;
  private readonly latest: Record<GeometryJobKind, number> = { cutline: 0, underprint: 0 };
  private readonly pending = new Map<number, PendingJob>();

  constructor(private readonly worker: WorkerLike) {
    worker.addEventListener('message', event => this.handleResponse(event.data));
  }

  setImage(imageId: string, image: AlphaImage): void {
    const alpha = image.alpha.slice();
    this.worker.postMessage(
      { type: 'setImage', imageId, width: image.width, height: image.height, alpha },
      [alpha.buffer],
    );
  }

  dropImage(imageId: string): void {
    this.worker.postMessage({ type: 'dropImage', imageId });
  }

  run<K extends GeometryJobKind>(kind: K, imageId: string, params: JobParams[K]): Promise<GeometryResult | null> {
    const jobId = this.nextJobId++;
    this.latest[kind] = jobId;
    return new Promise((resolve, reject) => {
      this.pending.set(jobId, { kind, resolve, reject });
      this.worker.postMessage({ type: kind, jobId, imageId, params } as WorkerRequest);
    });
  }

  terminate(): void {
    this.worker.terminate();
    this.pending.forEach(job => job.resolve(null));
    this.pending.clear();
  }

  private handleResponse(response: WorkerResponse): void {
    const job = this.pending.get(response.jobId);
    if (!job) return;
    this.pending.delete(response.jobId);

    if (response.jobId !== this.latest[job.kind]) {
      job.resolve(null);
      return;
    }
    if (response.type === 'error') {
      job.reject(new Error(response.message));
      return;
    }
    const { polygons, warnings, stats } = response;
    job.resolve({ polygons, warnings, stats });
  }
}

export function createGeometryClient(): GeometryClient {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  return new GeometryClient(worker);
}
```

- [ ] **Step 8：實作 worker 進入點 `src/geometry/worker.ts`**

```ts
import { createRequestHandler } from './handler';
import type { WorkerRequest, WorkerResponse } from './types';

interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse): void;
}

const scope = self as unknown as WorkerScope;
const handle = createRequestHandler();

scope.onmessage = event => {
  const response = handle(event.data);
  if (response) scope.postMessage(response);
};
```

- [ ] **Step 9：確認測試通過**

Run: `npx vitest run src/geometry`
Expected: PASS（client 8 tests，其他全部維持通過）

- [ ] **Step 10：驗證 build 會打包 worker**

`createGeometryClient` 還沒有被任何地方 import，Vite 不會打包 worker。暫時在 `src/App.tsx` 頂端加一行（第 3 階段 Task 3.4 會改成正式用法）：

```ts
import { createGeometryClient } from './geometry/client';
void createGeometryClient;
```

Run: `npm run typecheck && npm test && npm run build`
Expected: 全部通過，build 輸出列表中出現 `dist/assets/worker-*.js`。

- [ ] **Step 11：Commit**

```bash
git add src/geometry/handler.ts src/geometry/handler.test.ts src/geometry/handler.error.test.ts src/geometry/client.ts src/geometry/client.test.ts src/geometry/worker.ts src/App.tsx
git commit -m "feat: run geometry pipelines in a web worker with latest-job client

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
