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
