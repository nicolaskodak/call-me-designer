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
