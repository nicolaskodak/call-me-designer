// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pdfLayerColors } from '../imposition/pdfLayerColors';
import type { ImpositionLayer, ImpositionShow } from '../imposition/types';
import { captureSheet, ItemContent } from './ImpositionCanvas';

afterEach(cleanup);

// html2canvas 「拍照」的瞬間記錄下 el 當時的邊框寬度／圓角，藉此驗證截圖期間
// 確實已經中性化。用 vi.hoisted 存放可變狀態，避免 vi.mock 工廠因為引用
// 「非 mock 開頭」的外部變數而在轉譯階段被擋下。
const captured = vi.hoisted(() => ({ borderWidth: '', borderRadius: '' }));

vi.mock('html2canvas', () => ({
  default: vi.fn(async (el: HTMLElement) => {
    captured.borderWidth = el.style.borderWidth;
    captured.borderRadius = el.style.borderRadius;
    return { toDataURL: () => 'data:image/png;base64,FAKE' };
  }),
}));

const layer: ImpositionLayer = {
  id: 'L1',
  sourceId: null,
  name: 'cat',
  imageBlob: new Blob(),
  imageUrl: 'blob:cat',
  widthPx: 100,
  heightPx: 50,
  dpi: 25.4,
  cut: { kind: 'paths', paths: [] },
  underprint: [{ d: 'M0 0Z' }],
  layoutBoxPx: { x: 0, y: 0, width: 100, height: 50 },
  totalCount: 1,
};

const show: ImpositionShow = { artwork: false, underprint: true, cut: false };
const baseColors = { cut: '#FF0000', underprint: '#FFFFFF' };

describe('ItemContent 白墨路徑的不透明度', () => {
  it('畫面即時畫布（沒有 underprintOpacity 覆寫）維持 0.8，行為不變', () => {
    const { container } = render(<ItemContent layer={layer} show={show} colors={baseColors} />);
    const path = container.querySelector('path');
    expect(path?.getAttribute('fill-opacity')).toBe('0.8');
    expect(path?.getAttribute('fill')).toBe('#FFFFFF');
  });

  it('PDF 白墨那一輪（經過 pdfLayerColors 覆寫）維持設定色（真白），但是完全不透明的實墨，不是網點', () => {
    const stageColors = pdfLayerColors('underprint', baseColors);
    const { container } = render(<ItemContent layer={layer} show={show} colors={stageColors} />);
    const path = container.querySelector('path');
    expect(path?.getAttribute('fill-opacity')).toBe('1');
    expect(path?.getAttribute('fill')).toBe('#FFFFFF');
  });
});

describe('captureSheet 截圖期間中性化版面框的虛線邊框與圓角', () => {
  it('截圖當下邊框寬度與圓角已經歸零，截完後還原成畫面用的原值', async () => {
    const el = document.createElement('div');
    Object.defineProperty(el, 'offsetWidth', { value: 1000, configurable: true });
    Object.defineProperty(el, 'offsetHeight', { value: 700, configurable: true });
    el.style.borderStyle = 'dashed';
    el.style.borderColor = 'rgb(64, 64, 64)';
    el.style.borderWidth = '2px';
    el.style.borderRadius = '8px';

    await captureSheet(el, 297);

    // html2canvas 拍照當下：邊框寬度歸零（不畫出虛線、box-sizing: border-box
    // 造成的內容內縮也一併消失），圓角也歸零，避免切掉滿版項目
    expect(captured.borderWidth).toBe('0px');
    expect(captured.borderRadius).toBe('0px');

    // 截完之後要還原成畫面用的原值，即時畫布上的虛線外框與圓角不受影響
    expect(el.style.borderWidth).toBe('2px');
    expect(el.style.borderRadius).toBe('8px');
  });
});
