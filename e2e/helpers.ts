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
