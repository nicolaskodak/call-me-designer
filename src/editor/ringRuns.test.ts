import { describe, expect, it } from 'vitest';
import type { Point, Ring } from '../geometry/types';
import { findCorners, splitRingIntoRuns, TANGENT_GUIDE_PX } from './ringRuns';

const square: Ring = [[0, 0], [100, 0], [100, 100], [0, 100]];

const circle = (n: number, r = 100): Ring =>
  Array.from({ length: n }, (_, i) => [r * Math.cos((2 * Math.PI * i) / n), r * Math.sin((2 * Math.PI * i) / n)] as const);

/** 描邊後的像素轉角是 45° 的小斜角，不該被當成尖角 */
const chamferedSquare: Ring = [[1, 0], [99, 0], [100, 1], [100, 99], [99, 100], [1, 100], [0, 99], [0, 1]];

/** 只有一個尖角的水滴形：尖端在 (200, 0)，其餘是 45°..315° 的圓弧 */
const teardrop: Ring = [
  [200, 0],
  ...Array.from({ length: 55 }, (_, i) => {
    const a = ((45 + i * 5) * Math.PI) / 180;
    return [100 * Math.cos(a), 100 * Math.sin(a)] as const;
  }),
];

const maxGap = (run: readonly Point[]): number =>
  run.slice(1).reduce((max, p, i) => Math.max(max, Math.hypot(p[0] - run[i][0], p[1] - run[i][1])), 0);

/** 圓心在原點時，切線垂直於半徑：回傳 from→to 方向與半徑夾角的 cos */
const radialCos = (from: Point, to: Point): number => {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  return (dx * from[0] + dy * from[1]) / (Math.hypot(dx, dy) * Math.hypot(from[0], from[1]));
};

describe('findCorners', () => {
  it('finds the four corners of a square', () => {
    expect(findCorners(square)).toEqual([0, 1, 2, 3]);
  });

  it('treats a finely sampled circle as smooth', () => {
    expect(findCorners(circle(64))).toEqual([]);
  });

  it('ignores 45° pixel chamfers', () => {
    expect(findCorners(chamferedSquare)).toEqual([]);
  });

  it('finds the single tip of a teardrop', () => {
    expect(findCorners(teardrop)).toEqual([0]);
  });
});

describe('splitRingIntoRuns', () => {
  it('splits a square at its corners without guide points', () => {
    expect(splitRingIntoRuns(square, 1000)).toEqual([
      [[0, 0], [100, 0]],
      [[100, 0], [100, 100]],
      [[100, 100], [0, 100]],
      [[0, 100], [0, 0]],
    ]);
  });

  it('keeps a straight edge between two corners as just its two ends', () => {
    expect(splitRingIntoRuns(square, 1)).toEqual(splitRingIntoRuns(square, 1000));
  });

  it('adds points every twice the tolerance along a curved run', () => {
    const [run] = splitRingIntoRuns(teardrop, 5);
    expect(maxGap(run)).toBeLessThanOrEqual(10);
    // 尖端到圓弧起點的直邊約 147 px，每 10 px 以內一個點：切成 15 段
    expect(run.indexOf(teardrop[1])).toBe(15);
  });

  it('spaces the added points at least 3 px apart for small tolerances', () => {
    // 圓的每條弦約 9.8 px，間距 3 px 切成 4 段；16 條弦加終點，再加頭尾兩個導引點
    expect(splitRingIntoRuns(circle(64), 0.5)[0]).toHaveLength(16 * 4 + 1 + 2);
  });

  it('splits a smooth ring at four evenly spaced anchors', () => {
    const ring = circle(64);
    const runs = splitRingIntoRuns(ring, 1000);
    expect(runs.map(run => run[0])).toEqual([ring[0], ring[16], ring[32], ring[48]]);
    // 16 條邊的 17 個點，加上頭尾各一個導引點
    expect(runs.map(run => run.length)).toEqual([19, 19, 19, 19]);
  });

  it('puts a guide point along the tangent next to each smooth anchor', () => {
    for (const run of splitRingIntoRuns(circle(64), 1)) {
      const [start, startGuide] = run;
      const [endGuide, end] = run.slice(-2);
      expect(Math.hypot(startGuide[0] - start[0], startGuide[1] - start[1])).toBeLessThanOrEqual(TANGENT_GUIDE_PX);
      expect(Math.hypot(endGuide[0] - end[0], endGuide[1] - end[1])).toBeLessThanOrEqual(TANGENT_GUIDE_PX);
      expect(radialCos(start, startGuide)).toBeCloseTo(0, 6);
      expect(radialCos(end, endGuide)).toBeCloseTo(0, 6);
    }
  });

  it('chains the runs into a closed loop', () => {
    const runs = splitRingIntoRuns(circle(64), 5);
    runs.forEach((run, i) => expect(run[run.length - 1]).toEqual(runs[(i + 1) % runs.length][0]));
  });

  it('returns one run from a single corner back to itself', () => {
    const runs = splitRingIntoRuns(teardrop, 1000);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toHaveLength(teardrop.length + 1);
    expect(runs[0][0]).toEqual([200, 0]);
    expect(runs[0][teardrop.length]).toEqual([200, 0]);
  });

  it('drops repeated points before looking for corners', () => {
    const repeated: Ring = [[0, 0], [100, 0], [100, 0], [100, 100], [0, 100], [0, 0]];
    expect(splitRingIntoRuns(repeated, 1000)).toEqual(splitRingIntoRuns(square, 1000));
  });

  it('returns no runs for a degenerate ring', () => {
    expect(splitRingIntoRuns([[0, 0], [1, 1]], 1)).toEqual([]);
  });
});
