import { expect, test } from '@playwright/test';
import { DEFAULT_SHEET_SIZES } from '../src/imposition/sheetSizes';
import { pngFile, twoSquaresPng } from './fixtures';
import { downloadAll, downloadText, waitForCutline } from './helpers';

/** 排版會替單一小件挑面積最小的版面；從清單推導，改尺寸清單時這些測試才不會跟著壞 */
const SMALLEST = [...DEFAULT_SHEET_SIZES].sort((a, b) => a.widthMm * a.heightMm - b.widthMm * b.heightMm)[0];

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

  // 分層 SVG：三層都有內容，一張版面各出一個檔（原圖／白墨／刀模各一）
  const layered = await downloadAll(page, () => page.getByTestId('export-imposition-layers').click(), 3);
  const byFilename = Object.fromEntries(layered.map(f => [f.filename, f.content]));
  expect(Object.keys(byFilename).sort()).toEqual([
    'imposition-artwork-1.svg',
    'imposition-cut-1.svg',
    'imposition-underprint-1.svg',
  ]);
  expect(byFilename['imposition-artwork-1.svg']).toContain('id="artwork"');
  expect(byFilename['imposition-artwork-1.svg']).toContain('data:image/png;base64,');
  expect(byFilename['imposition-underprint-1.svg']).toContain('id="underprint"');
  expect(byFilename['imposition-cut-1.svg']).toContain('id="cut"');
  for (const content of Object.values(byFilename)) {
    expect(content).toContain(`width="${SMALLEST.widthMm}mm" height="${SMALLEST.heightMm}mm"`);
  }
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

const DEFAULT_SIZE_NAMES = DEFAULT_SHEET_SIZES.map(s => s.name);
const COPIES = 5;

test('版面塞不下時自動開新版面，項目不重複也不遺漏', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('source-upload').setInputFiles(pngFile('two.png', twoSquaresPng()));
  await waitForCutline(page, '1');
  await page.getByTestId('tab-underprint').click();
  // 等白墨算完再送出，否則 getPathData() 可能撈到還沒算完的空陣列，
  // 讓這個圖層被判定成「沒有白墨」，跟後面斷言的三層（含白墨）檔案數對不上
  await expect(page.getByTestId('under-island-count')).toHaveText('2');
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

  // 多版面分層匯出：三層（原圖／白墨／刀模）都有內容，每層每張版面各出一檔，
  // 檔名依 kind 與版面序號組合、彼此不重複
  const KINDS = ['artwork', 'underprint', 'cut'] as const;
  const totalFiles = sheetCount * KINDS.length;
  const files = await downloadAll(page, () => page.getByTestId('export-imposition-layers').click(), totalFiles);
  expect(files).toHaveLength(totalFiles);
  const filenames = files.map(f => f.filename);
  expect(new Set(filenames).size).toBe(totalFiles);
  for (const name of filenames) {
    expect(name).toMatch(/^imposition-(artwork|underprint|cut)-\d+\.svg$/);
  }
  for (const kind of KINDS) {
    expect(filenames.filter(name => name.startsWith(`imposition-${kind}-`))).toHaveLength(sheetCount);
  }
});

test('多版面匯出 PDF 會依層各出一個檔，且畫面外暫存區在匯出結束後移除', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('source-upload').setInputFiles(pngFile('two.png', twoSquaresPng()));
  await waitForCutline(page, '1');
  await page.getByTestId('tab-underprint').click();
  // 等白墨算完再送出，否則這個圖層可能被判定成「沒有白墨」，跟後面斷言的三個 PDF 檔對不上
  await expect(page.getByTestId('under-island-count')).toHaveText('2');
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

  // 這個情境三層都有內容（原圖／白墨／刀模），一次匯出依序產生三個檔案，一層一檔
  const files = await downloadAll(page, () => page.getByTestId('export-imposition-pdf').click(), 3);
  expect(files.map(f => f.filename).sort()).toEqual([
    'imposition-artwork.pdf',
    'imposition-cut.pdf',
    'imposition-underprint.pdf',
  ]);

  // 匯出用的畫面外暫存區（每張版面掛一份 SheetBoard 去截圖）在 finally 清乾淨後
  // 應該完全從 DOM 移除，而不是留著、只是不可見——留著會讓下一次匯出疊加或量到舊尺寸
  await expect(page.getByTestId('pdf-export-stage')).toHaveCount(0);
});

test('連續快速點兩次「PDF 預覽」只會產生一次匯出（三個分層檔案，不會翻倍）', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('source-upload').setInputFiles(pngFile('two.png', twoSquaresPng()));
  await waitForCutline(page, '1');
  await page.getByTestId('tab-underprint').click();
  // 等白墨算完再送出，否則這個圖層可能被判定成「沒有白墨」，跟後面斷言的三個 PDF 檔對不上
  await expect(page.getByTestId('under-island-count')).toHaveText('2');
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

  // 在整個匯出還在跑（畫面外暫存區還沒消失）的期間持續輪詢：只要抓到一次
  // 「暫存區還在、按鈕卻不是 disabled」，就代表被重入防護擋下的那次呼叫
  // 提早把 isPdfExporting 清成 false，讓使用者在匯出途中就能再按一次
  // ——即使輸出本身沒有錯，這也是對使用者宣稱了一件還沒發生的事。
  // 兩個值一定要在同一次 page.evaluate() 裡一起讀出來：分成兩次個別的
  // page.getByTestId(...).count() / .isDisabled() 呼叫會各自是一趟獨立的
  // CDP 往返，兩者之間應用程式可能剛好完成一次 React 重新渲染，讀到的會是
  // 「暫存區」與「按鈕狀態」分屬兩個不同時間點的 DOM 快照，測出不存在的假警報。
  // 迴圈本身不加任何人工等待，純粹以「每次往返查詢」的自然節奏取樣，
  // 不為了讓斷言好過而延長或縮短任何等待時間；整體受 Playwright 的測試逾時保護。
  let buttonWasEnabledWhileStageExists = false;
  // 迴圈至少要真的觀測到一次「暫存區存在」，否則上面那條斷言在什麼都沒看到的情況下
  // 也會通過——換一台更快的機器、或把 fixture 縮小到暫存區一瞬間就消失，這條測試會
  // 安靜退化成 no-op，卻還是顯示綠燈。
  let sawStagePresent = false;
  for (;;) {
    const { stagePresent, disabled } = await page.evaluate(() => {
      const stage = document.querySelector('[data-testid="pdf-export-stage"]');
      const btn = document.querySelector('[data-testid="export-imposition-pdf"]') as HTMLButtonElement | null;
      return { stagePresent: stage !== null, disabled: btn ? btn.disabled : true };
    });
    if (!stagePresent) break;
    sawStagePresent = true;
    if (!disabled) {
      buttonWasEnabledWhileStageExists = true;
      break;
    }
  }
  expect(sawStagePresent).toBe(true);
  expect(buttonWasEnabledWhileStageExists).toBe(false);

  // 等匯出真的跑完（暫存區消失）再收斂下載事件；三層各一檔，不會因為連點兩次而翻倍成六個
  await expect(page.getByTestId('pdf-export-stage')).toHaveCount(0, { timeout: 15_000 });
  expect(downloads.sort()).toEqual(['imposition-artwork.pdf', 'imposition-cut.pdf', 'imposition-underprint.pdf']);
});

test('匯出 PDF 途中切換分頁，匯出仍會完成', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('source-upload').setInputFiles(pngFile('two.png', twoSquaresPng()));
  await waitForCutline(page, '1');
  await page.getByTestId('tab-underprint').click();
  // 等白墨算完再送出，否則這個圖層可能被判定成「沒有白墨」，跟後面斷言的三個 PDF 檔對不上
  await expect(page.getByTestId('under-island-count')).toHaveText('2');
  await page.getByTestId('send-to-imposition-under').click();
  await expect(page.getByTestId('imposition-layer-count')).toHaveText('1');

  // 同樣先讓一次排版產生多張版面：版面數夠多才有機會讓切換分頁真的落在
  // 匯出還沒結束的時間窗內
  await page.getByTestId('tab-settings').click();
  await page.getByTestId('settings-add-sheet-size').click();
  const last = DEFAULT_SIZE_NAMES.length;
  await page.getByTestId(`sheet-size-name-${last}`).fill('測試小版切分頁');
  await page.getByTestId(`sheet-size-width-${last}`).fill('45');
  await page.getByTestId(`sheet-size-height-${last}`).fill('28');

  await page.getByTestId('tab-imposition').click();
  for (const name of DEFAULT_SIZE_NAMES) {
    await page.getByTestId(`sheet-size-${name}`).uncheck();
  }
  await page.getByTitle('設為 0 會刪除該圖層').fill(String(COPIES));
  await page.getByTestId('imposition-auto-layout').click();
  await expect(page.getByTestId('imposition-sheet-count')).not.toHaveText('1');

  // 三個分頁都是用 `hidden` 隱藏、不是卸載，畫面外暫存區若沒有脫離那個祖先，
  // 匯出途中切走分頁會讓暫存區整棵 display:none、offsetWidth 變 0，
  // 觸發 captureSheet 的防護把整次匯出判定失敗，已截好的頁全部作廢。
  // 這裡刻意在按下匯出後立刻切分頁，逼出匯出還在跑的那個時間窗。
  const files = await downloadAll(page, async () => {
    await page.getByTestId('export-imposition-pdf').click();
    await page.getByTestId('tab-editor').click();
  }, 3);
  expect(files.map(f => f.filename).sort()).toEqual([
    'imposition-artwork.pdf',
    'imposition-cut.pdf',
    'imposition-underprint.pdf',
  ]);

  // 切走分頁之後，拼版分頁的容器（含未脫離出去的東西）會是 display:none，
  // 但暫存區已經 portal 到 document.body，匯出結束後仍然要正常清掉
  await expect(page.getByTestId('pdf-export-stage')).toHaveCount(0, { timeout: 15_000 });
});
