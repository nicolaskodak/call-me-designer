// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { SheetSize } from '../../imposition/sheetSizes';
import { DEFAULT_IMPOSITION_STATE, type ImpositionLayer, type ImpositionState } from '../../imposition/types';
import { ImpositionPanel } from './ImpositionPanel';

afterEach(cleanup);

const SHEET = { id: 's1', sizeName: 'S', widthMm: 300, heightMm: 400 };
const SIZES: SheetSize[] = [{ name: 'S', widthMm: 300, heightMm: 400 }];

// dpi 25.4：1 px = 1 mm
const layer = (overrides: Partial<ImpositionLayer> = {}): ImpositionLayer => ({
  id: 'L1', sourceId: null, name: 'cat', imageBlob: new Blob(), imageUrl: 'blob:cat',
  widthPx: 100, heightPx: 50, dpi: 25.4,
  cut: { kind: 'paths', paths: [{ d: 'M0 0Z' }] },
  underprint: [{ d: 'M1 1Z', fillRule: 'evenodd' }],
  layoutBoxPx: { x: 0, y: 0, width: 100, height: 50 },
  totalCount: 1,
  ...overrides,
});

/** 已排好圖、可以匯出的狀態 */
const laidOut = (l: ImpositionLayer): ImpositionState => ({
  ...DEFAULT_IMPOSITION_STATE,
  layers: [l],
  sheets: [SHEET],
  instances: [{ id: 'i1', layerId: l.id, sheetId: SHEET.id, xMm: 0, yMm: 0, rotationDeg: 0 }],
  layoutStale: false,
});

const renderPanel = (state: ImpositionState) =>
  render(
    <ImpositionPanel
      state={state}
      update={() => {}}
      sheetSizes={SIZES}
      onUpload={() => {}}
      onSetLayerTotalCount={() => {}}
      onAutoLayout={() => {}}
      onFitZoom={() => {}}
      onExportLayers={() => {}}
      onExportCut={() => {}}
      onExportUnderprint={() => {}}
      onExportPdf={() => {}}
      isPdfExporting={false}
      isSvgExporting={false}
    />,
  );

const button = (testId: string) => screen.getByTestId(testId) as HTMLButtonElement;

describe('ImpositionPanel：匯出按鈕的內容判準', () => {
  it('有刀模時「只有刀模 SVG」可按', () => {
    renderPanel(laidOut(layer()));
    expect(button('export-imposition-cut').disabled).toBe(false);
  });

  it('刀模是空陣列時「只有刀模 SVG」停用——否則按下去會拿到一疊空群組的檔案', () => {
    renderPanel(laidOut(layer({ cut: { kind: 'paths', paths: [] } })));
    expect(button('export-imposition-cut').disabled).toBe(true);
  });

  it('白墨是空陣列時「只有白墨 SVG」停用——舊判準 layers.some(l => l.underprint) 會誤放行', () => {
    renderPanel(laidOut(layer({ underprint: [] })));
    expect(button('export-imposition-underprint').disabled).toBe(true);
  });
});

describe('ImpositionPanel：圖層列的標示要反映實際內容', () => {
  it('刀模＋白墨', () => {
    renderPanel(laidOut(layer()));
    expect(screen.getByTestId('layer-marks').textContent).toBe('刀模＋白墨');
  });

  it('只有刀模', () => {
    renderPanel(laidOut(layer({ underprint: null })));
    expect(screen.getByTestId('layer-marks').textContent).toBe('刀模');
  });

  it('刀模是空的就不要寫「刀模」——使用者會以為手上有刀模檔', () => {
    renderPanel(laidOut(layer({ cut: { kind: 'paths', paths: [] }, underprint: null })));
    expect(screen.getByTestId('layer-marks').textContent).toBe('沒有刀模與白墨');
  });
});
