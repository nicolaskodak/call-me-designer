import { expect, test } from '@playwright/test';
import { twoSquaresPng } from './fixtures';
import { waitForCutline } from './helpers';

/** 在頁面內用真實的 DataTransfer 造一個 drop payload；Playwright 沒有原生的檔案拖放 API */
const dropPayload = (page: import('@playwright/test').Page, name: string, type: string, bytes: number[]) =>
  page.evaluateHandle(
    ({ name, type, bytes }) => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(bytes)], name, { type }));
      return dt;
    },
    { name, type, bytes },
  );

test('拖曳圖片到來源區塊會載入圖片並產生刀模', async ({ page }) => {
  await page.goto('./');

  const dropzone = page.getByTestId('source-dropzone');
  const dataTransfer = await dropPayload(page, 'dropped-source.png', 'image/png', Array.from(twoSquaresPng()));

  await dropzone.dispatchEvent('dragenter', { dataTransfer });
  await expect(dropzone).toHaveAttribute('data-drag-over', 'true');
  await dropzone.dispatchEvent('drop', { dataTransfer });
  await expect(dropzone).not.toHaveAttribute('data-drag-over', 'true');

  // 真的長出刀模才代表檔案走完了 sourceApi.upload；
  // 只驗 data-drag-over 的話，就算上傳流程整條斷掉測試依然會過
  await waitForCutline(page, '1');
  await expect(page.getByTestId('source-dpi')).toBeVisible();
});

test('拖入不支援的檔案會提示，而不是靜靜失敗', async ({ page }) => {
  await page.goto('./');

  const dropzone = page.getByTestId('source-dropzone');
  const dataTransfer = await dropPayload(page, 'notes.txt', 'text/plain', [104, 105]);

  await dropzone.dispatchEvent('drop', { dataTransfer });

  await expect(page.getByTestId('warnings')).toContainText('請拖入 PNG／JPG／WebP 圖片');
  // 沒有載入任何圖片，所以來源資訊不會出現
  await expect(page.getByTestId('source-dpi')).toHaveCount(0);
});
