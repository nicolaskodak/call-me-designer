# 第 1 階段：測試工具與整理

先讀 index 的 Global Constraints。這個階段不改變任何使用者看得到的功能，除了分頁名稱從 Mockup 改成 Imposition。

---

### Task 1.1：測試工具、tsconfig、刪除舊檔

**Files:**
- Modify: `package.json`（devDependencies、scripts）
- Create: `vitest.config.ts`
- Modify: `tsconfig.json`（加上 `include`）
- Delete: `components/EditorCanvas.tsx`（根目錄的舊檔，沒有被 import，且讓 tsc 報錯）

**Interfaces:**
- Produces：`npm run typecheck`、`npm test`、`npm run test:watch`、`npm run test:coverage` 四個 script。測試檔命名為 `src/**/*.test.ts(x)`；需要 DOM 的測試檔第一行加 `// @vitest-environment jsdom`。

- [ ] **Step 1：確認現況會失敗**

Run: `npx tsc --noEmit -p .`
Expected: FAIL，`components/EditorCanvas.tsx(4,26): error TS2307: Cannot find module '../types'`

- [ ] **Step 2：安裝測試工具**

```bash
npm i -D -E vitest@3.2.7 @vitest/coverage-v8@3.2.7 jsdom@26.1.0
```

- [ ] **Step 3：加入 scripts**

在 `package.json` 的 `"scripts"` 中，保留原有項目，加入：

```json
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
```

- [ ] **Step 4：建立 `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      // 報告放在 node_modules 底下，不會在專案根目錄產生未追蹤的檔案（不修改 .gitignore）
      reportsDirectory: 'node_modules/.cache/vitest-coverage',
      include: [
        'src/units.ts',
        'src/geometry/**/*.ts',
        'src/services/**/*.ts',
        'src/settings/**/*.ts',
        'src/imposition/**/*.ts',
        'src/export/**/*.ts',
        'src/editor/pathHistory.ts',
        'src/editor/guardMessage.ts',
        'src/utils/**/*.ts',
      ],
      exclude: [
        '**/*.test.ts',
        'src/geometry/testUtils.ts',
        'src/geometry/worker.ts',
        'src/imposition/measureSvg.ts',
        'src/utils/imageProcessing.ts',
      ],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
```

- [ ] **Step 5：限制 tsc 的檢查範圍**

`tsconfig.json` 目前沒有 `include`，會連 `backup/`、`docs/` 一起檢查。在 `"compilerOptions"` 物件之後加上：

```json
  ,
  "include": ["src", "e2e", "vite.config.ts", "vitest.config.ts", "playwright.config.ts"]
```

（注意 JSON 逗號：`"compilerOptions": { ... },` 然後是 `"include": [...]`。）

- [ ] **Step 6：刪除根目錄舊檔**

```bash
git rm components/EditorCanvas.tsx
```

- [ ] **Step 7：驗證**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck 沒有錯誤；vitest 顯示 `No test files found, exiting with code 0`；build 成功。

- [ ] **Step 8：Commit**

```bash
git add package.json package-lock.json vitest.config.ts tsconfig.json
git commit -m "chore: add vitest tooling and remove stale root component

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

（`git rm` 已經 stage 了刪除，不需要再 add。）

---

### Task 1.2：抽出排版演算法

**Files:**
- Create: `src/imposition/packing.ts`
- Test: `src/imposition/packing.test.ts`
- Modify: `src/App.tsx`（刪除第 164–257 行的型別與 `packWithinBoundary`，改為 import）

**Interfaces:**
- Produces：
  ```ts
  export interface PackRect { id: string; w: number; h: number }
  export interface PackPlacement { id: string; x: number; y: number; rotationDeg: 0 | 90 }
  export interface PackResult { placed: PackPlacement[]; notPlaced: string[] }
  export function packWithinBoundary(rects: readonly PackRect[], boundaryWidth: number, boundaryHeight: number, allowRotate90: boolean): PackResult
  ```
  演算法與單位無關，第 5 階段會直接用 mm 呼叫。

- [ ] **Step 1：寫失敗的測試**

`src/imposition/packing.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { packWithinBoundary } from './packing';

describe('packWithinBoundary', () => {
  it('places a single rect at the origin', () => {
    const result = packWithinBoundary([{ id: 'a', w: 10, h: 10 }], 100, 100, false);
    expect(result).toEqual({ placed: [{ id: 'a', x: 0, y: 0, rotationDeg: 0 }], notPlaced: [] });
  });

  it('places two equal rects side by side', () => {
    const result = packWithinBoundary(
      [{ id: 'a', w: 50, h: 50 }, { id: 'b', w: 50, h: 50 }],
      100, 50, false,
    );
    expect(result.placed).toEqual([
      { id: 'a', x: 0, y: 0, rotationDeg: 0 },
      { id: 'b', x: 50, y: 0, rotationDeg: 0 },
    ]);
    expect(result.notPlaced).toEqual([]);
  });

  it('places larger rects first', () => {
    const result = packWithinBoundary(
      [{ id: 's', w: 10, h: 10 }, { id: 'b', w: 100, h: 90 }],
      100, 100, false,
    );
    expect(result.placed).toEqual([
      { id: 'b', x: 0, y: 0, rotationDeg: 0 },
      { id: 's', x: 0, y: 90, rotationDeg: 0 },
    ]);
  });

  it('reports rects that do not fit', () => {
    const result = packWithinBoundary([{ id: 'a', w: 120, h: 50 }], 100, 150, false);
    expect(result).toEqual({ placed: [], notPlaced: ['a'] });
  });

  it('rotates 90 degrees only when allowed', () => {
    const result = packWithinBoundary([{ id: 'a', w: 120, h: 50 }], 100, 150, true);
    expect(result).toEqual({ placed: [{ id: 'a', x: 0, y: 0, rotationDeg: 90 }], notPlaced: [] });
  });

  it('prefers the unrotated orientation on ties', () => {
    const result = packWithinBoundary([{ id: 'a', w: 50, h: 20 }], 100, 100, true);
    expect(result.placed[0].rotationDeg).toBe(0);
  });

  it('does not mutate the input array', () => {
    const rects = [{ id: 's', w: 10, h: 10 }, { id: 'b', w: 100, h: 90 }];
    packWithinBoundary(rects, 100, 100, false);
    expect(rects.map(r => r.id)).toEqual(['s', 'b']);
  });
});
```

- [ ] **Step 2：確認測試失敗**

Run: `npx vitest run src/imposition/packing.test.ts`
Expected: FAIL，`Failed to resolve import "./packing"`

- [ ] **Step 3：建立 `src/imposition/packing.ts`**

演算法原封不動從 `src/App.tsx:164-257` 搬過來：

```ts
export interface PackRect { id: string; w: number; h: number }
export interface PackPlacement { id: string; x: number; y: number; rotationDeg: 0 | 90 }
export interface PackResult { placed: PackPlacement[]; notPlaced: string[] }

interface FreeRect { x: number; y: number; w: number; h: number }
interface Orientation { w: number; h: number; rotationDeg: 0 | 90 }

const area = (r: { w: number; h: number }) => r.w * r.h;
const fits = (r: FreeRect, w: number, h: number) => w <= r.w && h <= r.h;

const pruneContained = (rects: FreeRect[]): FreeRect[] =>
  rects.filter((a, idx) => {
    const contained = rects.some((b, j) =>
      j !== idx &&
      a.x >= b.x &&
      a.y >= b.y &&
      a.x + a.w <= b.x + b.w &&
      a.y + a.h <= b.y + b.h,
    );
    return !contained && a.w > 0 && a.h > 0;
  });

const splitFreeRect = (r: FreeRect, w: number, h: number): FreeRect[] => {
  // 放在 (r.x, r.y)，切出右邊、下面、右下三塊
  const right: FreeRect = { x: r.x + w, y: r.y, w: r.w - w, h };
  const bottom: FreeRect = { x: r.x, y: r.y + h, w: r.w, h: r.h - h };
  const bottomRight: FreeRect = { x: r.x + w, y: r.y + h, w: r.w - w, h: r.h - h };
  return pruneContained([right, bottom, bottomRight].filter(fr => fr.w > 0 && fr.h > 0));
};

const orientationsOf = (rect: PackRect, allowRotate90: boolean): Orientation[] =>
  allowRotate90 && rect.w !== rect.h
    ? [{ w: rect.w, h: rect.h, rotationDeg: 0 }, { w: rect.h, h: rect.w, rotationDeg: 90 }]
    : [{ w: rect.w, h: rect.h, rotationDeg: 0 }];

interface BestFit { index: number; score: number; opt: Orientation }

const findBestFit = (free: FreeRect[], options: Orientation[]): BestFit | null => {
  let best: BestFit | null = null;
  free.forEach((fr, index) => {
    for (const opt of options) {
      if (!fits(fr, opt.w, opt.h)) continue;
      const score = area(fr) - opt.w * opt.h;
      const better =
        best === null ||
        score < best.score ||
        (score === best.score && opt.rotationDeg === 0 && best.opt.rotationDeg === 90);
      if (better) best = { index, score, opt };
    }
  });
  return best;
};

export function packWithinBoundary(
  rects: readonly PackRect[],
  boundaryWidth: number,
  boundaryHeight: number,
  allowRotate90: boolean,
): PackResult {
  let free: FreeRect[] = [{ x: 0, y: 0, w: boundaryWidth, h: boundaryHeight }];
  const placed: PackPlacement[] = [];
  const notPlaced: string[] = [];

  const sorted = [...rects].sort((a, b) => area(b) - area(a));
  for (const rect of sorted) {
    const best = findBestFit(free, orientationsOf(rect, allowRotate90));
    if (!best) {
      notPlaced.push(rect.id);
      continue;
    }
    const target = free[best.index];
    placed.push({ id: rect.id, x: target.x, y: target.y, rotationDeg: best.opt.rotationDeg });
    const newFree = splitFreeRect(target, best.opt.w, best.opt.h);
    free = pruneContained([...free.slice(0, best.index), ...free.slice(best.index + 1), ...newFree]);
  }

  return { placed, notPlaced };
}
```

- [ ] **Step 4：確認測試通過**

Run: `npx vitest run src/imposition/packing.test.ts`
Expected: PASS（7 tests）

- [ ] **Step 5：App.tsx 改用抽出的模組**

1. 刪除 `src/App.tsx` 中從 `type PackRect = { id: string; w: number; h: number };` 到 `packWithinBoundary` 函式結尾 `};`（原第 164–257 行）的整段。
2. 在檔案頂端的 import 區加上：

```ts
import { packWithinBoundary, type PackPlacement, type PackRect } from './imposition/packing';
```

`handleAutoLayout` 內用到的 `PackRect`、`PackPlacement`、`packWithinBoundary` 名稱不變，其他地方不用改。

- [ ] **Step 6：驗證**

Run: `npm run typecheck && npm test && npm run build`
Expected: 全部通過。

- [ ] **Step 7：Commit**

```bash
git add src/imposition/packing.ts src/imposition/packing.test.ts src/App.tsx
git commit -m "refactor: extract imposition packing algorithm with tests

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 1.3：Mockup 改名為 Imposition

**Files:**
- Rename: `src/components/MockupCanvas.tsx` → `src/components/ImpositionCanvas.tsx`
- Modify: `src/App.tsx`、`src/types.ts`、`src/components/Controls.tsx`、`src/components/ImpositionCanvas.tsx`

**Interfaces:**
- Produces（名稱對照，之後的 task 都用新名稱）：
  - `ActiveTab = 'editor' | 'imposition'`
  - `ImpositionLayer`、`ImpositionInstance`、`ImpositionState`、`DEFAULT_IMPOSITION_STATE`
  - `ImpositionCanvas`、`ImpositionCanvasHandle`
  - App 內：`impositionState`、`setImpositionState`、`impositionRef`、`handleImpositionUpload`、`handleExportImpositionPDF`
  - Controls props：`impositionState`、`setImpositionState`、`onImpositionUpload`、`onExportImpositionPDF`

- [ ] **Step 1：搬移檔案**

```bash
git mv src/components/MockupCanvas.tsx src/components/ImpositionCanvas.tsx
```

- [ ] **Step 2：批次改名**

替換順序有意義（`setMockupState` 會被 `MockupState` 規則一起處理），請整段照抄執行：

```bash
perl -pi -e '
  s/MockupCanvasHandle/ImpositionCanvasHandle/g;
  s/MockupCanvas/ImpositionCanvas/g;
  s/DEFAULT_MOCKUP_STATE/DEFAULT_IMPOSITION_STATE/g;
  s/MockupState/ImpositionState/g;
  s/MockupLayer/ImpositionLayer/g;
  s/MockupInstance/ImpositionInstance/g;
  s/mockupState/impositionState/g;
  s/mockupRef/impositionRef/g;
  s/onMockupUpload/onImpositionUpload/g;
  s/handleMockupUpload/handleImpositionUpload/g;
  s/onExportMockupPDF/onExportImpositionPDF/g;
  s/handleExportMockupPDF/handleExportImpositionPDF/g;
  s/\x27mockup\x27/\x27imposition\x27/g;
  s/mockup-layout\.pdf/imposition-layout.pdf/g;
  s/Mockup Boundary/Imposition Boundary/g;
  s/No Mockup Items/No Imposition Items/g;
  s/compose a mockup/compose an imposition/g;
  s/Mockup item/Imposition item/g;
  s/^(\s*)Mockup$/$1Imposition/;
' src/App.tsx src/types.ts src/components/Controls.tsx src/components/ImpositionCanvas.tsx
```

- [ ] **Step 3：確認沒有殘留**

Run: `grep -rni mockup src`
Expected: 沒有任何輸出。如果還有，手動改掉（通常是註解或字串）。

- [ ] **Step 4：驗證**

Run: `npm run typecheck && npm test && npm run build`
Expected: 全部通過。

- [ ] **Step 5：手動確認（選做，但建議）**

Run: `npm run dev`，開 `http://localhost:3000/`，左側分頁顯示 `Editor` 與 `Imposition`，切到 Imposition 後空狀態顯示 `No Imposition Items`。

- [ ] **Step 6：Commit**

```bash
git add src/App.tsx src/types.ts src/components/Controls.tsx src/components/ImpositionCanvas.tsx
git commit -m "refactor: rename Mockup to Imposition

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 1.4：下載工具函式

**Files:**
- Create: `src/utils/download.ts`
- Test: `src/utils/download.test.ts`
- Modify: `src/components/EditorCanvas.tsx`（三個 SVG 匯出改用 `downloadText`）

**Interfaces:**
- Produces：
  ```ts
  export function downloadBlob(blob: Blob, filename: string): void
  export function downloadText(text: string, filename: string, mimeType: string): void
  ```
  下載後在下一個 tick `URL.revokeObjectURL`，修正現有的 object URL 洩漏。

- [ ] **Step 1：寫失敗的測試**

`src/utils/download.test.ts`：

```ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadBlob, downloadText } from './download';

describe('download', () => {
  const createObjectURL = vi.fn((_blob: Blob) => 'blob:mock');
  const revokeObjectURL = vi.fn((_url: string) => undefined);

  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
  });

  it('clicks a temporary link and revokes the URL on the next tick', () => {
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });

    downloadBlob(new Blob(['x']), 'a.svg');

    expect(downloads).toEqual(['a.svg']);
    expect(document.querySelectorAll('a')).toHaveLength(0);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });

  it('wraps text in a blob with the given mime type', () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    downloadText('<svg/>', 'b.svg', 'image/svg+xml');

    const blob = createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe('image/svg+xml');
    expect(blob.size).toBe(6);
  });
});
```

- [ ] **Step 2：確認測試失敗**

Run: `npx vitest run src/utils/download.test.ts`
Expected: FAIL，`Failed to resolve import "./download"`

- [ ] **Step 3：實作 `src/utils/download.ts`**

```ts
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    document.body.removeChild(link);
    // 有些瀏覽器在 click 之後才開始讀取 URL，所以延到下一個 tick 再釋放
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export function downloadText(text: string, filename: string, mimeType: string): void {
  downloadBlob(new Blob([text], { type: mimeType }), filename);
}
```

- [ ] **Step 4：確認測試通過**

Run: `npx vitest run src/utils/download.test.ts`
Expected: PASS（2 tests）

- [ ] **Step 5：EditorCanvas 改用 `downloadText`**

在 `src/components/EditorCanvas.tsx` 頂端加上：

```ts
import { downloadText } from '../utils/download';
```

`exportSVGAligned`、`exportSVGTrimmed`、`exportSVG` 三個函式裡各有一段相同的 7 行：

```ts
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = '<檔名>';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
```

分別換成（檔名保持原本的值）：

```ts
      downloadText(svgString, 'contour-crafted-outline-aligned.svg', 'image/svg+xml;charset=utf-8');
```
```ts
      downloadText(svgString, 'contour-crafted-outline-trimmed.svg', 'image/svg+xml;charset=utf-8');
```
```ts
      downloadText(svgString, 'contour-crafted-outline.svg', 'image/svg+xml;charset=utf-8');
```

- [ ] **Step 6：驗證**

Run: `npm run typecheck && npm test && npm run build`
Expected: 全部通過。

- [ ] **Step 7：Commit**

```bash
git add src/utils/download.ts src/utils/download.test.ts src/components/EditorCanvas.tsx
git commit -m "fix: revoke object URLs after downloads

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
