# 階段 1：拖曳上傳

**分支：** `feat/imposition-drag-drop`（從最新的 `origin/main` 開出）

**目標：** 把「圖＋SVG」配對直接拖進拼版頁的上傳框或畫布即可上傳。

**為什麼風險低：** 下游完全不動。drop 事件只是把 `File[]` 交給既有的 `uploadPairs`，配對、載入、加入圖層的邏輯一行都不改。

**既有機制（不要重寫）：**
- `ImpositionPanel.tsx` 的 `UploadBox` 已經長得像 dropzone（虛線框），只差事件。
- `App.tsx:183` 的 `uploadImposition(files: File[])` 已經處理好略過清單與錯誤提示。
- 畫布的項目拖曳是滑鼠事件（`mousedown`/`mousemove`），與 HTML5 檔案拖放是不同事件族，**不會衝突**。

**兩個必須注意的瀏覽器行為：**
1. `onDragOver` 一定要 `preventDefault()`，否則 `drop` 根本不會觸發。
2. `dragenter`/`dragleave` 在子元素之間會冒泡跳動，滑過內部元素就會誤判「離開」。必須用計數器：enter 加一、leave 減一，歸零才算真的離開。

---

### Task 1: 檔案拖放 hook

**Files:**
- Create: `src/hooks/useFileDrop.ts`
- Create: `src/hooks/useFileDrop.test.tsx`
- Modify: `vitest.config.ts`（coverage include 加入新檔）

**Interfaces:**
- Consumes: 無
- Produces:
  - `useFileDrop(onFiles: (files: File[]) => void): { isOver: boolean; dropProps: FileDropProps }`
  - `useBlockWindowFileDrop(): void`
  - `interface FileDropProps { onDragEnter; onDragOver; onDragLeave; onDrop }`（皆為 `(e: React.DragEvent) => void`）

- [ ] **Step 1: 寫失敗的測試**

建立 `src/hooks/useFileDrop.test.tsx`：

```tsx
// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFileDrop } from './useFileDrop';

afterEach(cleanup);

const file = (name: string, type: string) => new File(['x'], name, { type });

/** 造一個夠用的假 DragEvent；只需要 preventDefault 與 dataTransfer.files */
const dragEvent = (files: File[] = []) => ({
  preventDefault: vi.fn(),
  stopPropagation: vi.fn(),
  dataTransfer: { files, types: ['Files'] },
}) as unknown as React.DragEvent;

describe('useFileDrop', () => {
  it('拖進來時 isOver 變 true，離開後變回 false', () => {
    const { result } = renderHook(() => useFileDrop(() => undefined));
    expect(result.current.isOver).toBe(false);

    act(() => result.current.dropProps.onDragEnter(dragEvent()));
    expect(result.current.isOver).toBe(true);

    act(() => result.current.dropProps.onDragLeave(dragEvent()));
    expect(result.current.isOver).toBe(false);
  });

  it('滑過子元素造成的巢狀 enter/leave 不會提早關閉', () => {
    const { result } = renderHook(() => useFileDrop(() => undefined));
    act(() => result.current.dropProps.onDragEnter(dragEvent()));
    act(() => result.current.dropProps.onDragEnter(dragEvent()));
    act(() => result.current.dropProps.onDragLeave(dragEvent()));
    expect(result.current.isOver).toBe(true);

    act(() => result.current.dropProps.onDragLeave(dragEvent()));
    expect(result.current.isOver).toBe(false);
  });

  it('drop 會把檔案交出去，並把 isOver 收乾淨', () => {
    const onFiles = vi.fn();
    const { result } = renderHook(() => useFileDrop(onFiles));
    const files = [file('cat.png', 'image/png'), file('cat.svg', 'image/svg+xml')];

    act(() => result.current.dropProps.onDragEnter(dragEvent(files)));
    act(() => result.current.dropProps.onDrop(dragEvent(files)));

    expect(onFiles).toHaveBeenCalledWith(files);
    expect(result.current.isOver).toBe(false);
  });

  it('沒有檔案的 drop 不會呼叫 onFiles', () => {
    const onFiles = vi.fn();
    const { result } = renderHook(() => useFileDrop(onFiles));
    act(() => result.current.dropProps.onDrop(dragEvent([])));
    expect(onFiles).not.toHaveBeenCalled();
  });

  it('onDragOver 一定要 preventDefault，否則瀏覽器不會觸發 drop', () => {
    const { result } = renderHook(() => useFileDrop(() => undefined));
    const e = dragEvent();
    act(() => result.current.dropProps.onDragOver(e));
    expect(e.preventDefault).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/hooks/useFileDrop.test.tsx`
Expected: FAIL，訊息類似 `Failed to resolve import "./useFileDrop"`

- [ ] **Step 3: 寫最小實作**

建立 `src/hooks/useFileDrop.ts`：

```ts
import { useCallback, useEffect, useRef, useState } from 'react';

export interface FileDropProps {
  onDragEnter: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

export interface FileDropResult {
  /** 目前有檔案懸停在上面，用來顯示高亮 */
  isOver: boolean;
  dropProps: FileDropProps;
}

/**
 * 檔案拖放。dragenter／dragleave 會在子元素之間冒泡，
 * 所以用計數器判斷是否真的離開整個投放區。
 */
export function useFileDrop(onFiles: (files: File[]) => void): FileDropResult {
  const depth = useRef(0);
  const [isOver, setIsOver] = useState(false);

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    depth.current += 1;
    setIsOver(true);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    // 不 preventDefault 的話瀏覽器不會觸發 drop
    e.preventDefault();
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setIsOver(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    depth.current = 0;
    setIsOver(false);
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length > 0) onFiles(files);
  }, [onFiles]);

  return { isOver, dropProps: { onDragEnter, onDragOver, onDragLeave, onDrop } };
}

/** 擋掉「拖到非投放區時瀏覽器直接開檔」的預設行為 */
export function useBlockWindowFileDrop(): void {
  useEffect(() => {
    const block = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragover', block);
    window.addEventListener('drop', block);
    return () => {
      window.removeEventListener('dragover', block);
      window.removeEventListener('drop', block);
    };
  }, []);
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/hooks/useFileDrop.test.tsx`
Expected: PASS，5 個測試全過

- [ ] **Step 5: 把新檔加進 coverage 白名單**

在 `vitest.config.ts` 的 `coverage.include` 陣列裡，`'src/hooks/useSourceImage.ts',` 這行後面加上：

```ts
        'src/hooks/useFileDrop.ts',
```

- [ ] **Step 6: 驗證並 commit**

Run: `npm run typecheck && npm test && npm run build`
Expected: 全部通過，coverage 門檻不被破壞

```bash
git add src/hooks/useFileDrop.ts src/hooks/useFileDrop.test.tsx vitest.config.ts
git commit -m "$(cat <<'EOF'
feat: add a file drop hook for uploads

Counts dragenter/dragleave depth so hovering a child element does not
close the drop zone, and preventDefault on dragover so the browser
actually fires drop.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 上傳框與畫布接上拖放

**Files:**
- Modify: `src/components/panels/ImpositionPanel.tsx:51-70`（`UploadBox`）
- Modify: `src/components/ImpositionCanvas.tsx:19-23, 195-196`（props 與 viewport）
- Modify: `src/App.tsx:322-324`（傳入 `onDropFiles`）與元件頂端（呼叫 `useBlockWindowFileDrop`）

**Interfaces:**
- Consumes: `useFileDrop`、`useBlockWindowFileDrop`（Task 1）
- Produces: `ImpositionCanvasProps` 新增 `onDropFiles: (files: File[]) => void`

- [ ] **Step 1: 上傳框接上拖放**

在 `ImpositionPanel.tsx` 頂端加入 import：

```ts
import { useFileDrop } from '../../hooks/useFileDrop';
```

把 `UploadBox` 整個換成：

```tsx
function UploadBox({ onUpload }: { onUpload: (files: File[]) => void }) {
  const { isOver, dropProps } = useFileDrop(onUpload);
  const tone = isOver ? 'border-blue-500 bg-blue-500/10' : 'border-neutral-600 hover:border-blue-500 hover:bg-neutral-700/50';
  return (
    <label
      {...dropProps}
      data-testid="imposition-dropzone"
      data-drag-over={isOver ? 'true' : undefined}
      className={`flex flex-col items-center justify-center w-full h-20 border-2 border-dashed rounded-lg transition cursor-pointer ${tone}`}
    >
      <Upload className="w-6 h-6 mb-1 text-neutral-500" />
      <span className="text-xs text-neutral-400">{isOver ? '放開以上傳' : '上傳或拖曳「圖＋SVG」配對（可多選）'}</span>
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
```

- [ ] **Step 2: 畫布接上拖放**

在 `ImpositionCanvas.tsx` 頂端加入 import：

```ts
import { useFileDrop } from '../hooks/useFileDrop';
```

`ImpositionCanvasProps` 加一個欄位：

```ts
interface ImpositionCanvasProps {
  state: ImpositionState;
  update: (fn: (s: ImpositionState) => ImpositionState) => void;
  colors: Colors;
  onDropFiles: (files: File[]) => void;
}
```

元件簽名改成 `({ state, update, colors, onDropFiles }, ref)`，並在 `const k = ...` 上方加：

```ts
  const { isOver, dropProps } = useFileDrop(onDropFiles);
```

把最外層 viewport div（第 196 行）換成：

```tsx
    <div
      ref={viewportRef}
      {...dropProps}
      data-drag-over={isOver ? 'true' : undefined}
      className={`absolute inset-0 overflow-auto ${pan ? 'cursor-grabbing' : 'cursor-grab'} ${isOver ? 'ring-2 ring-inset ring-blue-500' : ''}`}
    >
```

- [ ] **Step 3: App 串接**

在 `App.tsx` 的 import 區加入：

```ts
import { useBlockWindowFileDrop } from './hooks/useFileDrop';
```

在 `App` 元件內、其他 hook 呼叫附近（例如 `const { settings } = useSettings();` 之後）加入：

```ts
  useBlockWindowFileDrop();
```

把第 323 行的 `ImpositionCanvas` 補上新 prop：

```tsx
          <ImpositionCanvas ref={impositionRef} state={imposition.state} update={imposition.update} colors={exportColors} onDropFiles={uploadImposition} />
```

- [ ] **Step 4: 驗證**

Run: `npm run typecheck && npm test && npm run build`
Expected: 全部通過。

**注意：typecheck 不會抓出漏傳 `onDropFiles` 的地方。** 這個專案沒有安裝 `@types/react`，`import { type DragEvent } from 'react'` 會靜默變成 `any`，JSX 的 props 因此完全不受型別檢查——就算把 `onDropFiles` 整個刪掉，或傳成 `42`，`npm run typecheck` 一樣會通過。這條路徑要靠 Task 3 的測試把關，不能指望型別系統。

- [ ] **Step 5: 手動確認**

Run: `npm run dev`，切到 Imposition 分頁，做這四件事：
1. 把一組 `cat.png` + `cat.svg` 拖到上傳框 → 框變藍、放開後圖層出現
2. 拖到畫布空白處 → 畫布外框變藍、放開後圖層出現
3. 拖進去之後滑過框內的文字再滑開 → 高亮**不應該**閃爍消失
4. 拖一個檔案到視窗的其他地方放開 → 瀏覽器**不應該**開啟那個檔案

- [ ] **Step 6: Commit**

```bash
git add src/components/panels/ImpositionPanel.tsx src/components/ImpositionCanvas.tsx src/App.tsx
git commit -m "$(cat <<'EOF'
feat: accept dragged files on the imposition page

The upload box and the canvas both take dropped image+SVG pairs and
hand them to the existing upload path unchanged. Dropping anywhere else
in the window no longer makes the browser open the file.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: E2E 涵蓋拖放

**Files:**
- Modify: `e2e/cut-underprint-imposition.spec.ts`

**Interfaces:**
- Consumes: `data-testid="imposition-dropzone"`（Task 2）
- Produces: 無

- [ ] **Step 1: 寫測試**

Playwright 沒有原生的檔案拖放 API，要在頁面內自己造 `DataTransfer`。在 `e2e/cut-underprint-imposition.spec.ts` 末尾加入：

```ts
test('拖曳「圖＋SVG」配對到拼版頁會觸發上傳流程', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('tab-imposition').click();

  const dropzone = page.getByTestId('imposition-dropzone');
  const dataTransfer = await page.evaluateHandle(() => {
    const dt = new DataTransfer();
    const png = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'dropped.png', { type: 'image/png' });
    const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>'], 'dropped.svg', { type: 'image/svg+xml' });
    dt.items.add(png);
    dt.items.add(svg);
    return dt;
  });

  await dropzone.dispatchEvent('dragenter', { dataTransfer });
  await expect(dropzone).toHaveAttribute('data-drag-over', 'true');

  // 這裡刻意用壞掉的 PNG，配對成功後 loadUploadedLayer 載入一定會失敗並跳出 alert；
  // 主動等待對話框並驗證內容含有這組檔名（skipped 用的是不含副檔名的 stem），
  // 才能證明 drop 真的把檔案送進了 uploadPairs 上傳流程，而不只是切換了 hover 狀態
  const dialogPromise = page.waitForEvent('dialog');
  await dropzone.dispatchEvent('drop', { dataTransfer });
  const dialog = await dialogPromise;
  expect(dialog.message()).toContain('dropped');
  await dialog.dismiss();

  await expect(dropzone).not.toHaveAttribute('data-drag-over', 'true');
});
```

**為什麼一定要斷言對話框，不能只看 `data-drag-over`：** `useFileDrop` 的 `onDrop` 裡 `setIsOver(false)` 是**任何** drop 事件都會同步執行的副作用，與檔案是否進入 `uploadPairs` 完全無關。只斷言那個屬性的話，就算把上傳流程整條拔掉，測試依然會通過——等於測了個寂寞。等待 alert 才能證明檔案真的走完了處理管線。

**斷言字串是 `dropped` 而不是 `dropped.png`：** `fileStem`（`src/source/sourceModel.ts`）會剝掉副檔名，`skipped` 陣列與 alert 訊息用的都是不含副檔名的 stem。寫成 `dropped.png` 的話，在實作正常的情況下斷言會恆假。

- [ ] **Step 2: 跑 E2E**

Run: `npm run test:e2e -- cut-underprint-imposition`
Expected: 新測試通過。

若卡在 `waitForEvent('dialog')` 逾時，**不要**改用 `page.on('dialog', …)` 無條件吞掉對話框來繞過——那會讓這個測試退化成「壞掉也不會變紅」。逾時代表 alert 沒有出現，也就是檔案沒有走完上傳流程，那是實作或測試設定的真問題，要查清楚。

- [ ] **Step 3: Commit**

```bash
git add e2e/cut-underprint-imposition.spec.ts
git commit -m "$(cat <<'EOF'
test: cover dropping files onto the imposition page

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### 階段完成檢查

- [ ] `npm run typecheck && npm test && npm run build` 全綠
- [ ] `npm run test:e2e` 全綠
- [ ] 手動確認 Task 2 Step 5 的四個情境
- [ ] 推分支、開 PR 到 `main`
