// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_CUTLINE_PARAMS } from '../../geometry/params';
import type { GeometryState } from '../../hooks/useGeometry';
import { DEFAULT_CUT_STYLE } from '../../types';
import { CutlinePanel, type CutlinePanelProps } from './CutlinePanel';

afterEach(cleanup);

const readyGeometry: GeometryState = { status: 'ready', result: null, error: null };

const baseProps: CutlinePanelProps = {
  params: DEFAULT_CUTLINE_PARAMS,
  onParamsChange: () => {},
  geometry: readyGeometry,
  dpi: 300,
  hasSource: true,
  canUndo: false,
  canRedo: false,
  onUndo: () => {},
  onRedo: () => {},
  segmentCount: 0,
  style: DEFAULT_CUT_STYLE,
  onStyleChange: () => {},
  onExportAligned: () => {},
  onExportTrimmed: () => {},
  onExportPdf: () => {},
  onSendToImposition: () => {},
  underprintEnabled: false,
  underprintPending: false,
  cutPending: false,
  // 預設代表「刀模已就緒，且編輯器已消化過這份結果」，其餘測試才是在測它們各自關心的條件
  cutPathsApplied: true,
};

const sendButton = () => screen.getByTestId('send-to-imposition-cut') as HTMLButtonElement;

describe('CutlinePanel「送到 Imposition」：白墨已啟用但幾何未就緒時停用，未啟用白墨則不受影響', () => {
  it('白墨未啟用時，即使白墨幾何處於 pending 也不受影響——使用者根本不要白墨，不該被誤擋', () => {
    render(<CutlinePanel {...baseProps} underprintEnabled={false} underprintPending={true} />);
    expect(sendButton().disabled).toBe(false);
  });

  it('白墨已啟用、幾何還在算（pending）時停用', () => {
    render(<CutlinePanel {...baseProps} underprintEnabled underprintPending />);
    expect(sendButton().disabled).toBe(true);
  });

  it('白墨已啟用、幾何算完（不 pending）時啟用', () => {
    render(<CutlinePanel {...baseProps} underprintEnabled underprintPending={false} />);
    expect(sendButton().disabled).toBe(false);
  });

  it('沒有來源圖片時仍然停用（既有行為不變，不受白墨狀態影響）', () => {
    render(<CutlinePanel {...baseProps} hasSource={false} underprintEnabled={false} underprintPending={false} />);
    expect(sendButton().disabled).toBe(true);
  });
});

describe('CutlinePanel「送到 Imposition」：刀模幾何未就緒時停用', () => {
  it('刀模還在算時停用——否則圖層會被定型成「沒有刀模」，匯出安靜少一層', () => {
    render(<CutlinePanel {...baseProps} cutPending />);
    expect(sendButton().disabled).toBe(true);
  });

  it('刀模還在算時說明原因', () => {
    render(<CutlinePanel {...baseProps} cutPending />);
    expect(screen.getByTestId('cut-pending-hint').textContent).toContain('刀模計算中');
  });

  it('刀模算完後啟用', () => {
    render(<CutlinePanel {...baseProps} cutPending={false} />);
    expect(sendButton().disabled).toBe(false);
  });

  it('刀模與白墨同時未就緒時，優先說明刀模', () => {
    render(<CutlinePanel {...baseProps} cutPending underprintEnabled underprintPending />);
    expect(screen.queryByTestId('underprint-pending-hint')).toBeNull();
    expect(screen.getByTestId('cut-pending-hint')).not.toBeNull();
  });

  // 幾何回報 ready 之後，編輯器還要再一步才把結果吃進去，中間 getPathData() 仍是空的
  it('幾何已就緒但編輯器還沒消化這份結果時停用，且不謊稱「計算中」', () => {
    render(<CutlinePanel {...baseProps} cutPending={false} cutPathsApplied={false} />);
    expect(sendButton().disabled).toBe(true);
    expect(screen.queryByTestId('cut-pending-hint')).toBeNull();
    expect(screen.getByTestId('cut-applying-hint').textContent).toContain('套用中');
  });

  it('編輯器已消化結果時啟用，沒有任何停用說明', () => {
    render(<CutlinePanel {...baseProps} cutPending={false} cutPathsApplied />);
    expect(sendButton().disabled).toBe(false);
    expect(screen.queryByTestId('cut-applying-hint')).toBeNull();
    expect(screen.queryByTestId('cut-pending-hint')).toBeNull();
  });

  // 這個工具不限定產品類型，沒有刀模的來源也要送得出去；
  // 「有沒有刀模」由 Imposition 的圖層列如實標示，不是靠擋在這裡
  it('沒有刀模也要能送出——只要編輯器已消化過結果', () => {
    render(<CutlinePanel {...baseProps} cutPending={false} cutPathsApplied />);
    expect(sendButton().disabled).toBe(false);
  });
});
