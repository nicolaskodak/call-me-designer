import { describe, expect, it } from 'vitest';
import { DEFAULT_UNDERPRINT_OPACITY, pdfLayerColors, UNDERPRINT_PDF_COLOR } from './pdfLayerColors';

const colors = { cut: '#FF0000', underprint: '#FFFFFF' };

describe('pdfLayerColors', () => {
  it('白墨那一輪：顏色覆寫成純黑、不透明度覆寫成 1（實墨，不是畫面用的網點）', () => {
    expect(pdfLayerColors('underprint', colors)).toEqual({
      cut: '#FF0000',
      underprint: UNDERPRINT_PDF_COLOR,
      underprintOpacity: 1,
    });
  });

  it('不透明度是完全不透明的 1，不是畫面即時畫布用的 0.8', () => {
    expect(pdfLayerColors('underprint', colors).underprintOpacity).toBe(1);
    expect(pdfLayerColors('underprint', colors).underprintOpacity).not.toBe(DEFAULT_UNDERPRINT_OPACITY);
  });

  it('原圖那一輪：顏色原樣傳回，不覆寫不透明度', () => {
    expect(pdfLayerColors('artwork', colors)).toEqual(colors);
    expect(pdfLayerColors('artwork', colors).underprintOpacity).toBeUndefined();
  });

  it('刀模那一輪：顏色原樣傳回，不覆寫不透明度', () => {
    expect(pdfLayerColors('cut', colors)).toEqual(colors);
    expect(pdfLayerColors('cut', colors).underprintOpacity).toBeUndefined();
  });

  it('不會動到傳入的原始 colors 物件（不可變）', () => {
    const original = { cut: '#FF0000', underprint: '#FFFFFF' };
    pdfLayerColors('underprint', original);
    expect(original).toEqual({ cut: '#FF0000', underprint: '#FFFFFF' });
  });
});
