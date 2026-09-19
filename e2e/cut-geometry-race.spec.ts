import { expect, test } from '@playwright/test';
import { pngFile, twoSquaresPng } from './fixtures';

interface Sample {
  t: number;
  disabled: boolean;
  nodes: string | null;
}

/**
 * 「送到 Imposition」在刀模算完前必須停用。
 *
 * 這個測試不去賭能不能剛好在競態窗口內按到——那種測試會偶爾漏抓。改成從上傳前就逐 frame
 * 取樣，最後斷言「按鈕可按、但刀模節點數還是 0」這種取樣點一次都沒出現過。
 *
 * CPU 節流 20 倍是為了把窗口撐開：修正前在這個設定下，一張極小的測試圖也有約 1.4 秒的
 * 窗口（9 個取樣點）。沒有節流的話，窗口可能短到取樣不到，測試就失去鑑別力。
 */
test('刀模還沒算完時，「送到 Imposition」必須是停用的', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 20 });
  await page.goto('./');

  await page.evaluate(() => {
    const w = window as unknown as { __samples: Sample[] };
    w.__samples = [];
    const t0 = performance.now();
    const tick = () => {
      const btn = document.querySelector('[data-testid="send-to-imposition-cut"]') as HTMLButtonElement | null;
      const nodes = document.querySelector('[data-testid="cut-node-count"]');
      if (btn) {
        w.__samples.push({ t: Math.round(performance.now() - t0), disabled: btn.disabled, nodes: nodes?.textContent ?? null });
      }
      if (w.__samples.length < 1200) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  await page.getByTestId('source-upload').setInputFiles(pngFile('two.png', twoSquaresPng()));
  await expect(page.getByTestId('cut-node-count')).not.toHaveText('0', { timeout: 60_000 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  const samples: Sample[] = await page.evaluate(() => (window as unknown as { __samples: Sample[] }).__samples);
  // 取樣本身要有效：沒取到樣的話，「沒有危險取樣點」是空話
  expect(samples.length).toBeGreaterThan(5);
  const risky = samples.filter(s => !s.disabled && (s.nodes === '0' || s.nodes === null));
  expect(risky, `出現 ${risky.length} 個「按鈕可按但刀模未就緒」的取樣點：${JSON.stringify(risky.slice(0, 3))}`).toEqual([]);

  // 算完之後要真的解鎖，否則上面的斷言用「永遠停用」也能通過
  await expect(page.getByTestId('send-to-imposition-cut')).toBeEnabled();
});
