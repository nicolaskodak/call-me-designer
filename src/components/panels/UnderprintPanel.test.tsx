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
});
