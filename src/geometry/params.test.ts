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
    const result = cutlineParamsToPx(DEFAULT_CUTLINE_PARAMS, 25.4);
    expect(result.mode).toBe('precise');
    expect(result.alphaThreshold).toBe(16);
    expect(result.offsetPx).toBeCloseTo(2, 9);
    expect(result.legacyBlurPx).toBe(15);
    expect(result.legacyThreshold).toBe(10);
    expect(result.minIslandAreaPx2).toBeCloseTo(0.5, 9);
    expect(result.singleConnected).toBe(true);
    expect(result.bridgeMode).toBe('auto');
    expect(result.bridgeRadiusPx).toBeCloseTo(3, 9);
    expect(result.bridgeMaxPx).toBeCloseTo(10, 9);
    expect(result.bridgePrecisionPx).toBeCloseTo(0.1, 9);
  });

  it('scales with dpi', () => {
    expect(cutlineParamsToPx(DEFAULT_CUTLINE_PARAMS, 300).offsetPx).toBeCloseTo(23.622, 3);
  });

  it('converts underprint mm params to px', () => {
    const result = underprintParamsToPx(DEFAULT_UNDERPRINT_PARAMS, 25.4);
    expect(result.alphaThreshold).toBe(128);
    expect(result.insetPx).toBeCloseTo(0.2, 9);
    expect(result.minIslandAreaPx2).toBeCloseTo(0.2, 9);
    expect(result.fillHoles).toBe(false);
  });
});
