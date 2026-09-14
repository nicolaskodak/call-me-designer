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

test('拖曳「圖＋SVG」配對到拼版頁會觸發上傳流程', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('tab-imposition').click();

  const dropzone = page.getByTestId('imposition-dropzone');
  const dataTransfer = await page.evaluateHandle(() => {
    const dt = new DataTransfer();
    const png = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'dropped.png', { type: 'image/png' });
    const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>'], 'dropped.svg', { type: 'image/svg+xml' });
    dt.items.add(png);
    dt.items.add(svg);
    return dt;
  });

  await dropzone.dispatchEvent('dragenter', { dataTransfer });
  await expect(dropzone).toHaveAttribute('data-drag-over', 'true');

  // 這裡刻意用壞掉的 PNG，配對成功後 loadUploadedLayer 載入一定會失敗並跳出 alert；
  // 主動等待對話框並驗證內容含有這組檔名（skipped 用的是不含副檔名的 stem），
  // 才能證明 drop 真的把檔案送進了 uploadPairs 上傳流程，而不只是切換了 hover 狀態
  const dialogPromise = page.waitForEvent('dialog');
  await dropzone.dispatchEvent('drop', { dataTransfer });
  const dialog = await dialogPromise;
  expect(dialog.message()).toContain('dropped');
  await dialog.dismiss();

  await expect(dropzone).not.toHaveAttribute('data-drag-over', 'true');
});

test('拖曳「圖＋SVG」配對到拼版畫布會觸發上傳流程', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('tab-imposition').click();

  const dropzone = page.getByTestId('imposition-canvas-dropzone');
  const dataTransfer = await page.evaluateHandle(() => {
    const dt = new DataTransfer();
    const png = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'dropped.png', { type: 'image/png' });
    const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>'], 'dropped.svg', { type: 'image/svg+xml' });
    dt.items.add(png);
    dt.items.add(svg);
    return dt;
  });

  await dropzone.dispatchEvent('dragenter', { dataTransfer });
  await expect(dropzone).toHaveAttribute('data-drag-over', 'true');

  // 同樣刻意用壞掉的 PNG，配對成功後 loadUploadedLayer 載入一定會失敗並跳出 alert；
  // 主動等待對話框並驗證內容含有這組檔名，才能證明畫布的 drop 也真的把檔案
  // 送進了 uploadPairs 上傳流程，而不只是切換了 hover 狀態
  const dialogPromise = page.waitForEvent('dialog');
  await dropzone.dispatchEvent('drop', { dataTransfer });
  const dialog = await dialogPromise;
  expect(dialog.message()).toContain('dropped');
  await dialog.dismiss();

  await expect(dropzone).not.toHaveAttribute('data-drag-over', 'true');
});
