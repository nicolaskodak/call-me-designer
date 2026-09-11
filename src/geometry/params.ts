import { mm2ToPx2, mmToPx } from '../units';
import type { CutlineParams, CutlineParamsPx, UnderprintParams, UnderprintParamsPx } from './types';

export const BRIDGE_PRECISION_MM = 0.1;

export const DEFAULT_CUTLINE_PARAMS: CutlineParams = {
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
};

export const DEFAULT_UNDERPRINT_PARAMS: UnderprintParams = {
  alphaThreshold: 128,
  insetMm: 0.2,
  minIslandAreaMm2: 0.2,
  fillHoles: false,
  smoothness: 1,
};

export function cutlineParamsToPx(p: CutlineParams, dpi: number): CutlineParamsPx {
  return {
    mode: p.mode,
    alphaThreshold: p.alphaThreshold,
    offsetPx: mmToPx(p.offsetMm, dpi),
    legacyBlurPx: p.legacyBlurPx,
    legacyThreshold: p.legacyThreshold,
    minIslandAreaPx2: mm2ToPx2(p.minIslandAreaMm2, dpi),
    singleConnected: p.singleConnected,
    bridgeMode: p.bridgeMode,
    bridgeRadiusPx: mmToPx(p.bridgeRadiusMm, dpi),
    bridgeMaxPx: mmToPx(p.bridgeMaxMm, dpi),
    bridgePrecisionPx: mmToPx(BRIDGE_PRECISION_MM, dpi),
  };
}

export function underprintParamsToPx(p: UnderprintParams, dpi: number): UnderprintParamsPx {
  return {
    alphaThreshold: p.alphaThreshold,
    insetPx: mmToPx(p.insetMm, dpi),
    minIslandAreaPx2: mm2ToPx2(p.minIslandAreaMm2, dpi),
    fillHoles: p.fillHoles,
  };
}
