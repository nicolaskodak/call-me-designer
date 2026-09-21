// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_UNDERPRINT_PARAMS } from '../../geometry/params';
import type { GeometryState } from '../../hooks/useGeometry';
import { DEFAULT_UNDERPRINT_STYLE } from '../../types';
import { UnderprintPanel, type UnderprintPanelProps } from './UnderprintPanel';

afterEach(cleanup);

const baseProps: UnderprintPanelProps = {
  params: DEFAULT_UNDERPRINT_PARAMS,
  onParamsChange: () => {},
  geometry: { status: 'ready', result: null, error: null },
  dpi: 300,
  hasSource: true,
  canUndo: false,
  canRedo: false,
  onUndo: () => {},
  onRedo: () => {},
  segmentCount: 0,
  style: DEFAULT_UNDERPRINT_STYLE,
  onStyleChange: () => {},
  showCutReference: true,
  onShowCutReferenceChange: () => {},
  onExport: () => {},
  onSendToImposition: () => {},
  cutPending: false,
  cutPathsApplied: true,
};

function renderPanel(geometry: GeometryState) {
  return render(<UnderprintPanel {...baseProps} geometry={geometry} />);
}

const sendButton = () => screen.getByTestId('send-to-imposition-under') as HTMLButtonElement;

describe('UnderprintPanel「送到 Imposition」：白墨幾何算完前停用，避免定型成沒有白墨', () => {
  it('geometry 還在算（processing）時停用', () => {
    renderPanel({ status: 'processing', result: null, error: null });
    expect(sendButton().disabled).toBe(true);
  });

  it('剛切換過來、debounce 還沒觸發（idle）時也停用', () => {
    renderPanel({ status: 'idle', result: null, error: null });
    expect(sendButton().disabled).toBe(true);
  });

  it('geometry 算完（ready）時啟用', () => {
    renderPanel({ status: 'ready', result: null, error: null });
    expect(sendButton().disabled).toBe(false);
  });

  it('geometry 算失敗（error）時不永久卡住，仍然啟用', () => {
    renderPanel({ status: 'error', result: null, error: '失敗' });
    expect(sendButton().disabled).toBe(false);
  });

  it('沒有來源圖片時仍然停用（既有行為不變）', () => {
    render(<UnderprintPanel {...baseProps} hasSource={false} geometry={{ status: 'ready', result: null, error: null }} />);
    expect(sendButton().disabled).toBe(true);
  });

  // 這顆按鈕在白墨分頁，但 sendToImposition 同時會抓刀模資料
  it('白墨算完、但刀模還在算時也要停用', () => {
    render(<UnderprintPanel {...baseProps} cutPending geometry={{ status: 'ready', result: null, error: null }} />);
    expect(sendButton().disabled).toBe(true);
    expect(screen.getByTestId('cut-pending-hint').textContent).toContain('刀模計算中');
  });

  it('白墨算完、刀模也就緒，但編輯器還沒消化刀模結果時也要停用', () => {
    render(<UnderprintPanel {...baseProps} cutPathsApplied={false} geometry={{ status: 'ready', result: null, error: null }} />);
    expect(sendButton().disabled).toBe(true);
    expect(screen.getByTestId('cut-applying-hint').textContent).toContain('套用中');
  });
});
