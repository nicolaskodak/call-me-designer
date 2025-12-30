<div align="center">
<!-- <img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" /> -->
</div>

# Contour Crafted（call-me-designer）

一個在瀏覽器中把透明 PNG 自動轉成「外框向量路徑」並提供節點編輯、復原/重做與匯出的工具。

線上版本（GitHub Pages）：https://nicolaskodak.github.io/call-me-designer

## 功能

- 上傳 PNG（以 Alpha channel 為基礎產生外框）
- 外框產生參數：
   - Offset Distance（Blur）：用模糊擴張 Alpha 邊界，形成外框距離
   - Tightness（Threshold）：在模糊後的 Alpha 場上取等值線，控制外框鬆緊
- 路徑編輯：拖曳節點、點線段加節點、雙擊刪除節點
- 歷史：Undo / Redo
- 顯示：切換原圖顯示、切換可編輯節點顯示
- 外觀：填色/描邊顏色、透明度、線寬
- 匯出：
   - SVG（輸出路徑；匯出時會隱藏底圖）
   - PDF（把底圖與路徑一起輸出到 PDF）

## 技術架構

- UI：React + TypeScript（Vite）
- 向量編輯：Paper.js
   - `src/components/EditorCanvas.tsx` 建立 PaperScope、載入底圖 Raster、管理 outlines 群組與編輯互動
   - 以 Paper.js JSON 匯出/匯入實作 Undo/Redo
- 外框產生：d3-contour + 自訂 Alpha 模糊
   - `src/utils/imageProcessing.ts`：
      - 讀取 PNG → 取出 Alpha channel
      - 對 Alpha 做水平/垂直 box blur（控制外框擴張）
      - 用 `d3-contour` 產生指定 threshold 的等值線（回傳多段 ring 座標）
   - `EditorCanvas` 將座標轉成 Paper.js Path，並依 `AppState` 套用樣式
- 匯出：
   - SVG：`paper.Project.exportSVG()`
   - PDF：`jsPDF`（先加底圖，再把 Paper Path 轉成 curveTo 指令）

## 開發與執行

需求：Node.js（建議使用 LTS 版本）

```bash
npm install
npm run dev
```

其他指令：

```bash
npm run build
npm run preview
```

## 專案結構

- `src/App.tsx`：應用狀態（`AppState`）與控制面板/畫布整合
- `src/components/Controls.tsx`：參數調整、匯出、Undo/Redo
- `src/components/EditorCanvas.tsx`：Paper.js 畫布、產生/編輯路徑、匯出
- `src/utils/imageProcessing.ts`：PNG 讀取、Alpha 模糊、輪廓座標產生
- `src/types.ts`：`AppState` 型別與預設值

## 部署

### GitHub Pages（內建）

此 repo 使用 `gh-pages` 部署到 GitHub Pages。

```bash
npm run build
npm run deploy
```

注意：

- 若你的 repo 名稱或 Pages 路徑不同，請同步更新 `package.json` 的 `homepage`。
- GitHub Pages 是子路徑部署（例如 `/call-me-designer/`），Vite 需要設定 `base`，不然建構後會去抓 `https://<user>.github.io/assets/*` 而 404 造成白屏。
   - 本專案已在 `vite.config.ts` 設定：production 時 `base = '/call-me-designer/'`
   - 若你改了 repo 名稱，請一併更新這個路徑

### 其他靜態主機（Netlify / Vercel / Cloudflare Pages）

- Build 指令：`npm run build`
- 輸出資料夾：`dist/`
