# 白墨、Imposition 串接與設定頁 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增白墨（Underprint）分頁、刀模線單一連通、Imposition 串接與分層 SVG 匯出、設定頁與 remove.bg 去背。

**Architecture:** 形狀運算在向量域進行：d3-contour 描出 alpha 輪廓，clipper2-ts 做 offset／closing／補洞，全部是純函式，放在 Web Worker 執行。主執行緒用 Paper.js 顯示與編輯節點（共用的 `PathEditorCanvas`）。所有尺寸參數以 mm 輸入，依圖片 DPI 換算。

**Tech Stack:** React 19、TypeScript 5.8、Vite 6.4、Paper.js 0.12、d3-contour 4、clipper2-ts 2.0.1、zod 4、DOMPurify 3、jsPDF、html2canvas；測試用 vitest 3.2、jsdom 26、Playwright 1.63。

**Spec:** `docs/superpowers/specs/2026-09-11-underprint-imposition-settings-design.md`（執行前必讀）

## Global Constraints

- Node 版本為 20.19，因此固定使用：`vitest@3.2.7`、`@vitest/coverage-v8@3.2.7`、`jsdom@26.1.0`、`@playwright/test@1.63.0`。不要升到 vitest 4／5 或 jsdom 27 以上（需要 Node 22）。
- 其他新依賴固定版本：`clipper2-ts@2.0.1`、`zod@4.6.1`、`dompurify@3.4.15`（用 `npm i -E` 安裝，寫入精確版本）。
- 分支：`feat/underprint-imposition-settings`。每個 task 結束都要通過 `npm run typecheck && npm test && npm run build` 才能 commit。
- Commit 訊息用 conventional commits（`feat:`、`fix:`、`refactor:`、`test:`、`chore:`、`docs:`），結尾加上：`Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`。
- **不要** stage `.gitignore`（使用者自己的未提交修改）與 `backup/`。一律用 `git add <明確路徑>`，不要用 `git add -A` 或 `git add .`。
- 程式碼風格：不可變更新（spread／map／filter，不直接改傳入的物件）；production 程式碼不留 `console.log`（錯誤可用 `console.error`）；每個檔案 400 行以內；函式 50 行以內。
- 新 UI 文字用繁體中文；分頁名稱為 `Editor`、`Underprint`、`Imposition`、`設定`。
- 幾何內部單位一律是**圖片 px**；面板與 Imposition 使用 **mm**。換算只能透過 `src/units.ts`。
- Clipper 座標縮放常數 `SCALE = 100`，只在 `src/geometry/polygon.ts` 內部使用。
- d3-contour 的座標系與圖片 px 相同（像素 i 佔 [i, i+1]），不需要做半像素修正。
- 匯出樣式：刀模 `fill="none"`、線寬 0.25 mm、顏色取設定頁（預設 `#FF0000`）；白墨 `fill-rule="evenodd"`、不描邊、顏色取設定頁（預設 `#FFFFFF`）。
- remove.bg：`POST https://api.remove.bg/v1.0/removebg`，header `X-Api-Key`，multipart 欄位 `image_file`、`size`、`format=png`；上傳上限 12 MB；逾時 60 秒；錯誤 JSON 格式為 `{"errors":[{"title","code","detail"}]}`。

## 與 spec 的差異（實作時以本計畫為準）

1. spec 4.3 的 `EditorCanvas.tsx` 與 `UnderprintCanvas.tsx` 只差 props，合併為一個 `src/components/GeometryView.tsx`，舊的 `EditorCanvas.tsx` 刪除。
2. spec 15.2 的去背 E2E 用「不透明的 PNG」代替 JPG（測試碼不需要 JPEG 編碼器，走的是同一條「沒有透明背景」的程式路徑）。
3. spec 17 提到的 d3-contour 半像素偏移經實測不存在，相關容許誤差改為只考慮 alpha 門檻內插（門檻 128 時邊緣誤差 < 0.01px）。
4. 白墨只有在「這張圖曾經開過 Underprint 分頁」時才會計算與隨圖層送出；送出時提示「含白墨／不含白墨」。
5. remove.bg `/account` 的回應欄位官方文件沒有寫明，採寬鬆解析：讀得到 `data.attributes.credits.total` 與 `data.attributes.api.free_calls` 就顯示，讀不到只顯示「連線成功」。

## 檔案地圖

| 路徑 | 職責 | 階段 |
|---|---|---|
| `vitest.config.ts` | vitest 設定、coverage 門檻 | 1 |
| `src/imposition/packing.ts` | 矩形排版演算法（從 App.tsx 抽出） | 1 |
| `src/utils/download.ts` | 下載 Blob／文字，下載後 revoke URL | 1 |
| `src/units.ts` | mm／px／DPI 換算與範圍 | 2 |
| `src/utils/dpi.ts` | 讀 PNG pHYs、JPEG JFIF 的 DPI | 2 |
| `src/geometry/types.ts` | Ring、Polygon、參數、worker 訊息型別 | 2 |
| `src/geometry/messages.ts` | 警告訊息文字 | 2 |
| `src/geometry/params.ts` | 參數預設值、mm → px 換算 | 2 |
| `src/geometry/polygon.ts` | clipper2-ts 包裝 | 2 |
| `src/geometry/trace.ts` | alpha → rings（精確、舊模式模糊） | 2 |
| `src/geometry/autoBridge.ts` | closing、補洞、自動橋接半徑 | 2 |
| `src/geometry/cutline.ts` | 刀模 pipeline | 2 |
| `src/geometry/underprint.ts` | 白墨 pipeline | 2 |
| `src/geometry/handler.ts` | worker 訊息處理（可測試） | 2 |
| `src/geometry/worker.ts` | worker 進入點（薄層） | 2 |
| `src/geometry/client.ts` | 主執行緒 client，只採用最新 job | 2 |
| `src/geometry/testUtils.ts` | 測試用的 alpha 圖產生器 | 2 |
| `src/utils/alpha.ts` | 取出 alpha、判斷是否有透明 | 3 |
| `src/editor/pathHistory.ts` | 快照歷史（純函式） | 3 |
| `src/editor/guardMessage.ts` | 覆蓋確認訊息（純函式） | 3 |
| `src/editor/useRegenerateGuard.ts` | 覆蓋前確認的 hook | 3 |
| `src/editor/PathEditorCanvas.tsx` | 共用 Paper.js 畫布與節點編輯 | 3 |
| `src/export/svg.ts` | 單張圖的 SVG 文件 | 3 |
| `src/export/cutPdf.ts` | 刀模 PDF（mm 頁面） | 3 |
| `src/hooks/useSourceImage.ts` | 來源圖片、DPI、版本（原圖／去背） | 3 |
| `src/hooks/useGeometry.ts` | debounce 後送 worker 工作 | 3 |
| `src/components/GeometryView.tsx` | 畫布外層：空狀態、處理中、警告 | 3 |
| `src/components/ConfirmDialog.tsx` | 確認視窗 | 3 |
| `src/components/Sidebar.tsx` | 分頁與面板容器（取代 Controls.tsx） | 3 |
| `src/components/panels/fields.tsx` | 共用的滑桿、數字、開關輸入 | 3 |
| `src/components/panels/SourcePanel.tsx` | 上傳、DPI、去背按鈕 | 3（去背在 6） |
| `src/components/panels/CutlinePanel.tsx` | 刀模參數、編輯、外觀、匯出 | 3 |
| `src/components/panels/StylePanel.tsx` | 外觀設定（兩頁共用） | 3 |
| `src/components/panels/EditSection.tsx` | Undo／Redo、節點數（兩頁共用） | 3 |
| `src/editor/keyboard.ts` | 判斷焦點是否在輸入框 | 3 |
| `src/editor/paperItems.ts` | 在 PaperScope 建立、套樣式、讀取路徑 | 3 |
| `src/editor/editTool.ts` | 拖曳／新增／刪除節點的 Paper Tool | 3 |
| `src/source/sourceModel.ts`、`src/source/loadImageVersion.ts` | 來源圖片模型、載入圖片版本 | 3 |
| `src/utils/id.ts` | 產生唯一 id | 3 |
| `src/hooks/useEditorSlot.ts` | 單一 PathEditor 的狀態（歷史、節點數、dirty、路徑） | 3 |
| `src/hooks/useImposition.ts` | Imposition 狀態與動作（第 3 階段搬出，第 5 階段改寫） | 3、5 |
| `src/components/panels/ImpositionPanel.tsx` | Imposition 面板（第 3 階段搬出，第 5 階段改寫） | 3、5 |
| `src/components/Toast.tsx` | 短暫提示訊息 | 5 |
| `src/imposition/loadUploadedLayer.ts`、`src/imposition/exportFile.ts` | 上傳配對載入、匯出下載（DOM） | 5 |
| `src/hooks/useBackgroundRemoval.ts` | 去背流程（取消、錯誤訊息） | 6 |
| `src/components/panels/BackgroundRemovalSection.tsx` | 去背與還原按鈕 | 6 |
| `src/components/panels/UnderprintPanel.tsx` | 白墨參數、編輯、外觀、匯出 | 4 |
| `src/utils/sanitizeSvg.ts` | DOMPurify 包裝、解析上傳 SVG | 5 |
| `src/imposition/state.ts` | Imposition 狀態的純函式 reducer | 5 |
| `src/imposition/layers.ts` | 上傳配對、送到 Imposition 的圖層建立 | 5 |
| `src/imposition/exportSvg.ts` | 分層與單層 SVG | 5 |
| `src/imposition/measureSvg.ts` | 上傳 SVG 的 bbox（DOM） | 5 |
| `src/components/ImpositionCanvas.tsx` | mm 版面畫布 | 5 |
| `src/components/panels/ImpositionPanel.tsx` | 版面、排圖、圖層、匯出 | 5 |
| `src/settings/schema.ts`、`storage.ts`、`SettingsContext.tsx` | 設定 | 6 |
| `src/services/backgroundRemover.ts`、`removeBg.ts` | 去背介面與 remove.bg client | 6 |
| `src/components/panels/SettingsPage.tsx` | 設定頁 | 6 |
| `playwright.config.ts`、`e2e/*` | E2E | 7 |

## 階段與 task

每個階段的詳細步驟在 `docs/superpowers/plans/2026-09-11-underprint-imposition-settings/` 目錄下，依序執行：

1. [phase-1-tooling.md](2026-09-11-underprint-imposition-settings/phase-1-tooling.md)
   - Task 1.1 測試工具、tsconfig、刪除舊檔
   - Task 1.2 抽出排版演算法
   - Task 1.3 Mockup 改名為 Imposition
   - Task 1.4 下載工具函式
2. [phase-2-geometry.md](2026-09-11-underprint-imposition-settings/phase-2-geometry.md)
   - Task 2.1 單位換算
   - Task 2.2 讀取 DPI
   - Task 2.3 型別、參數與 Clipper 包裝
   - Task 2.4 描邊
   - Task 2.5 刀模 pipeline 與自動橋接
   - Task 2.6 白墨 pipeline
   - Task 2.7 Worker 與 client
3. [phase-3-cutline.md](2026-09-11-underprint-imposition-settings/phase-3-cutline.md)
   - Task 3.1 alpha 工具、歷史、確認訊息
   - Task 3.2 SVG 與 PDF 匯出
   - Task 3.3 PathEditorCanvas
   - Task 3.4 來源圖片與幾何 hooks
   - Task 3.5 面板、Sidebar 與 App 串接
4. [phase-4-underprint.md](2026-09-11-underprint-imposition-settings/phase-4-underprint.md)
   - Task 4.1 白墨頁
5. [phase-5-imposition.md](2026-09-11-underprint-imposition-settings/phase-5-imposition.md)
   - Task 5.1 SVG 過濾與解析
   - Task 5.2 Imposition 狀態 reducer 與圖層建立
   - Task 5.3 分層 SVG 匯出
   - Task 5.4 mm 版面畫布、面板與串接
6. [phase-6-settings.md](2026-09-11-underprint-imposition-settings/phase-6-settings.md)
   - Task 6.1 設定 schema 與儲存
   - Task 6.2 remove.bg client
   - Task 6.3 設定頁與去背流程
7. [phase-7-e2e.md](2026-09-11-underprint-imposition-settings/phase-7-e2e.md)
   - Task 7.1 Playwright 設定與三條情境

## 完成條件

- `npm run typecheck`、`npm test`、`npm run test:coverage`（80% 門檻）、`npm run build`、`npm run test:e2e` 全部通過。
- spec 第 2 節的每一項決定都能在 UI 上操作到。
- 分支上每個 task 各有一個 commit。
