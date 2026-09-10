import { closeAndFill, findBridgeRadius } from './autoBridge';
import { disconnectedMessage, MSG_NO_OPAQUE } from './messages';
import { inflate, prepareBase } from './polygon';
import { traceLegacy, tracePrecise } from './trace';
import type { AlphaImage, CutlineParamsPx, GeometryResult, Ring } from './types';

const traceFor = (img: AlphaImage, p: CutlineParamsPx): Ring[] =>
  p.mode === 'precise'
    ? tracePrecise(img, p.alphaThreshold)
    : traceLegacy(img, p.legacyBlurPx, p.legacyThreshold);

export function buildCutline(img: AlphaImage, p: CutlineParamsPx): GeometryResult {
  const base = prepareBase(traceFor(img, p), p.minIslandAreaPx2);
  if (base.length === 0) {
    return { polygons: [], warnings: [MSG_NO_OPAQUE], stats: { islandCount: 0 } };
  }

  // 舊模式的外擴距離由模糊決定
  const offsetPx = p.mode === 'precise' ? p.offsetPx : 0;

  if (!p.singleConnected) {
    const polygons = inflate(base, offsetPx);
    return { polygons, warnings: [], stats: { islandCount: polygons.length } };
  }

  const radiusPx =
    p.bridgeMode === 'auto'
      ? findBridgeRadius(base, offsetPx, p.bridgeMaxPx, p.bridgePrecisionPx)
      : p.bridgeRadiusPx;
  const polygons = closeAndFill(base, offsetPx, radiusPx);
  const warnings = polygons.length > 1 ? [disconnectedMessage(polygons.length)] : [];
  return { polygons, warnings, stats: { islandCount: polygons.length, bridgeRadiusPx: radiusPx } };
}
