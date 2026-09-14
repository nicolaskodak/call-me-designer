# Imposition 多版面與拖曳上傳 — 設計文件

- 日期：2026-09-14
- 分支：尚未建立（實作分四個階段，各自一個分支與 PR）
- 狀態：已審閱通過（2026-09-14）

## 1. 背景與目標

實務上的拼版流程是：多張圖各自做好白墨與刀模，各自有需要的份數，一起送進拼版。份數一多就一定塞不下單一版面，需要用到多張版面。目前的 Imposition 只支援單一個版面，塞不下的項目就標記為「塞不進去」然後停在原地。

本次要做：

1. **拖曳上傳**：把「圖＋SVG」配對直接拖進拼版頁。
2. **多版面**：排不下時自動開新版面，用分頁瀏覽，各版面互不影響。
3. **自動選尺寸**：從一份可維護的常見尺寸清單中，自動決定每張版面用哪個尺寸，以總用紙面積最小為目標。
4. **匯出跟上**：每張版面一個 SVG 檔；PDF 改成一張版面一頁。

份數設定沿用圖層清單既有的「總數」欄位，不另做 UI。

## 2. 已確認的決策

| 項目 | 決定 |
|---|---|
| 目標函數 | 總用紙面積最小 |
| 演算法 | 逐版面貪婪選尺寸（方案 A），疊在既有 `packWithinBoundary` 之上 |
| 尺寸混用 | 允許。各版面獨立選尺寸，「最後一張挑小的」由目標函數自然導出 |
| 尺寸清單 | 程式提供預設，使用者可增刪；存 localStorage |
| 清單編輯位置 | 設定頁編輯（增刪），拼版頁勾選（決定這次用哪幾種） |
| 份數設定 | 沿用圖層清單現有的「總數」欄位 |
| 項目座標 | 維持「所屬版面內的相對座標」 |
| SVG 匯出 | 每張版面一個檔案，錯開下載 |
| PDF 匯出 | 保留，改成多頁，一張版面一頁 |
| 跨版面拖曳 | 第一版不做 |
| 設定相容性 | 用可選欄位加入，不升 schema 版號 |

## 3. 非目標

- 跨版面拖曳搬移項目（第一版不做；要搬就重新排圖）
- 依實際刀模外框嵌合排版（仍以外框矩形排版，另案評估）
- 全域最佳化的裝箱演算法（beam search／模擬退火）
- 壓縮檔打包多個 SVG（不加新依賴）
- 每張版面各自的縮放倍率（縮放仍是全域單一值）

## 4. 架構總覽

### 4.1 資料模型

```ts
interface ImpositionSheet {
  id: string;
  widthMm: number;
  heightMm: number;
  /** 來自哪個尺寸定義，供 UI 顯示名稱 */
  sizeName: string;
}

interface ImpositionInstance {
  id: string;
  layerId: string;
  /** null = 沒有任何啟用尺寸放得下 */
  sheetId: string | null;
  xMm: number;   // 所屬版面內的相對座標
  yMm: number;
  rotationDeg: 0 | 90;
}

interface ImpositionState {
  sheets: ImpositionSheet[];
  activeSheetId: string;
  // boundaryWidthMm / boundaryHeightMm 移除
  // 其餘欄位不變
}
```

**關鍵約束：項目座標維持版面內相對座標。** 這讓 `buildImpositionSvg` 與 `instanceTransform`（`src/imposition/exportSvg.ts`）完全不用改動，匯出核心零風險。

`notPlacedInstanceIds` 的語意收窄為「比所有啟用尺寸都大的項目」。這類項目不畫在任何版面上，改在面板以警告列出。連帶地 `ImpositionCanvas` 的黃色遮罩與 `renderPdf` 的 `data-not-placed` 過濾都成為死碼，一併移除。

初始狀態保留一張 A4 版面，避免還沒排圖時畫布一片空白，也保留「上傳後項目先落在 (0,0)」的現有行為。

### 4.2 尺寸定義

新檔 `src/imposition/sheetSizes.ts`：

```ts
interface SheetSize { name: string; widthMm: number; heightMm: number }
```

開箱預設（寬×高，橫式）：

| 名稱 | 尺寸 |
|---|---|
| A4 | 297 × 210 |
| A3 | 420 × 297 |
| SRA3 | 450 × 320 |
| A3+ | 483 × 329 |
| 菊八開 | 390 × 270 |
| 菊四開 | 540 × 390 |
| 菊對開 | 780 × 540 |

**版面方向固定**：每個尺寸只用表列的方向，不另外嘗試轉 90° 的版面。需要直式的話，在設定頁自己加一筆即可（例如「A4 直」210×297）。項目本身仍會依「允許 90° 旋轉」的設定轉向，這不受影響。

### 4.3 排版演算法

新檔 `src/imposition/sheets.ts`，`packing.ts` 完全不動。

```
packIntoSheets(rects, enabledSizes, allowRotate90):
  remaining = rects
  sheets = []
  while remaining 非空:
    candidates = 對每個啟用尺寸跑一次 packWithinBoundary(remaining, ...)
    可行候選 = 至少放進一個項目的候選
    if 可行候選為空: 把 remaining 全部標記為 notPlaced; break
    優先候選 = 可行候選中「有放進當前最大件」的那些
    選中 = (優先候選 ?: 可行候選) 中使用率最高者
    sheets.push(選中); remaining -= 選中放進去的項目
```

**使用率的定義**：`該版面已放置項目的面積總和 ÷ 版面面積`。項目面積用的是「含間距的外框」（也就是餵給 `packWithinBoundary` 的 `w + minGapMm`、`h + minGapMm`），與打包器的認知一致，避免兩邊算出不同的數字。

**為什麼使用率就是對的指標**：所有項目的總面積是固定的，因此「最小化總用紙面積」等價於「最大化整體平均使用率」。每一步選使用率最高的版面，是這個目標函數下的直接貪婪。

**最大件保障規則的必要性**：只看使用率會出現一種壞情況——選了一張塞滿小件、使用率很高的小版面，卻把大件推到後面獨佔一張幾乎空白的大版，總面積反而更差。所以候選中若有放得下「當前最大件」的，就只在那些之中比使用率。

**「最後一張挑小的」不需要特別寫**：剩下三個小件時，小尺寸的使用率必然贏過大尺寸，目標函數自己會選。

**決定性**：項目以面積遞減排序，面積相同時以 id 排序；候選以清單順序穩定比較，使用率相同時取先出現者。相同輸入必得相同輸出，才測得起來。

**複雜度**：啟用尺寸數 × 版面數次打包（預設 7 個尺寸）。既有打包器 3000 組隨機案例約 100ms 量級，實際規模完全無感。

**上限保護**：版面數上限 50，超過就停止並警告，避免任何情況下的無窮迴圈。

### 4.4 UI 結構

- 新元件 `src/components/SheetTabs.tsx`：畫布上方的版面分頁，顯示「版面 1（A4）68%」這類標籤。
- 分頁**只渲染當前版面**。PDF 的截圖需求改由匯出暫存區處理（見 6.2），所以不需要為了截圖把所有版面都留在 DOM。
- 面板的兩個手動寬高輸入框移除，換成尺寸勾選清單。
- 「符合視窗」以**當前版面**的尺寸計算，`computeFitZoom` 的簽名不動。各版面尺寸不同時，切換分頁不會自動重算縮放（縮放是全域單一值），使用者可自行再按一次。
- 面板新增：版面總數、各版面使用率、放不下的項目警告。

## 5. 尺寸清單與設定持久化

掛進既有的 `useSettings` / `SettingsContext`。

**相容性陷阱**：`settingsSchema` 的 `version` 是 `z.literal(1)`，而 `parseSettings` 一旦驗證失敗就整包退回預設值。若直接把版號升到 2，使用者現有的 DPI、匯出顏色、remove.bg API key 全部會被清空。因此新欄位一律用**可選 + 預設值**加入，版號維持 1：

```ts
sheetSizes: z.array(sheetSizeSchema).default(DEFAULT_SHEET_SIZES)
```

舊資料沒有這個欄位時，zod 會自動補上預設清單，既有設定不受影響。

設定頁新增「版面尺寸」區塊：清單顯示名稱與寬高，可新增、刪除、編輯。拼版頁只有勾選框，決定這次排圖用哪幾種。至少要勾選一種，否則排圖按鈕停用並提示。

## 6. 匯出

### 6.1 SVG 多檔

`downloadImpositionSvg` 改成迴圈：每張版面呼叫一次既有的 `buildImpositionSvg`，檔名 `imposition-1.svg`、`imposition-2.svg`……。`placedItems` 加一個 sheetId 參數做篩選，是唯一需要改的地方。

連續呼叫下載會被瀏覽器擋，因此每檔間隔約 250ms。不引入壓縮檔依賴。

### 6.2 PDF 多頁

現有的 `renderPdf` 是「建一份 doc、截一張圖、直接 save」，拆成兩段：

- `captureSheet(el, widthMm, heightMm)` → PNG dataURL
- `buildPdf(pages)` → 建一份 jsPDF，逐頁 `addPage([w, h], orientation)`，最後 save 一次

**量測問題與解法**：`cssPxPerMm` 是從 `el.offsetWidth` 算出來的，元素必須真的排版過，否則會得到 `Infinity`。但分頁只渲染當前版面。解法是**匯出暫存區**：匯出期間掛一個畫面外的容器（`position: fixed; left: -100000px`），把所有版面以 zoom=1 渲染進去，逐張截圖，完成後卸載。

用畫面外定位而非 `hidden` 或 `visibility: hidden` 是關鍵——前者仍會排版且 html2canvas 抓得到內容，後兩者不是量不到尺寸就是截出空白。相對於「匯出時輪流切換當前分頁再截圖」，這個做法不會閃爍，也不必與 React 的狀態更新時序搏鬥。

**順帶修掉的毛病**：目前 PDF 的解析度取決於使用者當下的螢幕縮放倍率。暫存區固定 zoom=1，輸出品質就穩定了。

**代價**：N 張版面要跑 N 次 html2canvas，每次最高 4000px，版面多時慢且吃記憶體。因此逐張處理、即時釋放 canvas，並用既有的 Toast 顯示進度。

## 7. 拖曳上傳

在 `UploadBox` 與畫布 viewport 掛 `onDragEnter` / `onDragOver` / `onDragLeave` / `onDrop`，drop 時把 `Array.from(e.dataTransfer.files)` 交給既有的 `uploadPairs`。**下游（配對、載入、加入圖層）完全不動。**

注意事項：

- `onDragOver` 必須 `preventDefault()`，否則 drop 不會觸發。
- `dragenter` / `dragleave` 在子元素之間會冒泡跳動，用計數器判斷是否真的離開。
- 畫布既有的拖曳移動是滑鼠事件（`mousedown` / `mousemove`），與 HTML5 檔案拖放是不同事件族，不會互相干擾。
- 目前 App 根層沒有阻止瀏覽器預設開檔行為，拖到非投放區會被瀏覽器接管——一併處理。

`layers.ts` 的 `isSvgFile` / `isImageFile` 目前是模組私有，拖放時要即時判斷「這批檔案收不收」需要匯出它們。

## 8. 錯誤處理與邊界情況

| 情況 | 行為 |
|---|---|
| 沒有勾選任何尺寸 | 排圖按鈕停用，面板提示 |
| 項目比所有啟用尺寸都大 | `sheetId = null`，不渲染，面板警告列出 |
| 版面數達到上限 50 | 停止並警告 |
| 刪除項目後版面變空 | 自動移除該版面；若刪的是當前分頁，切到相鄰版面 |
| 排圖後版面數變少 | `activeSheetId` 失效時回到第一張 |
| 拖入不成對的檔案 | 沿用現有的略過清單提示 |

## 9. 測試策略

**可完整單元測試的部分**（純函式，新檔都在 `src/imposition/`，會自動納入 80% coverage 門檻）：

- `sheets.ts`：性質測試——每個項目恰好屬於一個版面或被標記放不下；同一版面內任兩項目不重疊、不越界；版面尺寸必定來自啟用清單；相同輸入得相同輸出。
- 目標函數的迴歸案例：固定情境下的版面數與總面積，防止之後改動悄悄變差。
- `sheetSizes.ts`：預設清單、zod schema 的向後相容（舊設定沒有該欄位時補預設）。

**需要調整的既有測試**：`state.test.ts`（autoLayout 相關斷言全面改寫）、`exportSvg.test.ts`（`placedItems` 加 sheet 維度）、e2e 的 `width="297mm"` 斷言。

**測不到的部分**：`ImpositionCanvas` 的拖曳座標換算、html2canvas 與 PDF 產生（jsdom 無 2D canvas）。這塊靠 e2e 煙霧測試與實機確認，是已知的無網區。

## 10. 分階段交付

| 階段 | 內容 | 風險 |
|---|---|---|
| 1 | 拖曳上傳 | 極低。下游不動 |
| 2 | 資料模型 + 演算法 + 分頁 UI | 高。核心改動 |
| 3 | 尺寸清單設定頁與持久化 | 中。注意 schema 相容性 |
| 4 | 匯出（SVG 多檔、PDF 多頁） | 中。html2canvas 是不確定因素 |

四個獨立分支與 PR，每個都要通過 `npm run typecheck && npm test && npm run build` 才 commit。階段 1 可以立刻上線使用，不必等後面。

## 11. 風險與取捨

- **貪婪法不是最佳解。** 存在人工建構的案例讓它比最佳解差。取捨理由是它可預測、可測試、夠快，而且加了最大件保障規則之後，實務情境的表現已經夠好。真的遇到不滿意的排法，可以手動拖曳微調。
- **PDF 多頁的效能沒有實測數據。** 版面數多時可能明顯變慢。階段 4 開始前應先用實際圖檔量一次 N=5 與 N=20 的耗時，再決定要不要加上限或分批。
