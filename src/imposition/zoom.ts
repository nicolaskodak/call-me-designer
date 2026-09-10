import { CSS_PX_PER_MM } from '../units';

const MIN_FIT_ZOOM = 0.1;
const MAX_FIT_ZOOM = 4;

/** 讓整個版面（mm）扣掉四周 padding 後剛好放進視窗（CSS px）的縮放；輸入不合理時回傳 1 */
export function computeFitZoom(
  viewportWidthPx: number,
  viewportHeightPx: number,
  boundaryWidthMm: number,
  boundaryHeightMm: number,
  paddingPx: number,
): number {
  const inputs = [viewportWidthPx, viewportHeightPx, boundaryWidthMm, boundaryHeightMm, paddingPx];
  if (inputs.some(v => !Number.isFinite(v) || v <= 0)) return 1;
  const fit = Math.min(
    (viewportWidthPx - 2 * paddingPx) / (boundaryWidthMm * CSS_PX_PER_MM),
    (viewportHeightPx - 2 * paddingPx) / (boundaryHeightMm * CSS_PX_PER_MM),
  );
  return Math.min(MAX_FIT_ZOOM, Math.max(MIN_FIT_ZOOM, fit));
}
