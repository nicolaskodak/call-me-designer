import { MSG_NO_OPAQUE, MSG_NOTHING_LEFT } from './messages';
import { fillHoles, inflate, prepareBase, removeSmallIslands } from './polygon';
import { tracePrecise } from './trace';
import type { AlphaImage, GeometryResult, UnderprintParamsPx } from './types';

export function buildUnderprint(img: AlphaImage, p: UnderprintParamsPx): GeometryResult {
  const base = prepareBase(tracePrecise(img, p.alphaThreshold), p.minIslandAreaPx2);
  if (base.length === 0) {
    return { polygons: [], warnings: [MSG_NO_OPAQUE], stats: { islandCount: 0 } };
  }

  // 內縮後細的部分可能分裂出小碎片，再去一次雜點
  const shrunk = removeSmallIslands(inflate(base, -p.insetPx), p.minIslandAreaPx2);
  const polygons = p.fillHoles ? fillHoles(shrunk) : shrunk;
  const warnings = polygons.length === 0 ? [MSG_NOTHING_LEFT] : [];
  return { polygons, warnings, stats: { islandCount: polygons.length } };
}
