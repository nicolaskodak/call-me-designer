# 階段 3：尺寸清單設定與持久化

**分支：** `feat/imposition-sheet-sizes`（從最新的 `origin/main` 開出，需要階段 2 已合併）

**目標：** 使用者可在設定頁維護版面尺寸清單（存 localStorage），在拼版頁勾選這次要用哪幾種。

**最重要的一件事：不要升 schema 版號。** `settingsSchema` 的 `version` 是 `z.literal(1)`，而 `parseSettings` 一旦驗證失敗就整包退回 `DEFAULT_SETTINGS`。升版號會讓所有使用者現有的 DPI、匯出顏色、remove.bg API key 全部被清空。新欄位一律用 `.default()` 加入，舊資料沒有該欄位時 zod 會自動補上。

**啟用狀態存哪裡：** 尺寸「清單」存設定（跨工作階段保留）；「這次用哪幾種」存 `ImpositionState`，欄位是 `disabledSizeNames`（預設空陣列＝全部啟用）。用「停用名單」而不是「啟用名單」，是為了讓 `DEFAULT_IMPOSITION_STATE` 這個靜態常數不需要事先知道清單內容；日後在設定頁新增尺寸時，也會自動是啟用狀態。

---

### Task 1: 設定 schema 加入尺寸清單

**Files:**
- Modify: `src/settings/schema.ts`
- Modify: `src/settings/schema.test.ts`

**Interfaces:**
- Consumes: `SheetSize`、`DEFAULT_SHEET_SIZES`（`src/imposition/sheetSizes.ts`，階段 2）
- Produces: `Settings` 新增 `sheetSizes: SheetSize[]`

- [ ] **Step 1: 寫失敗的測試**

在 `src/settings/schema.test.ts` 加入：

```ts
import { DEFAULT_SHEET_SIZES } from '../imposition/sheetSizes';

describe('sheetSizes', () => {
  const base = {
    version: 1,
    defaultDpi: 300,
    exportColors: { cut: '#FF0000', underprint: '#FFFFFF' },
    removeBg: { apiKey: '', size: 'auto' },
  };

  it('舊資料沒有 sheetSizes 時補上預設清單，其他設定不受影響', () => {
    const parsed = parseSettings({ ...base, defaultDpi: 150 });
    expect(parsed?.sheetSizes).toEqual([...DEFAULT_SHEET_SIZES]);
    expect(parsed?.defaultDpi).toBe(150);
  });

  it('保留使用者自訂的清單', () => {
    const custom = [{ name: '自訂', widthMm: 500, heightMm: 400 }];
    expect(parseSettings({ ...base, sheetSizes: custom })?.sheetSizes).toEqual(custom);
  });

  it('尺寸不合法時整包視為損毀', () => {
    expect(parseSettings({ ...base, sheetSizes: [{ name: 'X', widthMm: 0, heightMm: 100 }] })).toBeNull();
    expect(parseSettings({ ...base, sheetSizes: [{ name: '', widthMm: 10, heightMm: 10 }] })).toBeNull();
  });

  it('預設設定包含預設清單', () => {
    expect(DEFAULT_SETTINGS.sheetSizes).toEqual([...DEFAULT_SHEET_SIZES]);
  });
});
```

檔案頂端的 import 補上 `DEFAULT_SETTINGS`（若尚未 import）。

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/settings/schema.test.ts`
Expected: FAIL，`sheetSizes` 是 undefined

- [ ] **Step 3: 改 schema**

`src/settings/schema.ts`：

```ts
import { DEFAULT_SHEET_SIZES } from '../imposition/sheetSizes';
```

在 `hexColor` 附近加入：

```ts
const SHEET_NAME_MAX_LENGTH = 20;
const SHEET_SIDE_MAX_MM = 2000;

const sheetSizeSchema = z.object({
  name: z.string().min(1).max(SHEET_NAME_MAX_LENGTH),
  widthMm: z.number().positive().max(SHEET_SIDE_MAX_MM),
  heightMm: z.number().positive().max(SHEET_SIDE_MAX_MM),
});
```

`settingsSchema` 加一個欄位（**`version` 維持 `z.literal(1)`**）：

```ts
  /** 用 .default() 而不是升版號，舊設定才不會被整包重設 */
  sheetSizes: z.array(sheetSizeSchema).default([...DEFAULT_SHEET_SIZES]),
```

`DEFAULT_SETTINGS` 補上：

```ts
  sheetSizes: [...DEFAULT_SHEET_SIZES],
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/settings/schema.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/settings/schema.ts src/settings/schema.test.ts
git commit -m "$(cat <<'EOF'
feat: persist the sheet size list in settings

Added as an optional field with a default rather than a schema version
bump, so stored settings from before this change keep their DPI, export
colours and API key instead of being reset.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 拼版頁的尺寸勾選

**Files:**
- Modify: `src/imposition/types.ts`
- Modify: `src/imposition/state.ts`
- Modify: `src/imposition/state.test.ts`
- Modify: `src/hooks/useImposition.ts`
- Modify: `src/components/panels/ImpositionPanel.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `Settings.sheetSizes`（Task 1）、`autoLayout(state, sizes, newId)`（階段 2）
- Produces:
  - `ImpositionState` 新增 `disabledSizeNames: string[]`
  - `function toggleSheetSize(state, name: string): ImpositionState`
  - `function enabledSizes(state, all: readonly SheetSize[]): SheetSize[]`
  - `useImposition(active, defaultDpi, sheetSizes: readonly SheetSize[])`（簽名新增第三個參數）
  - `ImpositionPanel` 新增 prop `sheetSizes: readonly SheetSize[]`

- [ ] **Step 1: 寫失敗的測試**

在 `src/imposition/state.test.ts` 加入：

```ts
describe('尺寸勾選', () => {
  const ALL = [
    { name: 'A4', widthMm: 297, heightMm: 210 },
    { name: 'A3', widthMm: 420, heightMm: 297 },
  ];

  it('預設全部啟用', () => {
    expect(enabledSizes(DEFAULT_IMPOSITION_STATE, ALL)).toEqual(ALL);
  });

  it('切換會停用再啟用', () => {
    const off = toggleSheetSize(DEFAULT_IMPOSITION_STATE, 'A3');
    expect(enabledSizes(off, ALL).map(s => s.name)).toEqual(['A4']);
    expect(enabledSizes(toggleSheetSize(off, 'A3'), ALL)).toEqual(ALL);
  });

  it('切換會提示需要重新排圖', () => {
    expect(toggleSheetSize(DEFAULT_IMPOSITION_STATE, 'A3').lastLayoutMessage).toBe(LAYOUT_STALE_MESSAGE);
  });

  it('停用清單裡不存在的名稱不影響結果', () => {
    const state = { ...DEFAULT_IMPOSITION_STATE, disabledSizeNames: ['已刪除的尺寸'] };
    expect(enabledSizes(state, ALL)).toEqual(ALL);
  });
});
```

`import` 補上 `enabledSizes`、`toggleSheetSize`。

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/imposition/state.test.ts`
Expected: FAIL，`enabledSizes is not exported`

- [ ] **Step 3: 實作**

`src/imposition/types.ts` 的 `ImpositionState` 加入：

```ts
  /** 這次排圖不使用的尺寸名稱；空陣列＝全部啟用 */
  disabledSizeNames: string[];
```

`DEFAULT_IMPOSITION_STATE` 加入 `disabledSizeNames: [],`。

`src/imposition/state.ts` 末尾加入：

```ts
export const toggleSheetSize = (state: ImpositionState, name: string): ImpositionState => ({
  ...state,
  disabledSizeNames: state.disabledSizeNames.includes(name)
    ? state.disabledSizeNames.filter(n => n !== name)
    : [...state.disabledSizeNames, name],
  lastLayoutMessage: LAYOUT_STALE_MESSAGE,
});

/** 設定頁刪掉的尺寸會自然從結果消失，停用名單裡的殘留名稱不影響 */
export const enabledSizes = (state: ImpositionState, all: readonly SheetSize[]): SheetSize[] =>
  all.filter(s => !state.disabledSizeNames.includes(s.name));
```

- [ ] **Step 4: hook 與 App 串接**

`src/hooks/useImposition.ts`：

```ts
export function useImposition(active: boolean, defaultDpi: number, sheetSizes: readonly SheetSize[]): ImpositionApi {
```

```ts
    autoLayout: () => update(s => autoLayout(s, enabledSizes(s, sheetSizes), newId)),
```

import 改成 `import { addLayers, autoLayout, deleteInstance, enabledSizes, setLayerTotalCount, upsertSourceLayer } from '../imposition/state';`，並移除階段 2 暫時寫死的 `DEFAULT_SHEET_SIZES` import。

`src/App.tsx`：

```ts
  const imposition = useImposition(activeTab === 'imposition', settings.defaultDpi, settings.sheetSizes);
```

並把 `sheetSizes={settings.sheetSizes}` 傳給 `ImpositionPanel`。

- [ ] **Step 5: 面板加勾選區塊**

`src/components/panels/ImpositionPanel.tsx`：props 介面加入 `sheetSizes: readonly SheetSize[];`，並在「版面」`Section` 內、最小間距之前加入：

```tsx
        <div className="space-y-1" data-testid="sheet-size-list">
          <span className="text-xs text-neutral-400">可用版面尺寸</span>
          {props.sheetSizes.length === 0 ? (
            <p className="text-[10px] text-neutral-500">設定頁還沒有任何版面尺寸。</p>
          ) : (
            props.sheetSizes.map(size => (
              <ToggleField
                key={size.name}
                label={`${size.name}（${formatMm(size.widthMm)} × ${formatMm(size.heightMm)}）`}
                checked={!state.disabledSizeNames.includes(size.name)}
                testId={`sheet-size-${size.name}`}
                onChange={() => update(s => toggleSheetSize(s, size.name))}
              />
            ))
          )}
          <p className="text-[10px] text-neutral-500">在「設定」分頁新增或刪除尺寸。</p>
        </div>
```

import 補上 `toggleSheetSize` 與 `type SheetSize`。

排圖按鈕的 `disabled` 條件加上「沒有啟用任何尺寸」：

```tsx
        <ActionButton
          onClick={props.onAutoLayout}
          disabled={state.instances.length === 0 || props.sheetSizes.every(s => state.disabledSizeNames.includes(s.name))}
          testId="imposition-auto-layout"
        >排圖</ActionButton>
```

- [ ] **Step 6: 驗證並 commit**

Run: `npm run typecheck && npm test && npm run build`

```bash
git add src/imposition/types.ts src/imposition/state.ts src/imposition/state.test.ts src/hooks/useImposition.ts src/components/panels/ImpositionPanel.tsx src/App.tsx
git commit -m "$(cat <<'EOF'
feat: choose which sheet sizes a layout may use

Stored as a disabled list so sizes added later are enabled by default
and names left over from deleted sizes are harmless.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 設定頁的尺寸清單編輯

**Files:**
- Modify: `src/components/panels/SettingsPage.tsx`

**Interfaces:**
- Consumes: `Settings.sheetSizes`（Task 1）、`useSettings()`（既有）
- Produces: 無（純 UI）

- [ ] **Step 1: 加入編輯區塊**

在 `SettingsPage.tsx` 加入元件（放在 `ColorField` 之後）：

```tsx
function SheetSizeRow({ size, index, onChange, onDelete }: {
  size: SheetSize;
  index: number;
  onChange: (next: SheetSize) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <input
        value={size.name}
        maxLength={20}
        data-testid={`sheet-size-name-${index}`}
        onChange={e => onChange({ ...size, name: e.target.value })}
        className="flex-1 min-w-0 px-2 py-1 rounded bg-neutral-700 border border-neutral-600 text-white"
      />
      <input
        type="number"
        min={1}
        max={2000}
        value={size.widthMm}
        data-testid={`sheet-size-width-${index}`}
        onChange={e => onChange({ ...size, widthMm: Number(e.target.value) || 0 })}
        className="w-20 px-2 py-1 rounded bg-neutral-700 border border-neutral-600 text-white text-right"
      />
      <span className="text-neutral-500">×</span>
      <input
        type="number"
        min={1}
        max={2000}
        value={size.heightMm}
        data-testid={`sheet-size-height-${index}`}
        onChange={e => onChange({ ...size, heightMm: Number(e.target.value) || 0 })}
        className="w-20 px-2 py-1 rounded bg-neutral-700 border border-neutral-600 text-white text-right"
      />
      <button
        type="button"
        title="刪除"
        data-testid={`sheet-size-delete-${index}`}
        onClick={onDelete}
        className="px-2 py-1 rounded bg-neutral-700 text-neutral-300"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}

function SheetSizesSection() {
  const { settings, update } = useSettings();
  const setSizes = (sizes: SheetSize[]) => update(s => ({ ...s, sheetSizes: sizes }));
  const invalid = settings.sheetSizes.filter(s => !s.name.trim() || s.widthMm <= 0 || s.heightMm <= 0);

  return (
    <Section title="版面尺寸">
      <p className="text-[10px] text-neutral-500">拼版時會從這些尺寸中自動選出最省紙的組合。單位 mm。</p>
      <div className="space-y-2" data-testid="settings-sheet-sizes">
        {settings.sheetSizes.map((size, index) => (
          <SheetSizeRow
            key={index}
            index={index}
            size={size}
            onChange={next => setSizes(settings.sheetSizes.map((s, i) => (i === index ? next : s)))}
            onDelete={() => setSizes(settings.sheetSizes.filter((_, i) => i !== index))}
          />
        ))}
      </div>
      <Warnings messages={invalid.length > 0 ? ['有尺寸的名稱或數值不完整，這些尺寸不會被儲存。'] : []} />
      <ActionButton
        onClick={() => setSizes([...settings.sheetSizes, { name: '新尺寸', widthMm: 300, heightMm: 200 }])}
        testId="settings-add-sheet-size"
      >
        <Plus className="w-3 h-3" /> 新增尺寸
      </ActionButton>
      <ActionButton onClick={() => setSizes([...DEFAULT_SHEET_SIZES])} testId="settings-reset-sheet-sizes">
        還原預設清單
      </ActionButton>
    </Section>
  );
}
```

import 補上：

```ts
import { Plus } from 'lucide-react';
import { DEFAULT_SHEET_SIZES, type SheetSize } from '../../imposition/sheetSizes';
```

在 `SettingsPage` 的 JSX 中，「匯出顏色」`Section` 之後插入 `<SheetSizesSection />`。

**注意**：編輯到一半的不合法值（例如寬度暫時為 0）會讓整包設定寫入失敗，`saved` 變 false，頁面頂端的 `Warnings` 會提示無法儲存。這是既有機制，不需另做處理，但上面的 `invalid` 提示讓原因更明確。

- [ ] **Step 2: 驗證**

Run: `npm run typecheck && npm test && npm run build`

- [ ] **Step 3: 手動確認**

Run: `npm run dev`
1. 設定頁新增一個「小卡 100×70」→ 切到拼版頁，勾選清單應該出現它
2. 重新整理瀏覽器 → 新尺寸還在，DPI 與匯出顏色沒有被重設
3. 拼版頁只勾「小卡」→ 按排圖 → 應該產生很多張小版面
4. 全部取消勾選 → 排圖按鈕變灰
5. 設定頁刪掉「小卡」→ 拼版頁的勾選清單同步消失，排圖不報錯

- [ ] **Step 4: Commit**

```bash
git add src/components/panels/SettingsPage.tsx
git commit -m "$(cat <<'EOF'
feat: edit the sheet size list in settings

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: E2E 多版面

**Files:**
- Modify: `e2e/cut-underprint-imposition.spec.ts`

階段 2 把這個測試延到現在，因為要有自訂尺寸的 UI 才造得出穩定的多版面情境：測試圖在 300 dpi 下約 33 × 18 mm，一張 A4 塞得下近百個，靠增加份數來逼出第二張版面又慢又不可靠。改成把版面縮小到 100 × 80，5 份就一定要開多張。

- [ ] **Step 1: 寫測試**

在 `e2e/cut-underprint-imposition.spec.ts` 末尾加入：

```ts
const DEFAULT_SIZE_NAMES = ['A4', 'A3', 'SRA3', 'A3+', '菊八開', '菊四開', '菊對開'];

test('版面塞不下時自動開新版面並可切換分頁', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('source-upload').setInputFiles(pngFile('two.png', twoSquaresPng()));
  await waitForCutline(page, '1');
  await page.getByTestId('tab-underprint').click();
  await page.getByTestId('send-to-imposition-under').click();
  await expect(page.getByTestId('imposition-layer-count')).toHaveText('1');

  // 加一個小尺寸：新增的那一列固定排在最後
  await page.getByTestId('tab-settings').click();
  await page.getByTestId('settings-add-sheet-size').click();
  const last = DEFAULT_SIZE_NAMES.length;
  await page.getByTestId(`sheet-size-name-${last}`).fill('測試小版');
  await page.getByTestId(`sheet-size-width-${last}`).fill('100');
  await page.getByTestId(`sheet-size-height-${last}`).fill('80');

  // 回拼版頁，只留小尺寸可用
  await page.getByTestId('tab-imposition').click();
  for (const name of DEFAULT_SIZE_NAMES) {
    await page.getByTestId(`sheet-size-${name}`).uncheck();
  }

  await page.getByTitle('設為 0 會刪除該圖層').fill('5');
  await page.getByTestId('imposition-auto-layout').click();

  await expect(page.getByTestId('imposition-sheet-count')).not.toHaveText('1');
  await expect(page.getByTestId('sheet-tabs')).toBeVisible();

  // 切到第二張版面，內容應該與第一張不同
  const firstSheetItems = await page.getByTestId('sheet-tab-1').textContent();
  await page.getByTestId('sheet-tab-2').click();
  await expect(page.getByTestId('sheet-tab-2')).toHaveAttribute('aria-current', 'page');
  expect(await page.getByTestId('sheet-tab-2').textContent()).not.toBe(firstSheetItems);
});
```

`DEFAULT_SIZE_NAMES` 必須與 `src/imposition/sheetSizes.ts` 的 `DEFAULT_SHEET_SIZES` 一致。若之後改了預設清單，這個測試會失敗——那是預期的提醒，不是壞掉。

- [ ] **Step 2: 跑 E2E**

Run: `npm run test:e2e -- cut-underprint-imposition`
Expected: 通過。若 `sheet-size-name-7` 抓不到，先確認新增的列是否真的排在最後（`setSizes([...settings.sheetSizes, ...])` 是往後加）。

- [ ] **Step 3: Commit**

```bash
git add e2e/cut-underprint-imposition.spec.ts
git commit -m "$(cat <<'EOF'
test: cover multiple sheets and tab switching

Shrinks the sheet instead of inflating the copy count, so the scenario
stays fast and does not depend on cutline offset parameters.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### 階段完成檢查

- [ ] `npm run typecheck && npm test && npm run build` 全綠
- [ ] `npm run test:coverage` 仍達 80%
- [ ] `npm run test:e2e` 全綠（含 Task 4 的多版面情境）
- [ ] 手動確認 Task 3 Step 3 的五個情境，**特別是第 2 項**（舊設定沒有被重設）
- [ ] 推分支、開 PR 到 `main`
