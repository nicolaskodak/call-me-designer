# 階段 2：多版面核心

**分支：** `feat/imposition-multi-sheet`（從最新的 `origin/main` 開出）

**目標：** 排不下時自動開新版面，每張版面自動選出最省紙的尺寸，用分頁瀏覽。

**核心約束（違反就會破壞匯出）：** 項目的 `xMm`/`yMm` 必須維持「**所屬版面內的相對座標**」，不是跨版面的全域座標。這樣 `exportSvg.ts` 的 `instanceTransform` 與 `buildImpositionSvg` 完全不用改。

**本階段刻意不做：** 尺寸清單的設定 UI（階段 3）、多檔／多頁匯出（階段 4）、跨版面拖曳（不做）。本階段的啟用尺寸先直接用 `DEFAULT_SHEET_SIZES` 寫死在 `useImposition.ts`，階段 3 再換成從設定讀取。

---

### Task 1: 尺寸定義與多版面演算法

**Files:**
- Create: `src/imposition/sheetSizes.ts`
- Create: `src/imposition/sheets.ts`
- Create: `src/imposition/sheets.test.ts`

**Interfaces:**
- Consumes: `packWithinBoundary(rects, w, h, allowRotate90)`、`PackRect { id, w, h }`、`PackPlacement { id, x, y, rotationDeg }`（皆來自 `src/imposition/packing.ts`，**不修改**）
- Produces:
  - `interface SheetSize { name: string; widthMm: number; heightMm: number }`
  - `const DEFAULT_SHEET_SIZES: readonly SheetSize[]`
  - `interface SheetPlacement { sizeName: string; widthMm: number; heightMm: number; placed: PackPlacement[] }`
  - `interface SheetPackResult { sheets: SheetPlacement[]; notPlaced: string[] }`
  - `const MAX_SHEETS = 50`
  - `function packIntoSheets(rects, sizes, allowRotate90, maxSheets?): SheetPackResult`

- [ ] **Step 1: 建立尺寸清單**

建立 `src/imposition/sheetSizes.ts`：

```ts
export interface SheetSize {
  name: string;
  widthMm: number;
  heightMm: number;
}

/** 開箱預設的常見版面尺寸（寬×高，只用表列方向，不另外試轉 90°）。使用者可在設定頁增刪。 */
export const DEFAULT_SHEET_SIZES: readonly SheetSize[] = [
  { name: 'A4', widthMm: 297, heightMm: 210 },
  { name: 'A3', widthMm: 420, heightMm: 297 },
  { name: 'SRA3', widthMm: 450, heightMm: 320 },
  { name: 'A3+', widthMm: 483, heightMm: 329 },
  { name: '菊八開', widthMm: 390, heightMm: 270 },
  { name: '菊四開', widthMm: 540, heightMm: 390 },
  { name: '菊對開', widthMm: 780, heightMm: 540 },
];
```

- [ ] **Step 2: 寫失敗的測試**

建立 `src/imposition/sheets.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import type { PackRect } from './packing';
import { MAX_SHEETS, packIntoSheets } from './sheets';
import { DEFAULT_SHEET_SIZES, type SheetSize } from './sheetSizes';

const A4: SheetSize = { name: 'A4', widthMm: 297, heightMm: 210 };
const A3: SheetSize = { name: 'A3', widthMm: 420, heightMm: 297 };

const same = (n: number, w: number, h: number): PackRect[] =>
  Array.from({ length: n }, (_, i) => ({ id: `s${i}`, w, h }));

/** 把結果攤平成每個項目的實際佔位方框，供重疊與越界檢查 */
const boxesOf = (rects: readonly PackRect[], sheet: { placed: readonly { id: string; x: number; y: number; rotationDeg: 0 | 90 }[] }) => {
  const byId = new Map(rects.map(r => [r.id, r] as const));
  return sheet.placed.map(p => {
    const r = byId.get(p.id)!;
    return { id: p.id, x: p.x, y: p.y, w: p.rotationDeg === 90 ? r.h : r.w, h: p.rotationDeg === 90 ? r.w : r.h };
  });
};

describe('packIntoSheets', () => {
  it('沒有項目時不開任何版面', () => {
    expect(packIntoSheets([], [A4], false)).toEqual({ sheets: [], notPlaced: [] });
  });

  it('單一小件會選面積最小的可用尺寸', () => {
    const result = packIntoSheets([{ id: 'a', w: 100, h: 100 }], DEFAULT_SHEET_SIZES, false);
    expect(result.sheets).toHaveLength(1);
    expect(result.sheets[0].sizeName).toBe('A4');
    expect(result.notPlaced).toEqual([]);
  });

  it('放不下的項目會開新版面', () => {
    const rects = same(20, 103, 53);
    const result = packIntoSheets(rects, [A4], true);
    expect(result.sheets.length).toBeGreaterThan(1);
    expect(result.notPlaced).toEqual([]);
    const total = result.sheets.reduce((n, s) => n + s.placed.length, 0);
    expect(total).toBe(20);
  });

  it('最後一張自動挑小的', () => {
    // 415x290 幾乎佔滿 A3，旁邊塞不下 100x100，第二張只放一個小件時 A4 的使用率贏過 A3
    const rects: PackRect[] = [
      { id: 'big', w: 415, h: 290 },
      { id: 'small', w: 100, h: 100 },
    ];
    const result = packIntoSheets(rects, [A4, A3], false);
    expect(result.sheets.map(s => s.sizeName)).toEqual(['A3', 'A4']);
  });

  it('優先保證放進當前最大件，不會把大件推到後面獨佔空版', () => {
    // 四個 148x105 剛好鋪滿 A4（使用率約 99%），300x250 只有 A3 放得下（使用率約 60%）。
    // 少了最大件保障規則，第一張會選 A4，大件被推到後面。
    const rects: PackRect[] = [{ id: 'big', w: 300, h: 250 }, ...same(4, 148, 105)];
    const result = packIntoSheets(rects, [A4, A3], false);
    expect(result.sheets[0].sizeName).toBe('A3');
    expect(result.sheets[0].placed.some(p => p.id === 'big')).toBe(true);
  });

  it('比所有尺寸都大的項目回報為放不下', () => {
    const result = packIntoSheets([{ id: 'huge', w: 900, h: 900 }, { id: 'ok', w: 50, h: 50 }], [A4, A3], false);
    expect(result.notPlaced).toEqual(['huge']);
    expect(result.sheets).toHaveLength(1);
  });

  it('沒有任何尺寸時全部放不下', () => {
    const result = packIntoSheets([{ id: 'a', w: 10, h: 10 }], [], false);
    expect(result.sheets).toEqual([]);
    expect(result.notPlaced).toEqual(['a']);
  });

  it('尊重版面數上限', () => {
    const result = packIntoSheets(same(30, 250, 190), [A4], false, 2);
    expect(result.sheets).toHaveLength(2);
    expect(result.notPlaced.length).toBe(28);
  });

  it('相同輸入得到相同結果', () => {
    const rects = same(15, 90, 70);
    expect(packIntoSheets(rects, DEFAULT_SHEET_SIZES, true)).toEqual(packIntoSheets(rects, DEFAULT_SHEET_SIZES, true));
  });

  it('不修改傳入的陣列', () => {
    const rects = [{ id: 'a', w: 10, h: 10 }, { id: 'b', w: 200, h: 100 }];
    packIntoSheets(rects, [A4], false);
    expect(rects.map(r => r.id)).toEqual(['a', 'b']);
  });

  it('性質測試：每個項目恰好出現一次，同版面內不重疊、不越界', () => {
    let seed = 20260914;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    const failures: string[] = [];
    for (let trial = 0; trial < 300; trial++) {
      const rects = Array.from({ length: 1 + Math.floor(rnd() * 20) }, (_, i) => ({
        id: `r${i}`,
        w: Math.round(20 + rnd() * 400),
        h: Math.round(20 + rnd() * 300),
      }));
      const result = packIntoSheets(rects, DEFAULT_SHEET_SIZES, trial % 2 === 0);

      const seen = [...result.sheets.flatMap(s => s.placed.map(p => p.id)), ...result.notPlaced].sort();
      if (seen.join(',') !== rects.map(r => r.id).sort().join(',')) {
        failures.push(`trial ${trial}: 項目沒有恰好出現一次`);
      }

      result.sheets.forEach((sheet, index) => {
        if (!DEFAULT_SHEET_SIZES.some(s => s.name === sheet.sizeName)) {
          failures.push(`trial ${trial} sheet ${index}: 尺寸不在清單內`);
        }
        const boxes = boxesOf(rects, sheet);
        boxes.forEach((a, i) => {
          if (a.x < 0 || a.y < 0 || a.x + a.w > sheet.widthMm || a.y + a.h > sheet.heightMm) {
            failures.push(`trial ${trial} sheet ${index}: ${a.id} 越界`);
          }
          boxes.slice(i + 1).forEach(b => {
            if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
              failures.push(`trial ${trial} sheet ${index}: ${a.id} 與 ${b.id} 重疊`);
            }
          });
        });
      });
    }
    expect(failures).toEqual([]);
  });

  it('MAX_SHEETS 是有限的保護值', () => {
    expect(MAX_SHEETS).toBeGreaterThan(0);
    expect(Number.isFinite(MAX_SHEETS)).toBe(true);
  });
});
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `npx vitest run src/imposition/sheets.test.ts`
Expected: FAIL，`Failed to resolve import "./sheets"`

- [ ] **Step 4: 寫實作**

建立 `src/imposition/sheets.ts`：

```ts
import { packWithinBoundary, type PackPlacement, type PackRect } from './packing';
import type { SheetSize } from './sheetSizes';

export interface SheetPlacement {
  sizeName: string;
  widthMm: number;
  heightMm: number;
  placed: PackPlacement[];
}

export interface SheetPackResult {
  sheets: SheetPlacement[];
  notPlaced: string[];
}

/** 版面數上限，避免任何情況下的無窮迴圈 */
export const MAX_SHEETS = 50;

const areaOf = (r: { w: number; h: number }) => r.w * r.h;

const byAreaDesc = (a: PackRect, b: PackRect) =>
  areaOf(b) - areaOf(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

interface Candidate {
  size: SheetSize;
  placed: PackPlacement[];
  hasLargest: boolean;
  utilization: number;
}

const candidateFor = (
  size: SheetSize,
  remaining: readonly PackRect[],
  areaById: ReadonlyMap<string, number>,
  allowRotate90: boolean,
  largestId: string,
): Candidate | null => {
  const { placed } = packWithinBoundary(remaining, size.widthMm, size.heightMm, allowRotate90);
  if (placed.length === 0) return null;
  const used = placed.reduce((sum, p) => sum + (areaById.get(p.id) ?? 0), 0);
  return {
    size,
    placed,
    hasLargest: placed.some(p => p.id === largestId),
    utilization: used / (size.widthMm * size.heightMm),
  };
};

/**
 * 逐版面貪婪選尺寸。每開一張版面就對每個尺寸各打包一次，選使用率最高者。
 *
 * 總項目面積固定，因此「總用紙面積最小」等價於「平均使用率最大」，使用率就是這個
 * 目標函數下的直接指標。但只看使用率會出現壞解：塞滿小件的小版面使用率很高，卻把
 * 大件推到後面獨佔一張幾乎空白的大版。所以候選中若有放得下「當前最大件」的，就只
 * 在那些之中比使用率。
 */
export function packIntoSheets(
  rects: readonly PackRect[],
  sizes: readonly SheetSize[],
  allowRotate90: boolean,
  maxSheets: number = MAX_SHEETS,
): SheetPackResult {
  const areaById = new Map(rects.map(r => [r.id, areaOf(r)] as const));
  const sheets: SheetPlacement[] = [];
  let remaining = [...rects].sort(byAreaDesc);

  while (remaining.length > 0 && sheets.length < maxSheets) {
    const largestId = remaining[0].id;
    const candidates = sizes.flatMap(size => {
      const candidate = candidateFor(size, remaining, areaById, allowRotate90, largestId);
      return candidate ? [candidate] : [];
    });
    if (candidates.length === 0) break;

    const withLargest = candidates.filter(c => c.hasLargest);
    const pool = withLargest.length > 0 ? withLargest : candidates;
    // 使用率相同時保留先出現者，結果才有決定性
    const best = pool.reduce((a, b) => (b.utilization > a.utilization ? b : a));

    sheets.push({
      sizeName: best.size.name,
      widthMm: best.size.widthMm,
      heightMm: best.size.heightMm,
      placed: best.placed,
    });
    const usedIds = new Set(best.placed.map(p => p.id));
    remaining = remaining.filter(r => !usedIds.has(r.id));
  }

  return { sheets, notPlaced: remaining.map(r => r.id) };
}
```

- [ ] **Step 5: 跑測試確認通過**

Run: `npx vitest run src/imposition/sheets.test.ts`
Expected: PASS，12 個測試全過

若「最後一張自動挑小的」或「最大件保障」失敗，先用 `console.log` 印出各候選的 `sizeName` 與 `utilization` 再判斷——**不要**直接改測試的期望值來讓它過。

- [ ] **Step 6: Commit**

```bash
git add src/imposition/sheetSizes.ts src/imposition/sheets.ts src/imposition/sheets.test.ts
git commit -m "$(cat <<'EOF'
feat: add multi-sheet packing with automatic size choice

Greedy per sheet: pack the remaining items into every enabled size, then
keep the sheet with the highest utilisation. Since total item area is
fixed, maximising utilisation minimises total paper area, and picking a
smaller last sheet falls out of that on its own.

Candidates that fit the largest remaining item win outright, otherwise a
small sheet packed with small items would score well while pushing a big
item onto a nearly empty sheet of its own.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 資料模型改成多版面

**Files:**
- Modify: `src/imposition/types.ts`
- Modify: `src/imposition/state.ts`
- Modify: `src/imposition/state.test.ts`

**Interfaces:**
- Consumes: `packIntoSheets`、`SheetSize`、`DEFAULT_SHEET_SIZES`（Task 1）
- Produces:
  - `interface ImpositionSheet { id: string; sizeName: string; widthMm: number; heightMm: number }`
  - `ImpositionInstance` 新增 `sheetId: string | null`
  - `ImpositionState` 新增 `sheets: ImpositionSheet[]`、`activeSheetId: string`；**移除** `boundaryWidthMm`、`boundaryHeightMm`
  - `function autoLayout(state, sizes: readonly SheetSize[], newId: IdFactory): ImpositionState`（簽名改變）
  - `function selectSheet(state, sheetId: string): ImpositionState`
  - `function sheetUsage(state, sheetId: string): number`（0–1）

- [ ] **Step 1: 改型別**

`src/imposition/types.ts`：`ImpositionInstance` 加入 `sheetId`，新增 `ImpositionSheet`，`ImpositionState` 換掉 boundary 欄位。

```ts
export interface ImpositionSheet {
  id: string;
  /** 來自哪個尺寸定義，供分頁標籤顯示 */
  sizeName: string;
  widthMm: number;
  heightMm: number;
}

export interface ImpositionInstance {
  id: string;
  layerId: string;
  /** null＝沒有任何啟用尺寸放得下 */
  sheetId: string | null;
  /** 所屬版面內的相對座標 */
  xMm: number;
  yMm: number;
  rotationDeg: 0 | 90;
}
```

`ImpositionState` 把 `boundaryWidthMm: number;` 與 `boundaryHeightMm: number;` 兩行刪掉，改成：

```ts
  sheets: ImpositionSheet[];
  activeSheetId: string;
```

`DEFAULT_IMPOSITION_STATE` 對應調整（刪掉兩個 boundary 欄位）：

```ts
const DEFAULT_SHEET: ImpositionSheet = { id: 'sheet-1', sizeName: 'A4', widthMm: 297, heightMm: 210 };

export const DEFAULT_IMPOSITION_STATE: ImpositionState = {
  minGapMm: 3,
  allowRotate90: false,
  zoom: 1,
  show: { artwork: true, underprint: true, cut: true },
  layers: [],
  instances: [],
  sheets: [DEFAULT_SHEET],
  activeSheetId: DEFAULT_SHEET.id,
  selectedInstanceId: null,
  notPlacedInstanceIds: [],
  lastLayoutMessage: null,
};
```

保留一張預設版面，是為了讓「還沒排圖就上傳」的項目有地方落腳，畫布不會一片空白。

- [ ] **Step 2: 寫失敗的測試**

在 `src/imposition/state.test.ts` 的 `layer` helper 之後加入 import（檔案頂端的 import 區補上 `selectSheet`、`sheetUsage`）：

```ts
import { DEFAULT_SHEET_SIZES } from './sheetSizes';
```

把既有的 `describe('autoLayout', ...)` 整段換成：

```ts
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
```

檔案頂端的 import 補上 `selectSheet` 與 `sheetUsage`：

```ts
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
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `npx vitest run src/imposition/state.test.ts`
Expected: FAIL，`selectSheet is not exported` 之類的錯誤

- [ ] **Step 4: 改 state.ts**

`src/imposition/state.ts` 頂端補 import：

```ts
import { packIntoSheets } from './sheets';
import type { SheetSize } from './sheetSizes';
```

`instancesFor` 加上 `sheetId` 參數：

```ts
const instancesFor = (layerId: string, count: number, newId: IdFactory, sheetId: string): ImpositionInstance[] =>
  Array.from({ length: count }, () => ({ id: newId(), layerId, sheetId, xMm: 0, yMm: 0, rotationDeg: 0 as const }));
```

三個呼叫端都補上 `state.activeSheetId`：`addLayers` 內、`setLayerTotalCount` 內。

新增空版面回收（放在 `removeInstances` 之後）：

```ts
/** 沒有任何項目的版面就移除；至少保留一張，畫布才不會空白 */
const pruneEmptySheets = (state: ImpositionState): ImpositionState => {
  const used = new Set(state.instances.map(i => i.sheetId));
  const kept = state.sheets.filter(s => used.has(s.id));
  const sheets = kept.length > 0 ? kept : state.sheets.slice(0, 1);
  const activeSheetId = sheets.some(s => s.id === state.activeSheetId) ? state.activeSheetId : sheets[0].id;
  return { ...state, sheets, activeSheetId };
};
```

`removeInstances` 的回傳包一層 `pruneEmptySheets`：

```ts
const removeInstances = (state: ImpositionState, ids: ReadonlySet<string>): ImpositionState =>
  pruneEmptySheets({
    ...state,
    instances: state.instances.filter(i => !ids.has(i.id)),
    notPlacedInstanceIds: state.notPlacedInstanceIds.filter(id => !ids.has(id)),
    selectedInstanceId: state.selectedInstanceId && ids.has(state.selectedInstanceId) ? null : state.selectedInstanceId,
  });
```

`autoLayout` 整個換掉：

```ts
export function autoLayout(state: ImpositionState, sizes: readonly SheetSize[], newId: IdFactory): ImpositionState {
  if (sizes.length === 0) return { ...state, lastLayoutMessage: '請先勾選至少一種版面尺寸。' };

  const base = state.allowRotate90 ? state.instances : state.instances.map(i => ({ ...i, rotationDeg: 0 as const }));
  const layerMap = new Map(state.layers.map(l => [l.id, l] as const));
  const rects = base.flatMap(inst => {
    const layer = layerMap.get(inst.layerId);
    if (!layer) return [];
    const { w, h } = layerBoxMm(layer, 0);
    return [{ id: inst.id, w: w + state.minGapMm, h: h + state.minGapMm }];
  });

  const result = packIntoSheets(rects, sizes, state.allowRotate90);
  const sheets = result.sheets.map(s => ({ id: newId(), sizeName: s.sizeName, widthMm: s.widthMm, heightMm: s.heightMm }));
  const placements = new Map(
    result.sheets.flatMap((s, index) => s.placed.map(p => [p.id, { sheetId: sheets[index].id, placement: p }] as const)),
  );
  const instances = base.map(inst => {
    const hit = placements.get(inst.id);
    return hit
      ? { ...inst, sheetId: hit.sheetId, xMm: hit.placement.x, yMm: hit.placement.y, rotationDeg: hit.placement.rotationDeg }
      : { ...inst, sheetId: null };
  });

  const placedCount = instances.length - result.notPlaced.length;
  const notPlacedNote = result.notPlaced.length > 0 ? `，放不下 ${result.notPlaced.length} 個` : '';
  const rotateNote = state.allowRotate90 ? '（允許 90° 旋轉）' : '';
  return {
    ...state,
    sheets: sheets.length > 0 ? sheets : state.sheets,
    activeSheetId: sheets[0]?.id ?? state.activeSheetId,
    instances,
    notPlacedInstanceIds: result.notPlaced,
    lastLayoutMessage: `排圖完成：${sheets.length} 個版面，排入 ${placedCount} 個${notPlacedNote}。${rotateNote}`,
  };
}
```

檔案末尾加入兩個新的公開函式：

```ts
export const selectSheet = (state: ImpositionState, sheetId: string): ImpositionState =>
  state.sheets.some(s => s.id === sheetId) ? { ...state, activeSheetId: sheetId, selectedInstanceId: null } : state;

/** 該版面已放置項目（含間距）佔版面面積的比例，0–1 */
export function sheetUsage(state: ImpositionState, sheetId: string): number {
  const sheet = state.sheets.find(s => s.id === sheetId);
  if (!sheet) return 0;
  const layerMap = new Map(state.layers.map(l => [l.id, l] as const));
  const used = state.instances
    .filter(i => i.sheetId === sheetId)
    .reduce((sum, i) => {
      const layer = layerMap.get(i.layerId);
      if (!layer) return sum;
      const { w, h } = layerBoxMm(layer, 0);
      return sum + (w + state.minGapMm) * (h + state.minGapMm);
    }, 0);
  return used / (sheet.widthMm * sheet.heightMm);
}
```

- [ ] **Step 5: 跑測試**

Run: `npx vitest run src/imposition/state.test.ts`
Expected: PASS。其他檔案此時仍會編譯失敗（下一個 task 修），所以先只跑這個檔案。

- [ ] **Step 6: Commit**

```bash
git add src/imposition/types.ts src/imposition/state.ts src/imposition/state.test.ts
git commit -m "$(cat <<'EOF'
feat: model imposition as multiple sheets

Instances now carry a sheetId and sheet-relative coordinates, so the SVG
transform code keeps working untouched. autoLayout takes the enabled
sizes and rebuilds the sheet list; emptied sheets are reclaimed, always
leaving one so the canvas is never blank.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 分頁列與畫布只渲染當前版面

**Files:**
- Create: `src/components/SheetTabs.tsx`
- Modify: `src/components/ImpositionCanvas.tsx`
- Modify: `src/hooks/useImposition.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `ImpositionSheet`、`selectSheet`、`sheetUsage`（Task 2）
- Produces: `function SheetTabs(props: { sheets; activeSheetId; usageById; onSelect }): JSX.Element | null`

- [ ] **Step 1: 建立分頁元件**

建立 `src/components/SheetTabs.tsx`：

```tsx
import type { ImpositionSheet } from '../imposition/types';

interface SheetTabsProps {
  sheets: readonly ImpositionSheet[];
  activeSheetId: string;
  /** 版面 id → 使用率（0–1） */
  usageById: ReadonlyMap<string, number>;
  onSelect: (sheetId: string) => void;
}

/** 只有一張版面時不佔畫面 */
export function SheetTabs({ sheets, activeSheetId, usageById, onSelect }: SheetTabsProps) {
  if (sheets.length <= 1) return null;
  return (
    <div className="flex gap-1 overflow-x-auto p-2 bg-neutral-900/80 border-b border-neutral-800" data-testid="sheet-tabs">
      {sheets.map((sheet, index) => {
        const active = sheet.id === activeSheetId;
        const usage = Math.round((usageById.get(sheet.id) ?? 0) * 100);
        return (
          <button
            key={sheet.id}
            type="button"
            onClick={() => onSelect(sheet.id)}
            aria-current={active ? 'page' : undefined}
            data-testid={`sheet-tab-${index + 1}`}
            className={`shrink-0 px-3 py-1 rounded text-xs transition ${active ? 'bg-blue-600 text-white' : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'}`}
          >
            版面 {index + 1}（{sheet.sizeName}）{usage}%
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: 畫布改成只渲染當前版面**

`src/components/ImpositionCanvas.tsx`：

import 補上 `selectSheet`、`sheetUsage` 與 `SheetTabs`：

```ts
import { layerBoxMm, moveInstance, selectInstance, selectSheet, sheetUsage } from '../imposition/state';
import { SheetTabs } from './SheetTabs';
```

在 `const k = ...` 之後加入當前版面與可見項目：

```ts
  const sheet = state.sheets.find(s => s.id === state.activeSheetId) ?? state.sheets[0];
  const visible = useMemo(
    () => state.instances.filter(i => i.sheetId === state.activeSheetId),
    [state.instances, state.activeSheetId],
  );
  const usageById = useMemo(
    () => new Map(state.sheets.map(s => [s.id, sheetUsage(state, s.id)] as const)),
    [state],
  );
```

`useImperativeHandle` 的兩處 `state.boundaryWidthMm` / `state.boundaryHeightMm` 改成 `sheet.widthMm` / `sheet.heightMm`，deps 改成 `[sheet]`。

`notPlaced` 那個 `useMemo` 與傳給 `ImpositionItem` 的 `notPlaced` prop 全部刪除——放不下的項目 `sheetId` 是 null，不會出現在 `visible` 裡。同時刪掉 `ImpositionItem` 內的黃色遮罩與 `data-not-placed` 屬性，以及 `renderPdf` 裡 `ignoreElements` 那一行。

回傳的 JSX 換成：

```tsx
  return (
    <div className="absolute inset-0 flex flex-col">
      <SheetTabs
        sheets={state.sheets}
        activeSheetId={state.activeSheetId}
        usageById={usageById}
        onSelect={id => update(s => selectSheet(s, id))}
      />
      <div
        ref={viewportRef}
        {...dropProps}
        data-drag-over={isOver ? 'true' : undefined}
        className={`relative flex-1 overflow-auto ${pan ? 'cursor-grabbing' : 'cursor-grab'} ${isOver ? 'ring-2 ring-inset ring-blue-500' : ''}`}
      >
        <div className="min-w-full min-h-full flex items-center justify-center p-6">
          <div
            ref={boundaryRef}
            className="relative shrink-0 border-2 border-dashed border-neutral-700 rounded-lg overflow-hidden bg-neutral-900/20"
            style={{ width: sheet.widthMm * k, height: sheet.heightMm * k }}
            onMouseDown={onBoundaryMouseDown}
          >
            {state.instances.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-500 pointer-events-none">
                <p className="text-lg font-medium">尚無排版項目</p>
                <p className="text-sm opacity-60">從 Editor／Underprint 送過來，或拖曳「圖＋SVG」配對進來。</p>
              </div>
            ) : null}
            {visible.map(instance => {
              const layer = layerById.get(instance.layerId);
              return layer ? (
                <ImpositionItem
                  key={instance.id}
                  layer={layer}
                  instance={instance}
                  k={k}
                  selected={state.selectedInstanceId === instance.id}
                  show={state.show}
                  colors={colors}
                  onMouseDown={onItemMouseDown}
                />
              ) : null;
            })}
          </div>
        </div>
      </div>
    </div>
  );
```

`ImpositionItem` 的 props 型別要拿掉 `notPlaced: boolean`。

- [ ] **Step 3: hook 傳入啟用尺寸**

`src/hooks/useImposition.ts`：

```ts
import { DEFAULT_SHEET_SIZES } from '../imposition/sheetSizes';
```

```ts
    autoLayout: () => update(s => autoLayout(s, DEFAULT_SHEET_SIZES, newId)),
```

階段 3 會把 `DEFAULT_SHEET_SIZES` 換成從設定讀取的啟用清單。

- [ ] **Step 4: 驗證**

Run: `npm run typecheck`
Expected: 只剩 `exportFile.ts` 與 `ImpositionPanel.tsx` 的錯誤（下一個 task 處理）

- [ ] **Step 5: Commit**

```bash
git add src/components/SheetTabs.tsx src/components/ImpositionCanvas.tsx src/hooks/useImposition.ts
git commit -m "$(cat <<'EOF'
feat: browse imposition sheets with tabs

The canvas renders only the active sheet, so nothing bleeds between
sheets. Items that no enabled size can hold have no sheet and simply do
not render, which retires the not-placed overlay.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 面板與匯出的最小修補

**Files:**
- Modify: `src/components/panels/ImpositionPanel.tsx`
- Modify: `src/imposition/exportSvg.ts`
- Modify: `src/imposition/exportFile.ts`
- Modify: `src/imposition/exportSvg.test.ts`

**Interfaces:**
- Consumes: `sheetUsage`、`ImpositionSheet`（Task 2）
- Produces: `placedItems(state, sheetId?: string)`（第二個參數可選，給定時只回傳該版面的項目）

移除 boundary 欄位之後這兩個檔案會編譯失敗，本 task 讓它們回到可編譯且行為正確的最小狀態。完整的多檔匯出在階段 4。

- [ ] **Step 1: `placedItems` 加上版面篩選**

`src/imposition/exportSvg.ts`：

```ts
export function placedItems(state: ImpositionState, sheetId?: string): PlacedItem[] {
  const layers = new Map(state.layers.map(l => [l.id, l] as const));
  return state.instances.flatMap(instance => {
    const layer = layers.get(instance.layerId);
    if (!layer || instance.sheetId === null) return [];
    if (sheetId !== undefined && instance.sheetId !== sheetId) return [];
    return [{ layer, instance }];
  });
}
```

`notPlacedInstanceIds` 不再需要參與篩選——`sheetId === null` 就是放不下的定義。

- [ ] **Step 2: 匯出改用當前版面**

`src/imposition/exportFile.ts` 的 `downloadImpositionSvg` 內：

```ts
  const sheet = state.sheets.find(s => s.id === state.activeSheetId) ?? state.sheets[0];
  const items = placedItems(state, sheet?.id);
  if (!sheet || items.length === 0) return;
```

並把 `buildImpositionSvg` 的參數改成 `widthMm: sheet.widthMm, heightMm: sheet.heightMm`。

- [ ] **Step 3: 更新 exportSvg 測試**

`src/imposition/exportSvg.test.ts` 第 22–24 行的 `inst` helper 補上 `sheetId`（預設值對齊 `DEFAULT_IMPOSITION_STATE` 的預設版面 id）：

```ts
const inst = (overrides: Partial<ImpositionInstance> = {}): ImpositionInstance => ({
  id: 'i1', layerId: 'L1', sheetId: 'sheet-1', xMm: 100, yMm: 50, rotationDeg: 0, ...overrides,
});
```

第 42–52 行的 `describe('placedItems', ...)` 整段換成：

```ts
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
```

`notPlacedInstanceIds` 不再參與這組測試——`sheetId === null` 就是「放不下」的唯一定義。

- [ ] **Step 4: 面板改版**

`src/components/panels/ImpositionPanel.tsx`：

刪掉「版面」區塊裡的兩個 `MmInput`（寬、高），保留最小間距、旋轉、縮放、符合視窗。在「排圖」區塊的 `InfoRow` 之後加上版面資訊與放不下的警告：

```tsx
        <InfoRow label="版面" value={state.sheets.length} testId="imposition-sheet-count" />
```

並在 `Section title="排圖"` 內、`lastLayoutMessage` 之前加入：

```tsx
        <Warnings messages={notPlacedWarnings} />
```

元件內計算：

```tsx
  const notPlacedCount = state.instances.filter(i => i.sheetId === null).length;
  const notPlacedWarnings = notPlacedCount > 0
    ? [`有 ${notPlacedCount} 個項目比所有可用的版面尺寸都大，沒有排入任何版面。`]
    : [];
```

`Warnings` 從 `./fields` import（該檔已匯出）。`MmInput` 若不再被使用就一併刪除，避免留下未使用的元件。

- [ ] **Step 5: 全部驗證**

Run: `npm run typecheck && npm test && npm run build`
Expected: 全部通過

- [ ] **Step 6: 手動確認**

Run: `npm run dev`
1. 上傳一組圖 → 圖層清單出現，畫布顯示一張 A4
2. 把總數改成 30 → 按「排圖」→ 應該出現多個版面分頁，標籤顯示尺寸與使用率
3. 點分頁切換 → 各版面內容不同、互不干擾
4. 勾「允許 90° 旋轉」→ 面板提示要重新排圖 → 再按排圖 → 版面數應該持平或變少

- [ ] **Step 7: Commit**

```bash
git add src/components/panels/ImpositionPanel.tsx src/imposition/exportSvg.ts src/imposition/exportFile.ts src/imposition/exportSvg.test.ts
git commit -m "$(cat <<'EOF'
fix: point the panel and SVG export at sheets

Export writes the active sheet for now; per-sheet files come with the
export phase. The manual width/height inputs are gone since sizes are
chosen automatically.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: E2E 跟上

**Files:**
- Modify: `e2e/cut-underprint-imposition.spec.ts:29`

- [ ] **Step 1: 確認既有斷言仍成立**

第 29 行斷言匯出的 SVG 是 `width="297mm" height="210mm"`。自動選尺寸之後這個斷言**應該仍然成立**：測試圖只有一個小項目，而候選清單中 A4（62370 mm²）面積最小，使用率最高，必然雀屏中選。

Run: `npm run test:e2e -- cut-underprint-imposition`
Expected: 通過，不需要改這一行。

若失敗，代表選到了別的尺寸——先回頭確認 `packIntoSheets` 的使用率計算是否有誤，**不要**直接把斷言放寬來讓它過。確認演算法無誤後，才改成 `expect(layered).toMatch(/width="[\d.]+mm" height="[\d.]+mm"/);`。

- [ ] **Step 2: 補一個版面數的斷言**

在第 22 行 `await page.getByTestId('imposition-auto-layout').click();` 之後加入：

```ts
  await expect(page.getByTestId('imposition-sheet-count')).toHaveText('1');
```

多版面的 E2E 留到階段 3。原因是這張測試圖在 300 dpi 下大約只有 33 × 18 mm（含間距），一張 A4 塞得下近百個，要在這裡造出第二張版面得放兩三百個項目，既慢又取決於刀模外擴參數。階段 3 有自訂尺寸的 UI，加一個 100 × 80 的小尺寸就能用 5 份穩定造出多版面。

- [ ] **Step 3: Commit**

```bash
git add e2e/cut-underprint-imposition.spec.ts
git commit -m "$(cat <<'EOF'
test: cover automatic sheet creation

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### 階段完成檢查

- [ ] `npm run typecheck && npm test && npm run build` 全綠
- [ ] `npm run test:e2e` 全綠
- [ ] coverage 仍達 80%（`npm run test:coverage`）
- [ ] 手動確認 Task 4 Step 6 的四個情境
- [ ] 推分支、開 PR 到 `main`
