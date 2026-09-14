# 階段 4：多版面匯出

**分支：** `feat/imposition-multi-export`（從最新的 `origin/main` 開出，需要階段 2 已合併）

**目標：** SVG 每張版面一個檔；PDF 一張版面一頁。

**兩個已知的坑：**

1. **連續下載會被瀏覽器擋。** 多個 `link.click()` 在同一個 tick 連發，瀏覽器只會放行第一個。每檔之間要間隔約 250ms。
2. **html2canvas 需要真的排版過的元素。** `renderPdf` 的 `cssPxPerMm` 來自 `el.offsetWidth`，元素若沒排版就會得到 `Infinity`。而畫布只渲染當前版面。解法是**匯出暫存區**：匯出期間把所有版面渲染到畫面外（`position: fixed; left: -100000px`），逐張截圖後卸載。用畫面外定位而不是 `hidden` 或 `visibility: hidden`——後兩者不是量不到尺寸，就是截出空白。

**順帶修掉的毛病：** 目前 PDF 解析度取決於使用者當下的螢幕縮放倍率。暫存區固定 zoom=1，輸出品質就穩定了。

---

### Task 1: 抽出可測的 SVG 產生器

**Files:**
- Modify: `src/imposition/exportSvg.ts`
- Modify: `src/imposition/exportSvg.test.ts`
- Modify: `src/imposition/exportFile.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/panels/ImpositionPanel.tsx`

**Interfaces:**
- Consumes: `placedItems(state, sheetId?)`、`buildImpositionSvg`（階段 2）
- Produces: `function buildSheetSvgs(o: { state; kinds; colors; imageDataUrls; baseName }): { filename: string; svg: string }[]`

把「產生哪些檔案、各自叫什麼名字」做成純函式放進 `exportSvg.ts`（該檔在 coverage 白名單內，測得到），`exportFile.ts` 只留下載這層薄 IO（該檔在 coverage exclude 名單內）。

- [ ] **Step 1: 寫失敗的測試**

在 `src/imposition/exportSvg.test.ts` 加入：

```ts
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
      { id: 'i1', layerId: 'L1', sheetId: 's1', xMm: 0, yMm: 0, rotationDeg: 0 },
      { id: 'i2', layerId: 'L1', sheetId: 's2', xMm: 5, yMm: 5, rotationDeg: 0 },
      { id: 'i3', layerId: 'L1', sheetId: null, xMm: 0, yMm: 0, rotationDeg: 0 },
    ],
  });

  it('每張版面產生一個檔，檔名依序編號', () => {
    const files = buildSheetSvgs({
      state: twoSheetState(),
      kinds: ['cut'],
      colors: { cut: '#FF0000', underprint: '#FFFFFF' },
      imageDataUrls: new Map(),
      baseName: 'imposition-cut',
    });
    expect(files.map(f => f.filename)).toEqual(['imposition-cut-1.svg', 'imposition-cut-2.svg']);
  });

  it('每個檔使用自己版面的尺寸', () => {
    const files = buildSheetSvgs({
      state: twoSheetState(),
      kinds: ['cut'],
      colors: { cut: '#FF0000', underprint: '#FFFFFF' },
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
      colors: { cut: '#FF0000', underprint: '#FFFFFF' },
      imageDataUrls: new Map(),
      baseName: 'x',
    });
    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe('x-1.svg');
  });
});
```

上面的 `layer()` 是該檔第 6 行既有的假圖層 helper，直接沿用；`inst()`（第 22 行）在階段 2 已補上 `sheetId`。

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/imposition/exportSvg.test.ts`
Expected: FAIL，`buildSheetSvgs is not exported`

- [ ] **Step 3: 實作**

`src/imposition/exportSvg.ts` 末尾加入：

```ts
export interface SheetSvgFile {
  filename: string;
  svg: string;
}

/** 每張有項目的版面產生一個 SVG；編號依版面順序，跳過空版面不會造成號碼跳號 */
export function buildSheetSvgs(o: {
  state: ImpositionState;
  kinds: readonly ImpositionLayerKind[];
  colors: { cut: string; underprint: string };
  imageDataUrls: ReadonlyMap<string, string>;
  baseName: string;
}): SheetSvgFile[] {
  return o.state.sheets.flatMap(sheet => {
    const items = placedItems(o.state, sheet.id);
    if (items.length === 0) return [];
    const svg = buildImpositionSvg({
      widthMm: sheet.widthMm,
      heightMm: sheet.heightMm,
      items,
      kinds: o.kinds,
      colors: o.colors,
      imageDataUrls: o.imageDataUrls,
    });
    return [{ svg, filename: '' }];
  }).map((file, index) => ({ ...file, filename: `${o.baseName}-${index + 1}.svg` }));
}
```

- [ ] **Step 4: 下載端改成多檔**

`src/imposition/exportFile.ts` 整個換成：

```ts
import { downloadText } from '../utils/download';
import { blobToDataUrl, buildSheetSvgs, placedItems, type ImpositionLayerKind } from './exportSvg';
import type { ImpositionLayer, ImpositionState } from './types';

const SVG_MIME = 'image/svg+xml;charset=utf-8';
/** 同一個 tick 連發多個下載會被瀏覽器擋掉，每檔之間隔一下 */
const DOWNLOAD_GAP_MS = 250;

const uniqueLayers = (layers: readonly ImpositionLayer[]): ImpositionLayer[] =>
  [...new Map(layers.map(l => [l.id, l] as const)).values()];

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** 回傳實際下載的檔案數 */
export async function downloadImpositionSvg(
  state: ImpositionState,
  kinds: readonly ImpositionLayerKind[],
  colors: { cut: string; underprint: string },
  baseName: string,
): Promise<number> {
  const items = placedItems(state);
  if (items.length === 0) return 0;

  const imageDataUrls = kinds.includes('artwork')
    ? new Map(
        await Promise.all(
          uniqueLayers(items.map(i => i.layer)).map(async l => [l.id, await blobToDataUrl(l.imageBlob)] as const),
        ),
      )
    : new Map<string, string>();

  const files = buildSheetSvgs({ state, kinds, colors, imageDataUrls, baseName });
  for (const [index, file] of files.entries()) {
    if (index > 0) await wait(DOWNLOAD_GAP_MS);
    downloadText(file.svg, file.filename, SVG_MIME);
  }
  return files.length;
}
```

- [ ] **Step 5: App 改傳檔名前綴並提示結果**

`src/App.tsx` 的 `exportImposition` 換成：

```tsx
  const exportImposition = (kinds: readonly ImpositionLayerKind[], baseName: string) => {
    downloadImpositionSvg(imposition.state, kinds, exportColors, baseName)
      .then(count => setNotice(count > 1 ? `已匯出 ${count} 個 SVG 檔（每張版面一檔）` : '已匯出 SVG'))
      .catch((err: unknown) => {
        console.error('匯出 Imposition SVG 失敗', err);
        window.alert('匯出 SVG 失敗，請再試一次。');
      });
  };
```

三個呼叫端把副檔名拿掉：`'imposition-layers'`、`'imposition-cut'`、`'imposition-underprint'`。

`ImpositionPanel.tsx` 的三個匯出按鈕文字加註每張版面一檔，例如：

```tsx
          <Download className="w-3 h-3" /> 分層 SVG（每張版面一檔）
```

- [ ] **Step 6: 驗證並 commit**

Run: `npm run typecheck && npm test && npm run build`

```bash
git add src/imposition/exportSvg.ts src/imposition/exportSvg.test.ts src/imposition/exportFile.ts src/App.tsx src/components/panels/ImpositionPanel.tsx
git commit -m "$(cat <<'EOF'
feat: export one SVG per sheet

Downloads are spaced out because browsers block several link clicks
fired in the same tick.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 抽出共用的版面渲染元件

**Files:**
- Modify: `src/components/ImpositionCanvas.tsx`

**Interfaces:**
- Produces: 檔案內部的 `SheetBoard` 元件（不對外匯出）

實況畫布與 PDF 暫存區要畫出一模一樣的內容。抽成一個元件，才不會改了一邊忘了另一邊。

- [ ] **Step 1: 抽出元件**

在 `ImpositionCanvas.tsx` 內，`ImpositionItem` 之後加入：

```tsx
interface SheetBoardProps {
  sheet: ImpositionSheet;
  instances: readonly ImpositionInstance[];
  layerById: ReadonlyMap<string, ImpositionLayer>;
  k: number;
  show: ImpositionShow;
  colors: Colors;
  selectedInstanceId?: string | null;
  onItemMouseDown?: (e: React.MouseEvent, instance: ImpositionInstance) => void;
  onMouseDown?: (e: React.MouseEvent) => void;
  boardRef?: (el: HTMLDivElement | null) => void;
}

/** 一張版面的內容。實況畫布與 PDF 暫存區共用，兩邊必須畫出一樣的東西 */
function SheetBoard(props: SheetBoardProps) {
  const { sheet, instances, layerById, k, show, colors } = props;
  return (
    <div
      ref={props.boardRef}
      className="relative shrink-0 border-2 border-dashed border-neutral-700 rounded-lg overflow-hidden bg-neutral-900/20"
      style={{ width: sheet.widthMm * k, height: sheet.heightMm * k }}
      onMouseDown={props.onMouseDown}
    >
      {instances.map(instance => {
        const layer = layerById.get(instance.layerId);
        return layer ? (
          <ImpositionItem
            key={instance.id}
            layer={layer}
            instance={instance}
            k={k}
            selected={props.selectedInstanceId === instance.id}
            show={show}
            colors={colors}
            onMouseDown={props.onItemMouseDown}
          />
        ) : null;
      })}
    </div>
  );
}
```

`ImpositionItem` 的 `onMouseDown` prop 改成可選（暫存區不需要互動）。

主要回傳的 JSX 用 `SheetBoard` 取代原本內嵌的版面 div，並傳 `boardRef={el => { boundaryRef.current = el; }}` 保住拖曳座標換算用的 ref。

空狀態提示**移到置中容器內、`SheetBoard` 之前**，成為它的兄弟節點（而不是留在版面框裡面）：這樣 `SheetBoard` 只負責畫版面內容，暫存區用它時就不會意外把「尚無排版項目」也截進 PDF。

```tsx
        <div className="min-w-full min-h-full flex flex-col items-center justify-center gap-3 p-6">
          {state.instances.length === 0 ? (
            <div className="flex flex-col items-center text-neutral-500 pointer-events-none">
              <p className="text-lg font-medium">尚無排版項目</p>
              <p className="text-sm opacity-60">從 Editor／Underprint 送過來，或拖曳「圖＋SVG」配對進來。</p>
            </div>
          ) : null}
          <SheetBoard
            sheet={sheet}
            instances={visible}
            layerById={layerById}
            k={k}
            show={state.show}
            colors={colors}
            selectedInstanceId={state.selectedInstanceId}
            onItemMouseDown={onItemMouseDown}
            onMouseDown={onBoundaryMouseDown}
            boardRef={el => { boundaryRef.current = el; }}
          />
        </div>
```

- [ ] **Step 2: 驗證**

Run: `npm run typecheck && npm test && npm run build`，再 `npm run dev` 目視確認畫布與階段 2 完全相同（拖曳、選取、分頁都正常）。

- [ ] **Step 3: Commit**

```bash
git add src/components/ImpositionCanvas.tsx
git commit -m "$(cat <<'EOF'
refactor: share one sheet renderer

The PDF export stage needs to draw exactly what the canvas draws, so
both now go through the same component.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 多頁 PDF

**Files:**
- Modify: `src/components/ImpositionCanvas.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `SheetBoard`（Task 2）
- Produces: `ImpositionCanvasHandle.exportPDF(onProgress?: (done: number, total: number) => void): Promise<void>`

- [ ] **Step 1: 拆開 renderPdf**

把 `renderPdf` 換成兩個函式：

```ts
/** 等兩次 rAF，確保 React 剛掛上的暫存區已經完成排版 */
const nextPaint = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

async function captureSheet(el: HTMLDivElement, widthMm: number): Promise<string> {
  const { default: html2canvas } = await import('html2canvas');
  const cssPxPerMm = el.offsetWidth / widthMm;
  if (!Number.isFinite(cssPxPerMm) || cssPxPerMm <= 0) throw new Error('版面尚未排版完成，無法匯出');
  const scale = Math.max(1, Math.min(MAX_CANVAS_PX / Math.max(el.offsetWidth, el.offsetHeight), PDF_DPI / MM_PER_INCH / cssPxPerMm));
  const prevBg = el.style.backgroundColor;
  el.style.backgroundColor = 'transparent';
  try {
    const canvas = await html2canvas(el, { backgroundColor: null, scale, useCORS: true });
    return canvas.toDataURL('image/png');
  } finally {
    el.style.backgroundColor = prevBg;
  }
}

async function buildSheetsPdf(pages: readonly { dataUrl: string; widthMm: number; heightMm: number }[]): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const first = pages[0];
  const doc = new jsPDF({ orientation: first.widthMm > first.heightMm ? 'l' : 'p', unit: 'mm', format: [first.widthMm, first.heightMm] });
  pages.forEach((page, index) => {
    if (index > 0) doc.addPage([page.widthMm, page.heightMm], page.widthMm > page.heightMm ? 'l' : 'p');
    // PDF 頁面不支援真正透明，先鋪白底
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, page.widthMm, page.heightMm, 'F');
    doc.addImage(page.dataUrl, 'PNG', 0, 0, page.widthMm, page.heightMm);
  });
  doc.save('imposition-layout.pdf');
}
```

- [ ] **Step 2: 加入匯出暫存區**

在元件內加入狀態與 refs：

```ts
  const [stageSheets, setStageSheets] = useState<readonly ImpositionSheet[] | null>(null);
  const stageRefs = useRef(new Map<string, HTMLDivElement>());
```

`exportPDF` 改成：

```ts
    exportPDF: async (onProgress?: (done: number, total: number) => void) => {
      const sheets = state.sheets.filter(s => state.instances.some(i => i.sheetId === s.id));
      if (sheets.length === 0) return;
      setStageSheets(sheets);
      try {
        await nextPaint();
        const pages: { dataUrl: string; widthMm: number; heightMm: number }[] = [];
        for (const [index, sheet] of sheets.entries()) {
          const el = stageRefs.current.get(sheet.id);
          if (!el) continue;
          pages.push({ dataUrl: await captureSheet(el, sheet.widthMm), widthMm: sheet.widthMm, heightMm: sheet.heightMm });
          onProgress?.(index + 1, sheets.length);
        }
        if (pages.length > 0) await buildSheetsPdf(pages);
      } finally {
        setStageSheets(null);
        stageRefs.current.clear();
      }
    },
```

deps 陣列改成 `[state]`。

在回傳的 JSX 最後（viewport 之後）加入暫存區：

```tsx
      {stageSheets ? (
        <div className="fixed top-0 pointer-events-none" style={{ left: -100000 }} aria-hidden data-testid="pdf-export-stage">
          {stageSheets.map(sheet => (
            <SheetBoard
              key={sheet.id}
              sheet={sheet}
              instances={state.instances.filter(i => i.sheetId === sheet.id)}
              layerById={layerById}
              k={CSS_PX_PER_MM}
              show={state.show}
              colors={colors}
              boardRef={el => {
                if (el) stageRefs.current.set(sheet.id, el);
                else stageRefs.current.delete(sheet.id);
              }}
            />
          ))}
        </div>
      ) : null}
```

`k={CSS_PX_PER_MM}` 就是 zoom=1，讓 PDF 解析度不再受螢幕縮放影響。

- [ ] **Step 3: App 顯示進度**

`src/App.tsx` 的 `onExportPdf`：

```tsx
            onExportPdf={() => {
              impositionRef.current
                ?.exportPDF((done, total) => setNotice(`正在產生 PDF：${done} / ${total} 頁`))
                .then(() => setNotice('PDF 已匯出'))
                .catch((err: unknown) => {
                  console.error('匯出 PDF 失敗', err);
                  window.alert('匯出 PDF 失敗，請再試一次。');
                });
            }}
```

`ImpositionCanvasHandle` 的型別同步更新：

```ts
export interface ImpositionCanvasHandle {
  exportPDF(onProgress?: (done: number, total: number) => void): Promise<void>;
  fitZoom(): number | null;
}
```

- [ ] **Step 4: 驗證**

Run: `npm run typecheck && npm test && npm run build`

- [ ] **Step 5: 手動確認（這是本階段唯一能驗證 PDF 的方式）**

Run: `npm run dev`
1. 排出 3 張以上版面 → 按「PDF 預覽」→ 開啟產出的 PDF
2. 頁數應該等於版面數，每頁內容對應各自的版面
3. 每頁的紙張尺寸應該符合該版面的尺寸（在 PDF 閱讀器看文件屬性）
4. 匯出過程中畫面**不應該**閃爍或跳動
5. 把畫布縮放改成 25% 再匯出一次 → PDF 解析度應該與 100% 時相同
6. 匯出期間 Toast 應顯示進度

- [ ] **Step 6: 量測效能並記錄**

用實際圖檔量 3 張與 10 張版面的匯出耗時，把數字補進 spec 的 §11 風險段落。若 10 張超過 30 秒，在 PR 描述中提出，由使用者決定要不要加版面數上限。

- [ ] **Step 7: Commit**

```bash
git add src/components/ImpositionCanvas.tsx src/App.tsx
git commit -m "$(cat <<'EOF'
feat: export every sheet as a PDF page

Sheets other than the active one are not in the DOM, and html2canvas
needs a laid-out element, so export mounts an off-screen stage holding
every sheet at zoom 1. Rendering at a fixed zoom also stops PDF
resolution from depending on the on-screen zoom level.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### 階段完成檢查

- [ ] `npm run typecheck && npm test && npm run build` 全綠
- [ ] `npm run test:e2e` 全綠
- [ ] 手動確認 Task 3 Step 5 的六個情境
- [ ] 效能數字已記錄
- [ ] 推分支、開 PR 到 `main`
