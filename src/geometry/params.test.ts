import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CUTLINE_PARAMS,
  DEFAULT_UNDERPRINT_PARAMS,
  cutlineParamsToPx,
  underprintParamsToPx,
} from './params';

describe('params', () => {
  it('has the defaults from the spec', () => {
    expect(DEFAULT_CUTLINE_PARAMS).toEqual({
      mode: 'precise',
      alphaThreshold: 16,
      offsetMm: 2,
      legacyBlurPx: 15,
      legacyThreshold: 10,
      minIslandAreaMm2: 0.5,
      singleConnected: true,
      bridgeMode: 'auto',
      bridgeRadiusMm: 3,
      bridgeMaxMm: 10,
      smoothness: 2,
    });
    expect(DEFAULT_UNDERPRINT_PARAMS).toEqual({
      alphaThreshold: 128,
      insetMm: 0.2,
      minIslandAreaMm2: 0.2,
      fillHoles: false,
      smoothness: 1,
    });
  });

  it('converts cutline mm params to px (1 mm = 1 px at 25.4 dpi)', () => {
    expect(cutlineParamsToPx(DEFAULT_CUTLINE_PARAMS, 25.4)).toEqual({
      mode: 'precise',
      alphaThreshold: 16,
      offsetPx: expect.closeTo(2, 9),
      legacyBlurPx: 15,
      legacyThreshold: 10,
      minIslandAreaPx2: 0.5,
      singleConnected: true,
      bridgeMode: 'auto',
      bridgeRadiusPx: 3,
      bridgeMaxPx: 10,
      bridgePrecisionPx: expect.closeTo(0.1, 9),
    });
  });

  it('scales with dpi', () => {
    expect(cutlineParamsToPx(DEFAULT_CUTLINE_PARAMS, 300).offsetPx).toBeCloseTo(23.622, 3);
  });

  it('converts underprint mm params to px', () => {
    expect(underprintParamsToPx(DEFAULT_UNDERPRINT_PARAMS, 25.4)).toEqual({
      alphaThreshold: 128,
      insetPx: expect.closeTo(0.2, 9),
      minIslandAreaPx2: expect.closeTo(0.2, 9),
      fillHoles: false,
    });
  });
});
