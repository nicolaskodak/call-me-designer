import { fillHoles, inflate } from './polygon';
import type { Polygon } from './types';

const MIN_PRECISION_PX = 0.01;

/** 外擴 offset 後做半徑 R 的 closing，再補洞 */
export function closeAndFill(base: readonly Polygon[], offsetPx: number, radiusPx: number): Polygon[] {
  const grown = inflate(base, offsetPx + radiusPx);
  const closed = radiusPx > 0 ? inflate(grown, -radiusPx) : grown;
  return fillHoles(closed);
}

/**
 * R 越大 closing 結果越大、區塊數不會增加，所以可以二分搜尋。
 * 回傳能連成一塊的最小 R（區間上界，保證連通）；上限仍不連通時回傳上限。
 */
export function findBridgeRadius(
  base: readonly Polygon[],
  offsetPx: number,
  maxPx: number,
  precisionPx: number,
): number {
  const connected = (r: number) => closeAndFill(base, offsetPx, r).length <= 1;
  if (connected(0)) return 0;
  if (!connected(maxPx)) return maxPx;

  const step = Math.max(precisionPx, MIN_PRECISION_PX);
  let lo = 0;
  let hi = maxPx;
  while (hi - lo > step) {
    const mid = (lo + hi) / 2;
    if (connected(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}
