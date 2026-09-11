import type { Point, Ring } from '../geometry/types';

/** 轉角大於等於這個角度就當成尖角並保持銳利；像素描邊的小斜角只轉 45° */
export const CORNER_ANGLE_DEG = 60;
/** 沒有尖角的輪廓切成幾段分別擬合 */
export const SMOOTH_ANCHOR_COUNT = 4;
/** 導引點離錨點的距離（px）：近到不影響形狀，只用來告訴擬合器切線方向 */
export const TANGENT_GUIDE_PX = 0.05;
/**
 * 補點的間距是容許誤差的兩倍，但至少這麼多（px）。
 * 再密也不會更準，只會讓擬合變慢；再疏（四倍）像素圖類的白墨就會超出容許誤差。
 */
const MIN_SPACING_PX = 3;
/** 估計切線時，錨點前後各取多遠（px）的點連成弦；至少要跨過幾個像素鋸齒 */
const MIN_TANGENT_WINDOW_PX = 3;

const samePoint = (a: Point, b: Point): boolean => a[0] === b[0] && a[1] === b[1];

/** 去掉連續重複的點，包含頭尾相同的情況 */
const dedupe = (ring: Ring): Ring => {
  const kept = ring.filter((p, i) => i === 0 || !samePoint(p, ring[i - 1]));
  return kept.length > 1 && samePoint(kept[0], kept[kept.length - 1]) ? kept.slice(0, -1) : kept;
};

const turnAngle = (prev: Point, p: Point, next: Point): number => {
  const diff = Math.abs(Math.atan2(next[1] - p[1], next[0] - p[0]) - Math.atan2(p[1] - prev[1], p[0] - prev[0]));
  return diff > Math.PI ? 2 * Math.PI - diff : diff;
};

export function findCorners(ring: Ring, minTurnDeg = CORNER_ANGLE_DEG): number[] {
  const n = ring.length;
  const minTurn = (minTurnDeg * Math.PI) / 180;
  return ring
    .map((_, i) => i)
    .filter(i => turnAngle(ring[(i - 1 + n) % n], ring[i], ring[(i + 1) % n]) >= minTurn);
}

/** a 到 b 之間補點，讓相鄰兩點的距離不超過 spacing；結果含 a、不含 b */
const fillEdge = (a: Point, b: Point, spacing: number): Point[] => {
  const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / spacing));
  return Array.from({ length: steps }, (_, s) =>
    s === 0 ? a : ([a[0] + ((b[0] - a[0]) * s) / steps, a[1] + ((b[1] - a[1]) * s) / steps] as const),
  );
};

const densify = (points: readonly Point[], spacing: number): Point[] => [
  ...points.slice(0, -1).flatMap((a, i) => fillEdge(a, points[i + 1], spacing)),
  points[points.length - 1],
];

/** 沿著輪廓從 from 走到 to（兩端都含）；from 等於 to 時繞一整圈 */
const walk = (ring: Ring, from: number, to: number): Point[] => {
  const n = ring.length;
  const count = ((to - from + n - 1) % n) + 2;
  return Array.from({ length: count }, (_, k) => ring[(from + k) % n]);
};

const evenAnchors = (n: number): number[] => [
  ...new Set(Array.from({ length: SMOOTH_ANCHOR_COUNT }, (_, j) => Math.floor((n * j) / SMOOTH_ANCHOR_COUNT))),
];

/** 從 points[0] 沿著點列走 distance 遠的位置；點列不夠長就回傳最後一點 */
const pointAlong = (points: readonly Point[], distance: number): Point => {
  let left = distance;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d > 0 && d >= left) return [a[0] + ((b[0] - a[0]) * left) / d, a[1] + ((b[1] - a[1]) * left) / d];
    left -= d;
  }
  return points[points.length - 1];
};

/** 錨點的單位切線：錨點前後各 window 遠的兩點連成的弦，可以抹平像素鋸齒；退化時回傳 null */
const tangentAt = (before: readonly Point[], after: readonly Point[], window: number): Point | null => {
  const ahead = pointAlong(after, window);
  const behind = pointAlong([...before].reverse(), window);
  const dx = ahead[0] - behind[0];
  const dy = ahead[1] - behind[1];
  const length = Math.hypot(dx, dy);
  return length === 0 ? null : [dx / length, dy / length];
};

/** 在 from 往 direction 放一個導引點；距離不超過到鄰點的一半，點的順序才不會亂 */
const guidePoint = (from: Point, neighbour: Point, direction: Point): Point => {
  const distance = Math.min(TANGENT_GUIDE_PX, Math.hypot(neighbour[0] - from[0], neighbour[1] - from[1]) / 2);
  return [from[0] + direction[0] * distance, from[1] + direction[1] * distance];
};

/**
 * Paper 擬合開放路徑時，端點切線只看最前（最後）兩個點；像素描邊上這個方向可能偏很多，
 * 前後兩段會在錨點接出折角。在錨點旁沿著真正的切線加導引點，兩段的切線就一致。
 */
const addTangentGuides = (runs: readonly Point[][], window: number): Point[][] => {
  const tangents = runs.map((run, k) => tangentAt(runs[(k - 1 + runs.length) % runs.length], run, window));
  return runs.map((run, k) => {
    const start = tangents[k];
    const end = tangents[(k + 1) % runs.length];
    const last = run.length - 1;
    return [
      run[0],
      ...(start ? [guidePoint(run[0], run[1], start)] : []),
      ...run.slice(1, -1),
      ...(end ? [guidePoint(run[last], run[last - 1], [-end[0], -end[1]])] : []),
      run[last],
    ];
  });
};

/**
 * 把封閉輪廓切成開放的段落，讓每段各自擬合成曲線，再接回一條封閉路徑。
 * 有尖角就在尖角切開，尖角保持銳利；沒有尖角就平均取幾個錨點，並在錨點旁加切線導引點。
 * 有三點以上的段落補點到間距不超過兩倍容許誤差，因為擬合只檢查拿到的點，長直邊中間沒有點就約束不到；
 * 兩個尖角之間只有兩點的段落就是直線，保持原樣。
 * 每段的最後一點就是下一段的第一點；最後一段回到第一段的起點。
 */
export function splitRingIntoRuns(ring: Ring, tolerancePx: number): Point[][] {
  const clean = dedupe(ring);
  if (clean.length < 3) return [];
  const corners = findCorners(clean);
  const anchors = corners.length > 0 ? corners : evenAnchors(clean.length);
  const spacing = Math.max(MIN_SPACING_PX, 2 * tolerancePx);
  const runs = anchors
    .map((from, k) => walk(clean, from, anchors[(k + 1) % anchors.length]))
    .map(run => (run.length > 2 ? densify(run, spacing) : run));
  return corners.length > 0 ? runs : addTangentGuides(runs, Math.max(MIN_TANGENT_WINDOW_PX, 2 * tolerancePx));
}
