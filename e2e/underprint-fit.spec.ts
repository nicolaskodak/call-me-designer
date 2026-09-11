import { expect, test } from '@playwright/test';
import { pngFile, singleDiscPng } from './fixtures';
import { imageToScreen } from './helpers';

const IMAGE = { w: 400, h: 400 };
// 圓的頂端在 y = 50；預設白墨內縮 0.2 mm（300 dpi ≈ 2.36 px），白墨頂端約在 y = 52.4
const UNDERPRINT_TOP = { x: 200, y: 50 + (0.2 / 25.4) * 300 };

// 白墨畫布在分頁隱藏時就已建立；切換過去後必須縮放到適合畫面，否則點不到路徑
test('fits the underprint canvas after switching to its tab', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('source-upload').setInputFiles(pngFile('disc.png', singleDiscPng()));
  await expect(page.getByTestId('cut-island-count')).toHaveText('1');

  await page.getByTestId('tab-underprint').click();
  await expect(page.getByTestId('under-island-count')).toHaveText('1');
  const nodeCount = page.getByTestId('under-node-count');
  await expect(nodeCount).not.toHaveText('0');
  const before = Number(await nodeCount.textContent());

  const point = await imageToScreen(page, IMAGE, UNDERPRINT_TOP, 'under-canvas');
  await page.mouse.click(point.x, point.y);
  await expect(nodeCount).toHaveText(String(before + 1));
});
