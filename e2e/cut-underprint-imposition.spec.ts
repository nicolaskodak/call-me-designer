import { expect, test } from '@playwright/test';
import { pngFile, twoSquaresPng } from './fixtures';
import { downloadAll, downloadText, waitForCutline } from './helpers';

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
  await expect(page.getByTestId('imposition-sheet-count')).toHaveText('1');

  const layered = await downloadText(page, () => page.getByTestId('export-imposition-layers').click());
  for (const id of ['artwork', 'underprint', 'cut']) {
    expect(layered).toContain(`id="${id}"`);
  }
  expect(layered).toContain('data:image/png;base64,');
  expect(layered).toContain('width="297mm" height="210mm"');
});

test('拖曳拼版項目會依滑鼠位移量精準移動', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('source-upload').setInputFiles(pngFile('two.png', twoSquaresPng()));
  await waitForCutline(page, '1');
  await page.getByTestId('tab-underprint').click();
  await page.getByTestId('send-to-imposition-under').click();
  await expect(page.getByTestId('imposition-layer-count')).toHaveText('1');
  // 版面在 100% 縮放下比視窗還寬，置中的畫布會被視窗裁掉一截、點不到項目；
  // 先「符合視窗」縮放，跟 underprint-fit.spec.ts 是同一個道理。
  await page.getByTestId('imposition-fit').click();

  const item = page.getByTestId('imposition-item').first();
  await expect(item).toBeVisible();
  const before = await item.boundingBox();
  if (!before) throw new Error('imposition-item not visible');

  const startX = before.x + before.width / 2;
  const startY = before.y + before.height / 2;
  const dx = 40;
  const dy = 30;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + dx, startY + dy, { steps: 10 });
  await page.mouse.up();

  const after = await item.boundingBox();
  if (!after) throw new Error('imposition-item not visible after drag');

  // 斷言「最終位置 ≈ 初始位置 + 位移量」，而不只是「位置有改變」：
  // 後者連項目瞬間跳到畫面其他地方都會放過，抓不到任何錯誤的位移量。
  // 這條斷言守住的是拖曳有沒有真的接上、以及像素↔mm 的換算比例（k）對不對——
  // 比例錯了（實測把 k 換成 k*2）這條斷言會失敗。
  // 它守不住座標原點的常數偏移：原點偏移量在「放開時的 pointerMm − 按下時的 pointerMm」
  // 這個相減裡會抵消，因此不影響位移量的計算結果（實測把換算原點固定加 50px 偏移，
  // 這條斷言仍會通過）——這也代表這類常數偏移原本就不影響拖曳位移。
  const TOLERANCE_PX = 2;
  expect(Math.abs(after.x - (before.x + dx))).toBeLessThanOrEqual(TOLERANCE_PX);
  expect(Math.abs(after.y - (before.y + dy))).toBeLessThanOrEqual(TOLERANCE_PX);
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

const DEFAULT_SIZE_NAMES = ['A4', 'A3', 'SRA3', 'A3+', '菊八開', '菊四開', '菊對開'];
const COPIES = 5;

test('版面塞不下時自動開新版面，項目不重複也不遺漏', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('source-upload').setInputFiles(pngFile('two.png', twoSquaresPng()));
  await waitForCutline(page, '1');
  await page.getByTestId('tab-underprint').click();
  await page.getByTestId('send-to-imposition-under').click();
  await expect(page.getByTestId('imposition-layer-count')).toHaveText('1');

  // 加一個小到每張只放得下一個的尺寸；新增的那一列固定排在最後
  await page.getByTestId('tab-settings').click();
  await page.getByTestId('settings-add-sheet-size').click();
  const last = DEFAULT_SIZE_NAMES.length;
  await page.getByTestId(`sheet-size-name-${last}`).fill('測試小版');
  await page.getByTestId(`sheet-size-width-${last}`).fill('45');
  await page.getByTestId(`sheet-size-height-${last}`).fill('28');

  // 回拼版頁，只留小尺寸可用
  await page.getByTestId('tab-imposition').click();
  for (const name of DEFAULT_SIZE_NAMES) {
    await page.getByTestId(`sheet-size-${name}`).uncheck();
  }

  await page.getByTitle('設為 0 會刪除該圖層').fill(String(COPIES));
  await page.getByTestId('imposition-auto-layout').click();

  // 必須真的開出多張版面
  await expect(page.getByTestId('imposition-sheet-count')).not.toHaveText('1');
  await expect(page.getByTestId('sheet-tabs')).toBeVisible();

  // 逐頁加總畫布上的項目：重複排入會 > COPIES，遺漏會 < COPIES
  const sheetCount = Number(await page.getByTestId('imposition-sheet-count').textContent());
  let total = 0;
  for (let i = 1; i <= sheetCount; i += 1) {
    await page.getByTestId(`sheet-tab-${i}`).click();
    await expect(page.getByTestId(`sheet-tab-${i}`)).toHaveAttribute('aria-current', 'page');
    total += await page.getByTestId('imposition-item').count();
  }
  expect(total).toBe(COPIES);

  // 多版面匯出：每張版面各出一個 SVG 檔，檔名依序編號、彼此不重複
  const files = await downloadAll(page, () => page.getByTestId('export-imposition-layers').click(), sheetCount);
  expect(files).toHaveLength(sheetCount);
  const filenames = files.map(f => f.filename);
  expect(new Set(filenames).size).toBe(sheetCount);
  for (const name of filenames) {
    expect(name).toMatch(/^imposition-layers-\d+\.svg$/);
  }
});

test('多版面匯出 PDF 會觸發一次下載，且畫面外暫存區在匯出結束後移除', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('source-upload').setInputFiles(pngFile('two.png', twoSquaresPng()));
  await waitForCutline(page, '1');
  await page.getByTestId('tab-underprint').click();
  await page.getByTestId('send-to-imposition-under').click();
  await expect(page.getByTestId('imposition-layer-count')).toHaveText('1');

  // 沿用上一個測試的做法：加一個小尺寸讓一次排版產生多張版面，
  // 這樣才能驗證匯出是「每張版面各出一頁」而不是只出現在目前分頁的內容
  await page.getByTestId('tab-settings').click();
  await page.getByTestId('settings-add-sheet-size').click();
  const last = DEFAULT_SIZE_NAMES.length;
  await page.getByTestId(`sheet-size-name-${last}`).fill('測試小版PDF');
  await page.getByTestId(`sheet-size-width-${last}`).fill('45');
  await page.getByTestId(`sheet-size-height-${last}`).fill('28');

  await page.getByTestId('tab-imposition').click();
  for (const name of DEFAULT_SIZE_NAMES) {
    await page.getByTestId(`sheet-size-${name}`).uncheck();
  }
  await page.getByTitle('設為 0 會刪除該圖層').fill(String(COPIES));
  await page.getByTestId('imposition-auto-layout').click();
  await expect(page.getByTestId('imposition-sheet-count')).not.toHaveText('1');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-imposition-pdf').click(),
  ]);
  expect(download.suggestedFilename()).toBe('imposition-layout.pdf');

  // 匯出用的畫面外暫存區（每張版面掛一份 SheetBoard 去截圖）在 finally 清乾淨後
  // 應該完全從 DOM 移除，而不是留著、只是不可見——留著會讓下一次匯出疊加或量到舊尺寸
  await expect(page.getByTestId('pdf-export-stage')).toHaveCount(0);
});

test('連續快速點兩次「PDF 預覽」只會產生一次下載', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('source-upload').setInputFiles(pngFile('two.png', twoSquaresPng()));
  await waitForCutline(page, '1');
  await page.getByTestId('tab-underprint').click();
  await page.getByTestId('send-to-imposition-under').click();
  await expect(page.getByTestId('imposition-layer-count')).toHaveText('1');

  // 同樣先讓一次排版產生多張版面：版面數夠多、單張截圖要花一點時間，
  // 才有機會讓「連點兩下」的第二下真的落在第一次匯出還沒結束的時間窗內
  await page.getByTestId('tab-settings').click();
  await page.getByTestId('settings-add-sheet-size').click();
  const last = DEFAULT_SIZE_NAMES.length;
  await page.getByTestId(`sheet-size-name-${last}`).fill('測試小版連點');
  await page.getByTestId(`sheet-size-width-${last}`).fill('45');
  await page.getByTestId(`sheet-size-height-${last}`).fill('28');

  await page.getByTestId('tab-imposition').click();
  for (const name of DEFAULT_SIZE_NAMES) {
    await page.getByTestId(`sheet-size-${name}`).uncheck();
  }
  await page.getByTitle('設為 0 會刪除該圖層').fill(String(COPIES));
  await page.getByTestId('imposition-auto-layout').click();
  await expect(page.getByTestId('imposition-sheet-count')).not.toHaveText('1');

  const downloads: string[] = [];
  page.on('download', d => downloads.push(d.suggestedFilename()));

  // 刻意不用 locator.click() 連點兩次：第一次點擊之後按鈕要等 React 重新渲染、
  // 把 disabled 屬性真的套到 DOM 上才會擋下第二次點擊，這中間有一段時間差，
  // 用 Playwright 一次次呼叫 click()（每次都是一趟獨立的 CDP 往返）很容易被這段
  // 時間差蓋過去，測到的其實是「按鈕來得及先變成 disabled」，而不是重入防護本身。
  // 改成在瀏覽器同一個同步的執行context裡連續呼叫兩次原生 el.click()：兩次呼叫
  // 之間沒有任何事件迴圈或微任務的空隙，React 對第一次點擊觸發的 state 更新（含
  // disabled）根本來不及 commit，才能真正逼出「兩個 exportPDF 幾乎同時開始執行」
  // 這個情境，直接命中 ImpositionCanvas.tsx 裡 exportingRef 這個重入防護。
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="export-imposition-pdf"]') as HTMLButtonElement | null;
    el?.click();
    el?.click();
  });

  // 等匯出真的跑完（暫存區消失）再收斂下載事件
  await expect(page.getByTestId('pdf-export-stage')).toHaveCount(0, { timeout: 15_000 });
  expect(downloads).toEqual(['imposition-layout.pdf']);
});
