// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { pdfLayerColors } from '../imposition/pdfLayerColors';
import type { ImpositionLayer, ImpositionShow } from '../imposition/types';
import { ItemContent } from './ImpositionCanvas';

afterEach(cleanup);

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

  it('PDF 白墨那一輪（經過 pdfLayerColors 覆寫）是完全不透明的純黑，實墨而非網點', () => {
    const stageColors = pdfLayerColors('underprint', baseColors);
    const { container } = render(<ItemContent layer={layer} show={show} colors={stageColors} />);
    const path = container.querySelector('path');
    expect(path?.getAttribute('fill-opacity')).toBe('1');
    expect(path?.getAttribute('fill')).toBe('#000000');
  });
});
