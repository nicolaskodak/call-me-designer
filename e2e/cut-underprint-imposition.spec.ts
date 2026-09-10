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
