# 白墨、Imposition 串接與設定頁 — 設計文件

- 日期：2026-09-11
- 分支：`feat/underprint-imposition-settings`
- 狀態：待使用者審閱

## 1. 背景與目標

Contour Crafted 目前有兩個分頁：Editor（從 PNG 產生刀模線並編輯節點）與 Mockup（把「圖＋SVG」自動排版後匯出 PDF）。本次要：

1. 把 Mockup 改名為 **Imposition**。
2. 新增 **Underprint（白墨）** 分頁：從圖案外輪廓內縮產生白墨區塊，參數與刀模線完全獨立，可編輯節點。
3. 刀模線要能在圖案有多個不連通區域時，產生**單一連通的封閉曲線**。
4. 新增 **設定** 分頁，可設定外部 API（本次只接 remove.bg 去背）。
5. Editor／Underprint 的成果可以「送到 Imposition」，排版結果可匯出分層 SVG。

## 2. 已確認的決策

| 項目 | 決定 |
|---|---|
| 輸出目標 | 下游設備未定，先輸出 SVG；不做特別色 PDF |
| 單位 | 參數以 mm 輸入，搭配 DPI 換算；DPI 優先讀圖檔內嵌資訊，否則用設定頁預設值（300），可手動改 |
| 白墨圖片來源 | 與 Editor 共用同一張圖與 DPI，參數各自獨立 |
| 白墨輸出形式 | 填滿區塊（evenodd），可以有多個島，補洞可選 |
| 白墨節點編輯 | 要，和刀模線共用 `PathEditor`，各自有 Undo／Redo |
| 幾何運算 | 向量域，使用 `clipper2-ts@2.0.1` |
| 舊演算法（模糊＋門檻） | 保留，與新的精確模式並存，只用於刀模線 |
| 調參數覆蓋手動編輯 | 已有手動編輯時，先跳確認視窗 |
| 外部 API | 只接 remove.bg 去背；超解析本次不做，保留介面 |
| Imposition | 加「送到 Imposition」，版面單位改 mm，匯出分層 SVG 與單層 SVG |
| 開發流程 | 在 feature branch 上分階段、多次 commit；TDD |

## 3. 非目標

- 超解析（只保留 `Upscaler` 介面位置，不實作）
- 特別色 PDF（CutContour、RDG_WHITE 等）
- 參數改變後保留手動編輯（改為先確認再覆蓋）
- 用固定寬度的「橋」連接島（MST bridges）
- 讀取 EXIF 的 DPI（只讀 PNG pHYs 與 JPEG JFIF）
- Imposition 依實際形狀嵌合排版（仍以外框 bbox 排版）
- 清理與本次無關的殘留（`GEMINI_API_KEY` define、esm.sh importmap、`backup/`）

## 4. 架構總覽

### 4.1 分頁

`Editor`（刀模線）／`Underprint`（白墨）／`Imposition`（排版）／`設定`

Editor 與 Underprint 頂端共用「來源圖片」區塊：上傳、DPI、去背、還原原圖。

### 4.2 資料流

```
上傳圖片 ──► SourceImage（原圖、工作圖、DPI）
                │ 取出 alpha（主執行緒，一次）
                ▼
        Geometry Worker（快取每張圖的 alpha）
          ├─ cutline(params)    ──► 多邊形（px）──► PathEditor（刀模）
          └─ underprint(params) ──► 多邊形（px）──► PathEditor（白墨）
                                                    │
                          「送到 Imposition」◄──────┘（送出編輯後的路徑）
                                    │
                                    ▼
                         Imposition（mm 版面）──► PDF／分層 SVG／單層 SVG
```

### 4.3 目錄結構

```
src/
  App.tsx                      分頁切換與頂層狀態（瘦身）
  types.ts                     共用型別與預設值
  units.ts                     mm／px／DPI 換算
  geometry/
    types.ts                   Ring、Polygon、參數與 worker 訊息型別
    trace.ts                   alpha → 輪廓（精確模式、舊模式的模糊）
    polygon.ts                 clipper2-ts 包裝：縮放、面積、union、inflate、PolyTree
    autoBridge.ts              自動橋接半徑的二分搜尋
    cutline.ts                 刀模線 pipeline
    underprint.ts              白墨 pipeline
    worker.ts                  Web Worker 進入點
    client.ts                  主執行緒端：送工作、job id、只採用最新結果
  editor/
    PathEditorCanvas.tsx       共用的 Paper.js 畫布與節點編輯
    pathHistory.ts             JSON 快照歷史（純邏輯）
    useRegenerateGuard.ts      「已編輯時先確認」的 hook
  components/
    Sidebar.tsx                分頁、面板容器、底部說明
    ConfirmDialog.tsx
    EditorCanvas.tsx           刀模頁畫布（使用 PathEditorCanvas）
    UnderprintCanvas.tsx       白墨頁畫布（使用 PathEditorCanvas）
    ImpositionCanvas.tsx       由 MockupCanvas 改名改寫
    panels/
      SourcePanel.tsx
      CutlinePanel.tsx
      UnderprintPanel.tsx
      ImpositionPanel.tsx
      SettingsPage.tsx
  imposition/
    packing.ts                 從 App.tsx 抽出的排版演算法
    layers.ts                  上傳配對與「送到 Imposition」的圖層建立
    exportSvg.ts               分層與單層 SVG
  export/
    svg.ts                     單張圖的 SVG 文件建立（mm 尺寸）
  services/
    backgroundRemover.ts       介面
    removeBg.ts                remove.bg client
  settings/
    schema.ts                  zod schema 與預設值
    storage.ts                 localStorage 讀寫
    SettingsContext.tsx
  utils/
    imageProcessing.ts         保留 loadImage 與舊模式模糊
    dpi.ts                     讀 PNG pHYs、JPEG JFIF
    sanitizeSvg.ts             DOMPurify 包裝
    download.ts                下載 Blob 的共用函式
```

每個檔案目標 400 行以內。`Controls.tsx` 拆成 `Sidebar` 加各分頁面板後刪除。

## 5. 單位與 DPI

- `mmToPx(mm, dpi) = mm / 25.4 × dpi`，`pxToMm(px, dpi) = px × 25.4 / dpi`；面積換算使用平方。
- DPI 來源依序為：圖檔內嵌資訊 → 設定頁預設值 → 使用者手動輸入。UI 會顯示目前的來源（「來自圖檔」「預設值」「手動」）。
- PNG：讀 `pHYs` chunk，單位為公尺時 `dpi = 每公尺像素數 × 0.0254`，四捨五入到整數。
- JPEG：讀 JFIF APP0 的密度，單位 1 為 dpi，單位 2 為 dpcm（乘以 2.54）；單位 0 或沒有 JFIF 時視為沒有資訊。
- WebP 與其他格式：視為沒有資訊。
- 合理範圍 72–2400，超出範圍的內嵌值忽略，改用預設值。

## 6. 幾何引擎（向量域）

所有運算在 worker 內以 px 進行；面板上的 mm 參數在送出工作前換算。Clipper 使用整數座標，px 乘以 `SCALE = 100`（精度 0.01px），輸出時再除回來。

### 6.1 共用步驟

1. **描邊（trace）**
   - 精確模式：直接把 alpha 通道（`Uint8ClampedArray`，不轉 Float64，節省記憶體）交給 d3-contour，在 `alphaThreshold` 取等值線，得到有次像素內插的外圈與內洞。
   - 舊模式：先做現有的水平／垂直 box blur（`legacyBlurPx`），再在 `legacyThreshold` 取等值線。
2. **整理**：`simplifyPaths`（ε = 0.5px）去除描邊鋸齒，再以 `FillRule.EvenOdd` 做一次 union，修正自我交叉並統一方向（外圈為正面積、洞為負面積）。
3. **去雜點**：用 PolyTree 取得外圈與洞的巢狀關係，面積小於 `minIslandArea` 的外圈連同其洞一起移除。

### 6.2 刀模線 pipeline

輸入參數（mm 已換成 px）：`offset`、`singleConnected`、`bridgeMode`、`bridgeRadius`、`bridgeMax`。舊模式下 `offset = 0`（外擴由模糊決定）。

1. 共用步驟 1–3。
2. 若 `singleConnected` 關閉：`inflate(+offset)`，結束。
3. 若開啟：
   - 求 `R`：手動模式直接用 `bridgeRadius`；自動模式見 6.4。
   - `inflate(+(offset + R))` 後再 `inflate(−R)`，都用 `JoinType.Round`、`EndType.Polygon`、`arcTolerance = 0.25px`。效果等於「外擴 offset 後做半徑 R 的 closing」，原本間距小於 `2 × (offset + R)` 的島會連在一起。
   - **補洞**：只保留外圈（正面積）。
   - 外圈只剩一個：輸出單一封閉路徑。
   - 外圈仍多於一個（自動模式超過 `bridgeMax`，或手動 R 不夠大）：全部保留，並回傳警告 `仍有 N 個分離區塊`；UI 顯示警告，匯出時再提醒一次，但不阻擋匯出。

### 6.3 白墨 pipeline

輸入參數：`inset`、`fillHoles`、`minIslandArea`。

1. 共用步驟 1–3。
2. `inflate(−inset)`（`JoinType.Round`）。線寬小於 `2 × inset` 的部分會消失，這是預期行為。
3. 內縮後再做一次去雜點。
4. `fillHoles` 開啟時只保留外圈。
5. 輸出所有外圈與洞（可以有多個島）。

### 6.4 自動橋接半徑

- 半徑越大，closing 的結果越大，連通區塊數量不會增加，因此可以用二分搜尋。
- 先試 `R = 0`：已經只有一個外圈就直接用 0。
- 否則在 `[0, bridgeMax]` 之間二分搜尋，直到區間小於 `mmToPx(0.1)`，取區間上界（保證連通）。
- 上界 `bridgeMax` 仍無法連通時，採用 `bridgeMax` 並回傳警告。
- 回傳實際採用的 `R`，UI 顯示為 mm（例如「自動橋接：2.3 mm」）。

### 6.5 Worker 協定

```ts
// 主執行緒 → worker
{ type: 'setImage', imageId: string, width: number, height: number, alpha: Uint8ClampedArray } // alpha 以 transfer 傳遞
{ type: 'cutline', jobId: number, imageId: string, params: CutlineParamsPx }
{ type: 'underprint', jobId: number, imageId: string, params: UnderprintParamsPx }
{ type: 'dropImage', imageId: string }

// worker → 主執行緒
{ type: 'result', jobId: number, polygons: Polygon[], warnings: string[], stats: { islandCount: number, bridgeRadiusPx?: number } }
{ type: 'error', jobId: number, message: string }
```

- `Polygon = { outer: Ring, holes: Ring[] }`，`Ring = [x, y][]`（px）。
- `client.ts` 為刀模、白墨各自維護遞增的 `jobId`，只採用最新 job 的結果，舊結果直接丟棄。
- 面板參數變動 debounce 150ms 後才送出工作。
- worker 在 `setImage` 時快取 alpha，換圖時送 `dropImage` 釋放。

### 6.6 參數與預設值

**刀模線（Editor）**

| 參數 | 範圍 | 預設 |
|---|---|---|
| 產生方式 | 精確／舊模式（模糊＋門檻） | 精確 |
| Alpha 門檻 | 1–254 | 16 |
| 外擴距離 | 0–20 mm，步進 0.1 | 2 mm |
| 舊模式 Blur | 0–50 px | 15 |
| 舊模式 Threshold | 1–100 | 10 |
| 最小島面積 | 0–50 mm²，步進 0.1 | 0.5 mm² |
| 單一連通 | 開／關 | 開 |
| 橋接半徑模式 | 自動／手動 | 自動 |
| 手動橋接半徑 | 0–30 mm | 3 mm |
| 自動橋接上限 | 1–50 mm | 10 mm |
| 平滑度（Paper simplify tolerance） | 0–20，步進 0.5 | 2 |

**白墨（Underprint）**

| 參數 | 範圍 | 預設 |
|---|---|---|
| Alpha 門檻 | 1–254 | 128 |
| 內縮距離 | 0–5 mm，步進 0.05 | 0.2 mm |
| 最小島面積 | 0–50 mm²，步進 0.1 | 0.2 mm² |
| 補洞 | 開／關 | 關 |
| 平滑度 | 0–20，步進 0.5 | 1 |

平滑度旁邊顯示換算後的 mm，提醒使用者 simplify 可能讓路徑偏移最多約這個距離。

## 7. PathEditor（共用節點編輯）

從現有 `EditorCanvas` 抽出 `PathEditorCanvas`，刀模頁與白墨頁各用一個實例。

- **輸入**：圖片 URL 與尺寸、`polygons`、`mode: 'stroke' | 'fill'`、顯示樣式、平滑度、是否顯示原圖、唯讀參考路徑（白墨頁用來疊淡色刀模線）。
- **路徑建立**：
  - 刀模：每個外圈一條 `Path`（單一連通時只有一條）。
  - 白墨：所有外圈與洞放進同一個 `CompoundPath`，`fillRule = 'evenodd'`。
  - 建立後依平滑度執行 `simplify`。
- **編輯互動**（維持現有行為）：拖曳節點、點線段新增節點、雙擊節點刪除。CompoundPath 的每個子路徑都可以編輯。
- **歷史**：`pathHistory.ts` 以純函式管理 JSON 快照堆疊（push、undo、redo、truncate），可單元測試。產生新路徑時重設歷史，第一筆快照作為基準。
- **快捷鍵**：Ctrl／Cmd+Z 復原，Ctrl／Cmd+Shift+Z 重做。只在該分頁作用中、且焦點不在輸入框時生效。
- **dirty 狀態**：歷史索引大於基準時為 dirty，透過 `onDirtyChange` 通知上層。
- **對外 handle**：`undo()`、`redo()`、`getPathData(): { d: string, fillRule?: 'evenodd' }[]`（px 座標，給匯出與送到 Imposition 使用）、`getStrokeBounds()`。

### 7.1 覆蓋前確認

`useRegenerateGuard(isDirty)` 回傳 `guard(action)`：

- 不 dirty：直接執行 `action`。
- dirty：暫存 `action`，開啟 `ConfirmDialog`：「你已手動編輯過節點，這個變更會重新產生路徑並覆蓋編輯。」按鈕為〔覆蓋並套用〕與〔取消〕。
  - 覆蓋：執行 `action`，重新產生後 dirty 自動歸零。
  - 取消：丟棄 `action`，受控輸入維持原值。
- 需要經過 guard 的操作：所有產生參數、DPI、產生方式、上傳新圖、去背、還原原圖。
- 不需要經過 guard 的操作：顏色、透明度、線寬、顯示開關（不會重新產生）。
- 刀模頁與白墨頁各有自己的 dirty 狀態。來源圖片的變更同時影響兩頁，只要任一頁是 dirty 就要確認，視窗中列出會被覆蓋的分頁。

## 8. 刀模線頁（Editor）

- 面板：來源圖片區塊、產生參數（6.6）、路徑編輯（Undo／Redo、平滑度、節點數）、外觀、匯出、「送到 Imposition」。
- 狀態列顯示：區塊數、自動橋接的 R（mm）、警告。
- 匯出：
  - **SVG（對齊原圖）**：`width`／`height` 為原圖的 mm 尺寸，`viewBox = 0 0 寬px 高px`。
  - **SVG（裁切外框）**：viewBox 貼齊 stroke bounds 加上半個線寬的邊距，mm 尺寸依此換算。
  - **PDF**：保留現有功能（原圖加上曲線），頁面尺寸改為實際 mm。
- 匯出時使用正式樣式（見 11 節），不使用畫面預覽的顏色與透明度。

## 9. 白墨頁（Underprint）

- 面板：來源圖片區塊（與 Editor 共用同一份狀態）、白墨參數（6.6）、路徑編輯（Undo／Redo、平滑度、節點數）、外觀（預覽填色與透明度、是否顯示原圖、是否顯示刀模參考線）、匯出、「送到 Imposition」。
- 預覽預設樣式：填色 `#ffffff`、透明度 0.7，節點編輯用的描邊 `#22d3ee`、寬 1px。畫布背景是深色，白色看得清楚。
- 匯出：**SVG（對齊原圖）**，尺寸規則與刀模相同。白墨必須和原圖對齊，所以不提供裁切版本。
- 還沒上傳圖時，顯示與 Editor 相同的空狀態。

## 10. Imposition

### 10.1 改名

分頁標籤、型別（`MockupState` → `ImpositionState` 等）、元件與檔名（`MockupCanvas` → `ImpositionCanvas`）、PDF 檔名（`imposition-layout.pdf`）全部改掉。中文按鈕「排圖」保留。

### 10.2 圖層模型

```ts
interface ImpositionLayer {
  id: string;
  name: string;
  imageUrl: string;
  widthPx: number;
  heightPx: number;
  dpi: number;
  cut: { kind: 'paths'; paths: { d: string }[] } | { kind: 'svg'; svgText: string };
  underprint?: { paths: { d: string; fillRule?: 'evenodd' }[] };
  layoutBoxPx: { x: number; y: number; width: number; height: number }; // 以刀模外框 bbox 計算，在原圖座標系
  totalCount: number;
}
```

- **送到 Imposition**：由 Editor 或 Underprint 觸發，打包目前的工作圖、DPI、兩頁編輯後的路徑（Underprint 尚未產生時就不含白墨），名稱取原檔名。同一張圖重複送出時，更新同一個圖層而不是新增（以來源圖片 id 對應）：替換圖、DPI、路徑與 `layoutBoxPx`，保留 `totalCount` 與既有實例的位置，並清除「塞不進」的標記（外框可能變了，需要重新排圖）。成功後切換到 Imposition 分頁，並顯示提示。
- **上傳配對**：維持同檔名配對「圖＋SVG」。SVG 先經過 DOMPurify（svg profile）再儲存，視為刀模層。DPI 讀圖檔，沒有就用預設值。

### 10.3 版面（mm）

- 邊界寬高、最小間距改用 mm，預設 297 × 210 mm（A4 橫式）、間距 3 mm。
- 實例的 `x`、`y` 以 mm 儲存。
- 顯示縮放：100% = 96 CSS px／inch（約 3.78 px／mm），提供縮放選單（25%–400%）與「符合視窗」。
- 每個圖層的內容依 `縮放 × 25.4 / dpi` 做 CSS scale，因此不同 DPI 的圖會以實際尺寸呈現。
- 排版演算法移到 `imposition/packing.ts`，演算法不變，輸入改為 mm。
- 顯示開關：原圖、白墨、刀模可以分別切換。
- 修正「新上傳項目不顯示」：`layerById` 改為在 render 時用 `useMemo` 計算。

### 10.4 匯出

所有匯出都排除塞不進去的項目。

- **PDF**：保留現有 html2canvas 截圖做法，頁面單位改為 mm。
- **分層 SVG**（`imposition-layers.svg`）：
  - 根元素 `<svg width="{W}mm" height="{H}mm" viewBox="0 0 {W} {H}">`，使用者座標單位就是 mm。
  - 三個圖層群組依序為 `artwork`、`underprint`、`cut`，每個都有 `id`，以及 `inkscape:groupmode="layer"` 與 `inkscape:label`，讓 Illustrator 和 Inkscape 都能辨識成圖層。
  - 每個實例在各群組內都是 `<g transform="translate(x y) rotate(...) scale(25.4/dpi) translate(-layoutX -layoutY)">`；旋轉 90° 的平移算法與目前畫面上的 CSS transform 一致。
  - artwork 用 `<image>` 嵌入 base64 data URI（object URL 離開 app 就無法使用）。
  - 上傳進來的 SVG 刀模以巢狀 `<svg>` 嵌入。
  - 沒有白墨的圖層不會出現在 underprint 群組。
- **只有刀模的 SVG**、**只有白墨的 SVG**：座標系與分層檔相同，只包含對應的群組。

## 11. 匯出樣式

- 刀模：`fill="none"`，`stroke` 使用設定頁的刀模顏色（預設 `#FF0000`），線寬 0.25 mm（依 viewBox 單位換算）。
- 白墨：`fill` 使用設定頁的白墨顏色（預設 `#FFFFFF`），不加描邊，`fill-rule="evenodd"`。
- `export/svg.ts` 與 `imposition/exportSvg.ts` 自己組 SVG 字串，不使用 Paper 的 `exportSVG`，確保輸出乾淨、屬性可以預期。

## 12. 設定頁與 remove.bg

### 12.1 設定

```ts
// settings/schema.ts（zod）
{
  version: 1,
  defaultDpi: number,              // 整數 72–2400，預設 300
  exportColors: { cut: string, underprint: string }, // #RRGGBB，預設 #FF0000／#FFFFFF
  removeBg: {
    apiKey: string,                // 可為空字串
    size: 'auto' | 'preview' | 'full', // 預設 'auto'
  },
}
```

- 儲存在 localStorage 的 `callMeDesigner.settings.v1`，變更後立即寫入。
- 讀取時用 `safeParse`：失敗（JSON 壞掉或格式不符）就退回預設值，並在設定頁顯示「設定已重設」的提示。localStorage 無法使用（例如無痕模式）時，在記憶體中運作，並顯示提示。
- API key 輸入框為 password 類型，可以切換顯示，有「清除」按鈕。頁面註明「key 只存在這個瀏覽器，不會送到 remove.bg 以外的地方」。
- **測試連線**：`GET https://api.remove.bg/v1.0/account`，帶 `X-Api-Key` header，成功時顯示剩餘點數與免費次數。實作時依官方文件確認回應欄位。
- `size = 'preview'` 時提示：「preview 免費但解析度低（約 0.25 MP），實際尺寸不變，但有效 DPI 會下降」。

### 12.2 去背流程

- Editor 上傳改為接受 PNG、JPG、WebP。
- 載入時掃描 alpha。完全不透明時，在來源圖片區塊顯示「此圖沒有透明背景，無法產生輪廓」和〔用 remove.bg 去背〕按鈕；還沒設定 key 時，按鈕改為〔前往設定〕。
- 即使圖已經是透明的，也可以手動按〔去背〕。
- 去背成功後，工作圖換成結果，原圖保留，可以〔還原原圖〕。
- 如果結果寬度與原圖不同，`dpi' = dpi × 新寬度 / 原寬度`，讓實際 mm 尺寸不變。
- 去背進行中顯示進度狀態，並停用相關按鈕。

### 12.3 remove.bg client

```ts
interface BackgroundRemover {
  removeBackground(input: Blob, options?: { signal?: AbortSignal }): Promise<Blob>;
}
```

- `POST https://api.remove.bg/v1.0/removebg`，multipart 欄位為 `image_file`、`size`、`format=png`，header 帶 `X-Api-Key`，回應是 PNG 二進位檔。
- 已驗證這個 API 允許瀏覽器直接呼叫（CORS 預檢回傳 `access-control-allow-origin: *`，並允許 `x-api-key`）。
- 逾時 60 秒（AbortController）。
- 送出前檢查檔案大小，上限依官方文件確認後寫成常數。
- 錯誤對應（`RemoveBgError`，帶 `code` 和中文訊息）：

| 狀況 | 訊息 |
|---|---|
| 400 | 顯示回應 `errors[0].title`，前面加「remove.bg 無法處理這張圖：」 |
| 402 | 點數不足，請到 remove.bg 儲值 |
| 403 | API key 無效，請到設定頁檢查 |
| 429 | 請求太頻繁，請稍後再試（有 `Retry-After` 時顯示秒數） |
| 5xx | remove.bg 服務暫時有問題 |
| 網路錯誤或逾時 | 無法連線到 remove.bg |

- 詳細錯誤只寫在 `console.error`，UI 只顯示上表的訊息，不顯示 key。
- 之後要做超解析時，新增 `Upscaler` 介面與對應的 client，不影響現有流程。

## 13. 安全性

- 上傳的 SVG 一律經過 DOMPurify（`USE_PROFILES: { svg: true, svgFilters: true }`）才放進 DOM。瀏覽器裡存有 API key 之後，惡意 SVG 的事件處理器可能讀走 key。
- API key 只用於 remove.bg 請求的 header，不寫進 log、URL 或匯出檔。
- 不在程式碼裡寫死任何 key。

## 14. 錯誤處理

- Worker 錯誤：回傳 `error` 訊息，畫布顯示「產生路徑失敗」和錯誤摘要，保留上一次成功的結果。
- 圖片載入失敗：沿用現有提示，改為中文。
- 邊界情況：
  - alpha 全透明：沒有輪廓，顯示「找不到不透明的區域」。
  - 內縮後什麼都不剩：白墨顯示「內縮後沒有剩餘區域」。
- 下載：`utils/download.ts` 在下載後呼叫 `URL.revokeObjectURL`，順便修掉現有的 object URL 洩漏。

## 15. 測試策略

工具：vitest（幾何運算在 node 環境跑，需要 DOM 的模組用 jsdom）、`@vitest/coverage-v8`、Playwright。

新增 scripts：`test`、`test:coverage`、`test:e2e`、`typecheck`（`tsc --noEmit`）。

### 15.1 單元測試（先寫測試，再寫實作）

- `geometry/trace`：半徑 50 的圓 → 一個 ring，面積誤差 2% 以內；有洞的環形 → 一個外圈加一個洞；舊模式的輸出與現有 `generateOutlineCoordinates` 一致。
- `geometry/polygon`：縮放往返無損；面積正負號與外圈、洞對應；union 會修正自我交叉。
- `geometry/cutline`：
  - 100×100 正方形外擴 10px → bbox 為 120×120（±0.5px）。
  - 兩個相距 30px 的正方形，開啟單一連通 → 只有一個外圈；關閉 → 兩個。
  - 環形 → 補洞後沒有內洞。
  - 小島會被移除。
  - 手動 R 不足時回傳警告。
- `geometry/autoBridge`：找到的 R 可以連通，而 `R − 0.1mm` 不行；已經連通時回傳 0；超過上限時回傳上限並帶警告。
- `geometry/underprint`：內縮 2px 後正方形邊長少 4px；線寬 4px、內縮 3px → 線消失；`fillHoles` 開關的效果；可以有多個島。
- `units`、`utils/dpi`：用手工組出的 PNG（pHYs）與 JPEG（JFIF）位元組測試；沒有資訊、超出範圍時回傳 null。
- `editor/pathHistory`：push、undo、redo、中途 push 會截斷後面的紀錄、重設。
- `export/svg`、`imposition/exportSvg`：mm 尺寸與 viewBox；0° 與 90° 的 transform；排除塞不進去的項目；沒有白墨的圖層不出現在 underprint 群組；含 inkscape 圖層屬性。
- `imposition/packing`：全部塞得進、部分塞不進、允許旋轉時才能塞進。
- `imposition/layers`：檔名配對；送到 Imposition 時更新同一個來源的圖層。
- `settings`：預設值；壞掉的 JSON 或不合 schema 時退回預設；localStorage 丟例外時仍可運作。
- `services/removeBg`（mock fetch）：成功時回傳 Blob；request 帶 `X-Api-Key` 與 multipart 欄位；400、402、403、429（含 Retry-After）、5xx、網路錯誤、逾時都對應到正確的 `RemoveBgError`。
- `utils/sanitizeSvg`：移除 `<script>`、`on*` 屬性、`javascript:` 連結，保留 path。

覆蓋率目標：`src/geometry`、`src/services`、`src/settings`、`src/imposition`、`src/export`、`src/editor/pathHistory.ts`、`src/utils` 各 80% 以上。

### 15.2 E2E（Playwright，對 `vite preview`）

1. **主流程**：上傳測試用 PNG（兩個分離的形狀）→ 刀模頁出現路徑 → 匯出的刀模 SVG 只有一個 `<path>` → 切到 Underprint，產生白墨 → 送到 Imposition → 排圖 → 匯出分層 SVG，檢查三個群組都在。
2. **去背流程**：在設定頁填一個假 key → 上傳不透明的 JPG → 用 `page.route` 攔截 `api.remove.bg` 並回傳透明 PNG → 按去背 → 刀模路徑出現。不會真的呼叫 remove.bg。
3. **覆蓋確認**：拖曳一個節點 → 改外擴距離 → 跳出確認視窗 → 取消後參數不變 → 覆蓋後重新產生。

## 16. 實作階段與 commit

每個階段結束前要通過 `typecheck`、`test`、`build`，然後 commit（conventional commits）。`.gitignore` 裡使用者自己加的 `.env` 不包含在這些 commit 裡。

1. `chore: 測試工具與整理` — vitest 和 coverage 設定、scripts；刪除根目錄舊的 `components/EditorCanvas.tsx`；Mockup 改名為 Imposition；抽出 `imposition/packing.ts` 並補測試；`utils/download.ts`。
2. `feat: 向量幾何引擎` — `units`、`utils/dpi`、`geometry/*`（trace、polygon、autoBridge、cutline、underprint）、worker 與 client，全部附測試。
3. `feat: 刀模線單一連通與 PathEditor` — `PathEditorCanvas`、`pathHistory`、`useRegenerateGuard`、`ConfirmDialog`；Editor 改用 worker 與新參數，舊模式並存；來源圖片區塊與 DPI；mm 尺寸的 SVG 匯出；拆分 `Controls`。
4. `feat: 白墨頁` — `UnderprintCanvas`、`UnderprintPanel`、白墨匯出、刀模參考線。
5. `feat: Imposition 串接與分層匯出` — mm 版面、縮放、送到 Imposition、DOMPurify、顯示開關、分層與單層 SVG、修正不顯示的 bug。
6. `feat: 設定頁與 remove.bg 去背` — settings schema、storage、context、`SettingsPage`、`removeBg` client、上傳 JPG/WebP、去背流程、DPI 調整、匯出顏色。
7. `test: E2E 測試` — Playwright 設定與三條情境。

## 17. 風險與注意事項

- **超大圖**：d3-contour 的記憶體與時間和像素數成正比。直接傳 `Uint8ClampedArray` 可以避免 Float64 的 8 倍記憶體；超過 40 MP 時顯示「圖片很大，處理可能較慢」。
- **頂點數**：圓角 offset 會增加頂點數。先 `simplifyPaths`，再用 `arcTolerance = 0.25px` 控制；最後的 Paper simplify 會再減少節點。
- **平滑造成偏移**：Paper simplify 可能讓路徑偏離精確距離，最多約平滑度的 px 值；UI 會顯示換算後的 mm 提醒。
- **clipper2-ts 內部使用 BigInt**：Vite 預設用 esbuild 壓縮，不受 terser 的 BigInt 問題影響；如果之後改用 terser，要設定 `compress.evaluate = false`。
- **clipper2-ts 的 PolyTree 與 simplify API 名稱**：實作第 2 階段時先寫一個小測試確認 API，再依實際名稱包裝在 `polygon.ts`。
- **remove.bg 回應欄位與檔案大小上限**：實作時依官方文件確認，寫成常數並加上測試。
- **d3-contour 的半像素偏移**：輪廓座標可能和像素中心差 0.5px，測試容許 ±0.5–1px 的誤差。
