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
  // 預設代表「刀模已就緒且編輯器確實有路徑」，其餘測試才是在測它們各自關心的那一個條件
  cutPathCount: 1,
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

  // 幾何回報 ready 之後，編輯器還要再一步才拿到路徑；那段空窗與「這張圖真的沒有刀模」
  // 在按鈕層面無法區分，兩者都擋，但說法要正確——不能顯示「計算中」卻永遠算不完
  it('幾何已就緒但編輯器還沒有路徑時停用，且不謊稱「計算中」', () => {
    render(<CutlinePanel {...baseProps} cutPending={false} cutPathCount={0} />);
    expect(sendButton().disabled).toBe(true);
    expect(screen.queryByTestId('cut-pending-hint')).toBeNull();
    expect(screen.getByTestId('cut-empty-hint').textContent).toContain('沒有刀模路徑');
  });

  it('刀模就緒且有路徑時啟用，沒有任何停用說明', () => {
    render(<CutlinePanel {...baseProps} cutPending={false} cutPathCount={3} />);
    expect(sendButton().disabled).toBe(false);
    expect(screen.queryByTestId('cut-empty-hint')).toBeNull();
    expect(screen.queryByTestId('cut-pending-hint')).toBeNull();
  });
});
