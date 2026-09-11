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
