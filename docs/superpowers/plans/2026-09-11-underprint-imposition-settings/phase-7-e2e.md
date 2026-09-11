# 第 7 階段：E2E 測試

先讀 index 的 Global Constraints。這個階段不改產品程式碼，只加 Playwright 測試。用到的 `data-testid` 都已在前面的階段定義：

| testid | 定義位置 |
|---|---|
| `tab-editor`、`tab-underprint`、`tab-imposition`、`tab-settings` | `Sidebar`（Task 3.5、6.3） |
| `source-upload` | `SourcePanel`（Task 3.5） |
| `cut-canvas`、`cut-island-count`、`cut-node-count`、`cut-offset`、`export-cut-aligned` | Task 3.5 |
| `under-island-count`、`send-to-imposition-under` | Task 4.1、5.4 |
| `confirm-overwrite`、`cancel-overwrite` | `ConfirmDialog`（Task 3.5） |
| `imposition-layer-count`、`imposition-auto-layout`、`export-imposition-layers` | Task 5.4 |
| `settings-removebg-key`、`remove-bg-button`、`revert-original` | Task 6.3 |

---

### Task 7.1：Playwright 設定與三條情境

**Files:**
- Modify: `package.json`（devDependency、`test:e2e` script）
- Create: `playwright.config.ts`、`e2e/fixtures.ts`、`e2e/helpers.ts`
- Create: `e2e/cut-underprint-imposition.spec.ts`、`e2e/remove-bg.spec.ts`、`e2e/overwrite-confirm.spec.ts`

**Interfaces:**
- Produces：`npm run test:e2e`（會先 build，再用 `vite preview` 在 `http://localhost:4173/call-me-designer/` 跑測試）

**注意：**
- 測試輸出放在 `node_modules/.cache/playwright/`，只用 `list` reporter，不會在專案根目錄產生未追蹤的檔案（不修改 `.gitignore`）。
- `index.html` 從 CDN 載入 Tailwind，執行 E2E 的機器需要能連網；否則版面會跑掉，畫布座標的計算會失準。
- 所有測試都攔截 `api.remove.bg`，不會真的呼叫外部服務。

- [ ] **Step 1：安裝 Playwright 與瀏覽器**

```bash
npm i -D -E @playwright/test@1.63.0
npx playwright install chromium
```

在 `package.json` 的 `"scripts"` 加入：

```json
    "test:e2e": "playwright test"
```

- [ ] **Step 2：建立 `playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test';

const BASE_URL = 'http://localhost:4173/call-me-designer/';
const CACHE_DIR = 'node_modules/.cache/playwright';

export default defineConfig({
  testDir: 'e2e',
  outputDir: `${CACHE_DIR}/test-results`,
  reporter: 'list',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    acceptDownloads: true,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

- [ ] **Step 3：建立測試圖片產生器 `e2e/fixtures.ts`**

用 Node 內建的 zlib 產生 PNG，不需要額外套件，也不需要把二進位檔放進 repo。

```ts
import { deflateSync } from 'node:zlib';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const crc32 = (buf: Buffer): number => {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type: string, data: Buffer): Buffer => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
};

type Rgba = [number, number, number, number];

export function makePng(width: number, height: number, pixel: (x: number, y: number) => Rgba): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      raw.set(pixel(x, y), y * stride + 1 + x * 4);
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const RED: Rgba = [220, 40, 40, 255];
const CLEAR: Rgba = [0, 0, 0, 0];
const WHITE: Rgba = [255, 255, 255, 255];
const inRect = (x: number, y: number, x0: number, y0: number, w: number, h: number) =>
  x >= x0 && x < x0 + w && y >= y0 && y < y0 + h;

/** 兩個 120 px 正方形，相距 60 px（300 dpi 時約 5 mm），預設參數下會橋接成一條刀模 */
export const twoSquaresPng = () =>
  makePng(400, 240, (x, y) => (inRect(x, y, 40, 60, 120, 120) || inRect(x, y, 220, 60, 120, 120) ? RED : CLEAR));

/** 400×400 圖中央一個 200 px 正方形（100..300） */
export const singleSquarePng = () =>
  makePng(400, 400, (x, y) => (inRect(x, y, 100, 100, 200, 200) ? RED : CLEAR));

/** 完全不透明（白底）的圖 */
export const opaquePng = () =>
  makePng(200, 200, (x, y) => (inRect(x, y, 50, 50, 100, 100) ? RED : WHITE));

/** 模擬 remove.bg 回傳的去背結果 */
export const cutoutPng = () =>
  makePng(200, 200, (x, y) => (inRect(x, y, 50, 50, 100, 100) ? RED : CLEAR));

export const pngFile = (name: string, buffer: Buffer) => ({ name, mimeType: 'image/png', buffer });
```

- [ ] **Step 4：建立共用操作 `e2e/helpers.ts`**

```ts
import { readFileSync } from 'node:fs';
import { expect, type Locator, type Page } from '@playwright/test';

/**
 * 設定 range input 的值並觸發 React 的 onChange。
 * 直接設定 `el.value` 會被 React 的 value tracker 吃掉，所以要透過原生 setter。
 */
export async function setRangeValue(locator: Locator, value: number): Promise<void> {
  await locator.evaluate((el, v) => {
    const input = el as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, String(v));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

/** 觸發下載並回傳下載檔案的文字內容 */
export async function downloadText(page: Page, trigger: () => Promise<void>): Promise<string> {
  const [download] = await Promise.all([page.waitForEvent('download'), trigger()]);
  const path = await download.path();
  if (!path) throw new Error('download has no path');
  return readFileSync(path, 'utf8');
}

export async function waitForCutline(page: Page, islands = '1'): Promise<void> {
  await expect(page.getByTestId('cut-island-count')).toHaveText(islands);
  await expect(page.getByTestId('cut-node-count')).not.toHaveText('0');
}

/**
 * 把圖片 px 座標換成畫面座標。
 * PathEditorCanvas 把圖片中心放在畫布中心，縮放為 min((寬−50)/圖寬, (高−50)/圖高, 1)。
 */
export async function imageToScreen(page: Page, imageSize: { w: number; h: number }, point: { x: number; y: number }) {
  const box = await page.getByTestId('cut-canvas').boundingBox();
  if (!box) throw new Error('cut canvas not visible');
  const zoom = Math.min((box.width - 50) / imageSize.w, (box.height - 50) / imageSize.h, 1);
  return {
    x: box.x + box.width / 2 + (point.x - imageSize.w / 2) * zoom,
    y: box.y + box.height / 2 + (point.y - imageSize.h / 2) * zoom,
  };
}
```

- [ ] **Step 5：主流程 `e2e/cut-underprint-imposition.spec.ts`**

```ts
import { expect, test } from '@playwright/test';
import { pngFile, twoSquaresPng } from './fixtures';
import { downloadText, waitForCutline } from './helpers';

test('cut line, underprint and layered imposition export', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('source-upload').setInputFiles(pngFile('two.png', twoSquaresPng()));

  // 兩個分離的正方形橋接成一條刀模
  await waitForCutline(page, '1');
  const cutSvg = await downloadText(page, () => page.getByTestId('export-cut-aligned').click());
  expect(cutSvg.match(/<path /g)).toHaveLength(1);
  expect(cutSvg).toMatch(/width="[\d.]+mm"/);

  // 白墨保留兩個島
  await page.getByTestId('tab-underprint').click();
  await expect(page.getByTestId('under-island-count')).toHaveText('2');

  // 送到 Imposition 後自動切換分頁
  await page.getByTestId('send-to-imposition-under').click();
  await expect(page.getByTestId('imposition-layer-count')).toHaveText('1');
  await page.getByTestId('imposition-auto-layout').click();

  const layered = await downloadText(page, () => page.getByTestId('export-imposition-layers').click());
  for (const id of ['artwork', 'underprint', 'cut']) {
    expect(layered).toContain(`id="${id}"`);
  }
  expect(layered).toContain('data:image/png;base64,');
  expect(layered).toContain('width="297mm" height="210mm"');
});
```

- [ ] **Step 6：去背流程 `e2e/remove-bg.spec.ts`**

```ts
import { expect, test } from '@playwright/test';
import { cutoutPng, opaquePng, pngFile } from './fixtures';

const REMOVE_BG_URL = 'https://api.remove.bg/v1.0/removebg';
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'x-api-key',
  'access-control-allow-methods': 'POST',
};

test('removes the background through remove.bg', async ({ page }) => {
  // 帶自訂 header 的跨網域請求會先送 OPTIONS 預檢；兩者都要回 CORS header，瀏覽器才讀得到回應
  await page.route(REMOVE_BG_URL, route =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: CORS_HEADERS })
      : route.fulfill({ status: 200, contentType: 'image/png', headers: CORS_HEADERS, body: cutoutPng() }),
  );

  await page.goto('./');
  await page.getByTestId('tab-settings').click();
  await page.getByTestId('settings-removebg-key').fill('test-key');

  await page.getByTestId('tab-editor').click();
  await page.getByTestId('source-upload').setInputFiles(pngFile('opaque.png', opaquePng()));
  await expect(page.getByText('此圖沒有透明背景')).toBeVisible();

  const request = page.waitForRequest(r => r.url() === REMOVE_BG_URL && r.method() === 'POST');
  await page.getByTestId('remove-bg-button').click();
  expect((await request).headers()['x-api-key']).toBe('test-key');

  await expect(page.getByText('此圖沒有透明背景')).toBeHidden();
  await expect(page.getByTestId('revert-original')).toBeVisible();
  await expect(page.getByTestId('cut-island-count')).toHaveText('1');
});
```

- [ ] **Step 7：覆蓋確認 `e2e/overwrite-confirm.spec.ts`**

`singleSquarePng` 的正方形上緣在 y = 100；預設 300 dpi、外擴 2 mm（≈ 23.6 px），刀模上緣約在 y = 76.4。點在上緣中央會在線段上新增一個節點，這就是一次手動編輯。

```ts
import { expect, test } from '@playwright/test';
import { pngFile, singleSquarePng } from './fixtures';
import { imageToScreen, setRangeValue, waitForCutline } from './helpers';

const IMAGE = { w: 400, h: 400 };
const CUT_TOP_EDGE = { x: 200, y: 100 - (2 / 25.4) * 300 };

test('asks before overwriting manual edits', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('source-upload').setInputFiles(pngFile('square.png', singleSquarePng()));
  await waitForCutline(page, '1');

  const before = Number(await page.getByTestId('cut-node-count').textContent());
  const point = await imageToScreen(page, IMAGE, CUT_TOP_EDGE);
  await page.mouse.click(point.x, point.y);
  await expect(page.getByTestId('cut-node-count')).toHaveText(String(before + 1));

  const offset = page.getByTestId('cut-offset');
  await setRangeValue(offset, 3);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByTestId('cancel-overwrite').click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(offset).toHaveValue('2');

  await setRangeValue(offset, 3);
  await page.getByTestId('confirm-overwrite').click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(offset).toHaveValue('3');

  // 已經覆蓋過，再調整不會再詢問
  await setRangeValue(offset, 4);
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(offset).toHaveValue('4');
});
```

- [ ] **Step 8：執行 E2E**

Run: `npm run test:e2e`
Expected: 3 passed。

失敗時先看 `node_modules/.cache/playwright/test-results/` 裡的 trace（`npx playwright show-trace <trace.zip>`）。最常見的原因是畫面座標：確認 viewport 為 1280×800、Tailwind CDN 有載入。

- [ ] **Step 9：最終驗證**

Run: `npm run typecheck && npm test && npm run test:coverage && npm run build && npm run test:e2e`
Expected: 全部通過；coverage 各項 ≥ 80%。

- [ ] **Step 10：Commit**

```bash
git add package.json package-lock.json playwright.config.ts e2e
git commit -m "test: add Playwright e2e for cut line, underprint, imposition and remove.bg

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
