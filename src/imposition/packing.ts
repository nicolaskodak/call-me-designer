export interface PackRect { id: string; w: number; h: number }
export interface PackPlacement { id: string; x: number; y: number; rotationDeg: 0 | 90 }
export interface PackResult { placed: PackPlacement[]; notPlaced: string[] }

interface FreeRect { x: number; y: number; w: number; h: number }
interface Orientation { w: number; h: number; rotationDeg: 0 | 90 }

const area = (r: { w: number; h: number }) => r.w * r.h;
const fits = (r: FreeRect, w: number, h: number) => w <= r.w && h <= r.h;

const pruneContained = (rects: FreeRect[]): FreeRect[] =>
  rects.filter((a, idx) => {
    const contained = rects.some((b, j) =>
      j !== idx &&
      a.x >= b.x &&
      a.y >= b.y &&
      a.x + a.w <= b.x + b.w &&
      a.y + a.h <= b.y + b.h,
    );
    return !contained && a.w > 0 && a.h > 0;
  });

const splitFreeRect = (r: FreeRect, w: number, h: number): FreeRect[] => {
  // 放在 (r.x, r.y)，切出右邊、下面、右下三塊
  const right: FreeRect = { x: r.x + w, y: r.y, w: r.w - w, h };
  const bottom: FreeRect = { x: r.x, y: r.y + h, w: r.w, h: r.h - h };
  const bottomRight: FreeRect = { x: r.x + w, y: r.y + h, w: r.w - w, h: r.h - h };
  return pruneContained([right, bottom, bottomRight].filter(fr => fr.w > 0 && fr.h > 0));
};

const orientationsOf = (rect: PackRect, allowRotate90: boolean): Orientation[] =>
  allowRotate90 && rect.w !== rect.h
    ? [{ w: rect.w, h: rect.h, rotationDeg: 0 }, { w: rect.h, h: rect.w, rotationDeg: 90 }]
    : [{ w: rect.w, h: rect.h, rotationDeg: 0 }];

interface BestFit { index: number; score: number; opt: Orientation }

const findBestFit = (free: FreeRect[], options: Orientation[]): BestFit | null => {
  let best: BestFit | null = null;
  free.forEach((fr, index) => {
    for (const opt of options) {
      if (!fits(fr, opt.w, opt.h)) continue;
      const score = area(fr) - opt.w * opt.h;
      const better =
        best === null ||
        score < best.score ||
        (score === best.score && opt.rotationDeg === 0 && best.opt.rotationDeg === 90);
      if (better) best = { index, score, opt };
    }
  });
  return best;
};

export function packWithinBoundary(
  rects: readonly PackRect[],
  boundaryWidth: number,
  boundaryHeight: number,
  allowRotate90: boolean,
): PackResult {
  let free: FreeRect[] = [{ x: 0, y: 0, w: boundaryWidth, h: boundaryHeight }];
  const placed: PackPlacement[] = [];
  const notPlaced: string[] = [];

  const sorted = [...rects].sort((a, b) => area(b) - area(a));
  for (const rect of sorted) {
    const best = findBestFit(free, orientationsOf(rect, allowRotate90));
    if (!best) {
      notPlaced.push(rect.id);
      continue;
    }
    const target = free[best.index];
    placed.push({ id: rect.id, x: target.x, y: target.y, rotationDeg: best.opt.rotationDeg });
    const newFree = splitFreeRect(target, best.opt.w, best.opt.h);
    free = pruneContained([...free.slice(0, best.index), ...free.slice(best.index + 1), ...newFree]);
  }

  return { placed, notPlaced };
}
