# Imposition 多版面與拖曳上傳 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓 Imposition 支援拖曳上傳、排不下時自動開新版面、從可維護的尺寸清單中自動選出總用紙面積最小的組合，並用分頁瀏覽各版面。

**Architecture:** 多版面演算法是疊在既有 `packWithinBoundary` 之上的新純函式，不修改既有打包器。每開一張版面就對每個啟用尺寸各跑一次打包，選使用率最高者（並優先保證放進當前最大件），剩餘項目遞迴開下一張。項目座標維持「所屬版面內的相對座標」，因此 SVG 匯出核心不需改動。

**Tech Stack:** React 19、TypeScript 5.8、Vite 6、Paper.js 0.12、clipper2-ts 2.0.1、zod 4、jsPDF、html2canvas；測試用 vitest 3.2.7、jsdom 26.1.0、@testing-library/react 16.3.3、Playwright 1.63。

**Spec:** `docs/superpowers/specs/2026-09-14-imposition-multi-sheet-design.md`（執行前必讀）

## Global Constraints

- Node 版本為 20.19，測試依賴固定：`vitest@3.2.7`、`@vitest/coverage-v8@3.2.7`、`jsdom@26.1.0`、`@playwright/test@1.63.0`。不要升級。
- 本計畫**不新增任何 npm 依賴**。
- 每個階段一個分支，從最新的 `origin/main` 開出：`feat/imposition-drag-drop`、`feat/imposition-multi-sheet`、`feat/imposition-sheet-sizes`、`feat/imposition-multi-export`。
- 每個 task 結束都要通過 `npm run typecheck && npm test && npm run build` 才能 commit。
- Commit 訊息用 conventional commits，結尾加上：`Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- **不要** stage `.gitignore`、`data/`、`backup/`（使用者自己的未提交修改）。一律 `git add <明確路徑>`，禁用 `git add -A` 與 `git add .`。
- 程式碼風格：不可變更新（spread／map／filter，不改傳入物件）；production 程式碼不留 `console.log`（錯誤用 `console.error`）；每個檔案 400 行以內；函式 50 行以內。
- 新 UI 文字一律繁體中文。
- 尺寸單位：Imposition 一律 mm；換算只透過 `src/units.ts`。
- coverage 門檻 80%（lines/functions/branches/statements）。`src/imposition/**/*.ts` 已在 `vitest.config.ts` 的 coverage include 白名單內，**新增的 `src/imposition/` 檔案會自動被門檻涵蓋**，必須有對應測試。
- 測試環境預設 `node`；需要 DOM 的測試在檔首加 `// @vitest-environment jsdom`（見 `src/hooks/useSourceImage.test.tsx`）。

## 檔案地圖

| 路徑 | 職責 | 階段 |
|---|---|---|
| `src/hooks/useFileDrop.ts` | 檔案拖放的 hook 與阻擋瀏覽器預設開檔 | 1 |
| `src/hooks/useFileDrop.test.tsx` | 上述測試 | 1 |
| `src/components/panels/ImpositionPanel.tsx` | 上傳框接拖放；後續改尺寸勾選與版面統計 | 1、2、3 |
| `src/components/ImpositionCanvas.tsx` | 畫布接拖放；後續改成只渲染當前版面 | 1、2、4 |
| `src/App.tsx` | 串接拖放、版面分頁、匯出 | 1、2、4 |
| `src/imposition/sheetSizes.ts` | 尺寸型別與預設清單 | 2 |
| `src/imposition/sheets.ts` | 多版面演算法（純函式） | 2 |
| `src/imposition/sheets.test.ts` | 演算法測試，含性質測試 | 2 |
| `src/imposition/types.ts` | `ImpositionSheet`、instance 的 `sheetId`、state 的 `sheets` | 2 |
| `src/imposition/state.ts` | `autoLayout` 改多版面、版面選取與回收 | 2 |
| `src/components/SheetTabs.tsx` | 版面分頁列 | 2 |
| `src/hooks/useImposition.ts` | 傳入啟用尺寸 | 2、3 |
| `src/settings/schema.ts` | 尺寸清單設定（可選欄位，不升版號） | 3 |
| `src/components/panels/SettingsPage.tsx` | 尺寸清單增刪 UI | 3 |
| `src/imposition/exportSvg.ts` | `placedItems` 加 sheet 篩選 | 4 |
| `src/imposition/exportFile.ts` | 每版面一個 SVG，錯開下載 | 4 |
| `e2e/cut-underprint-imposition.spec.ts` | 尺寸斷言與多版面情境 | 2、4 |

## 階段

| 階段 | 檔案 | 交付內容 |
|---|---|---|
| 1 | `phase-1-drag-drop.md` | 拖曳上傳。可獨立上線 |
| 2 | `phase-2-multi-sheet-core.md` | 資料模型、演算法、分頁 UI。核心 |
| 3 | `phase-3-sheet-sizes-settings.md` | 尺寸清單設定頁與持久化 |
| 4 | `phase-4-exports.md` | SVG 多檔與 PDF 多頁 |

**順序不可調換：必須 1 → 2 → 3／4。** 階段 2 重寫 `ImpositionCanvas` 的 JSX，其中包含階段 1 加入的 `dropProps`；先做階段 2 會編譯失敗。階段 3 與 4 都只依賴階段 2，彼此獨立，可以平行進行。

## 與 spec 的差異（實作時以本計畫為準）

1. spec §7 提到拖放需要把 `layers.ts` 的 `isSvgFile` / `isImageFile` 改成對外匯出，以便即時判斷「這批檔案收不收」。實作上不需要：drop 直接把所有檔案交給既有的 `uploadPairs`，不成對或無法載入的檔案本來就會進入既有的略過清單並提示使用者。少一組對外 API，少一份要維護的重複判斷。
2. spec §6.2 只說 PDF 匯出要用畫面外暫存區。實作上多一步：先把版面渲染抽成共用的 `SheetBoard` 元件，讓實況畫布與暫存區共用同一份渲染邏輯（階段 4 Task 2）。否則兩邊各寫一份，日後改一邊忘另一邊。
3. spec §6.1 只說 SVG 每張版面一個檔。實作上把「產生哪些檔案、各自叫什麼名字」抽成純函式 `buildSheetSvgs` 放進 `exportSvg.ts`（在 coverage 白名單內，測得到），`exportFile.ts` 只留下載這層薄 IO（在 coverage exclude 名單內）。
