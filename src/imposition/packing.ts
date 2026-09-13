export interface PackRect { id: string; w: number; h: number }
export interface PackPlacement { id: string; x: number; y: number; rotationDeg: 0 | 90 }
export interface PackResult { placed: PackPlacement[]; notPlaced: string[] }

interface FreeRect { x: number; y: number; w: number; h: number }
interface Orientation { w: number; h: number; rotationDeg: 0 | 90 }

const area = (r: { w: number; h: number }) => r.w * r.h;
const fits = (r: FreeRect, w: number, h: number) => w <= r.w && h <= r.h;

const sameRect = (a: FreeRect, b: FreeRect) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

const contains = (outer: FreeRect, inner: FreeRect) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.w <= outer.x + outer.w &&
  inner.y + inner.h <= outer.y + outer.h;

/** 被別塊完全包住的空位沒有用處；一模一樣的兩塊只留下標較小的那個，避免互相消掉 */
const pruneContained = (rects: FreeRect[]): FreeRect[] =>
  rects.filter((a, idx) => {
    if (a.w <= 0 || a.h <= 0) return false;
    return !rects.some((b, j) => j !== idx && contains(b, a) && !(sameRect(a, b) && j > idx));
  });

/**
 * 從一塊空位挖掉 used，回傳剩下的極大矩形（最多四塊，彼此可以重疊）。
 * 重點是「上、下、左、右」四塊都要保留：只切右／下會讓整寬的那塊吃掉旁邊的直欄，
 * 直欄消失之後，轉 90° 的項目就永遠找不到落點。
 */
const subtract = (free: FreeRect, used: FreeRect): FreeRect[] => {
  const disjoint =
    used.x >= free.x + free.w ||
    used.x + used.w <= free.x ||
    used.y >= free.y + free.h ||
    used.y + used.h <= free.y;
  if (disjoint) return [free];

  const pieces: FreeRect[] = [
    { x: free.x, y: free.y, w: free.w, h: used.y - free.y },
    { x: free.x, y: used.y + used.h, w: free.w, h: free.y + free.h - (used.y + used.h) },
    { x: free.x, y: free.y, w: used.x - free.x, h: free.h },
    { x: used.x + used.w, y: free.y, w: free.x + free.w - (used.x + used.w), h: free.h },
  ];
  return pieces.filter(p => p.w > 0 && p.h > 0);
};

const orientationsOf = (rect: PackRect, allowRotate90: boolean): Orientation[] =>
  allowRotate90 && rect.w !== rect.h
    ? [{ w: rect.w, h: rect.h, rotationDeg: 0 }, { w: rect.h, h: rect.w, rotationDeg: 90 }]
    : [{ w: rect.w, h: rect.h, rotationDeg: 0 }];

/** Best Short Side Fit：先比較剩下的短邊，短邊一樣再比長邊，剩越少越好 */
const fitScore = (free: FreeRect, opt: Orientation): number => {
  const leftoverW = free.w - opt.w;
  const leftoverH = free.h - opt.h;
  return Math.min(leftoverW, leftoverH) * 1e6 + Math.max(leftoverW, leftoverH);
};

interface BestFit { index: number; score: number; opt: Orientation }

const findBestFit = (free: FreeRect[], options: Orientation[]): BestFit | null => {
  let best: BestFit | null = null;
  free.forEach((fr, index) => {
    for (const opt of options) {
      if (!fits(fr, opt.w, opt.h)) continue;
      const score = fitScore(fr, opt);
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
    const used: FreeRect = { x: target.x, y: target.y, w: best.opt.w, h: best.opt.h };
    placed.push({ id: rect.id, x: used.x, y: used.y, rotationDeg: best.opt.rotationDeg });
    // 所有和 used 相交的空位都要重切，只處理被選中的那塊會留下和項目重疊的空位
    free = pruneContained(free.flatMap(fr => subtract(fr, used)));
  }

  return { placed, notPlaced };
}
