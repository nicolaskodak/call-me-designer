import { describe, expect, it } from 'vitest';
import { MSG_NO_OPAQUE, MSG_NOTHING_LEFT } from './messages';
import { polygonsBounds } from './polygon';
import { anyOf, makeAlpha, minus, rect } from './testUtils';
import type { UnderprintParamsPx } from './types';
import { buildUnderprint } from './underprint';

const params = (overrides: Partial<UnderprintParamsPx> = {}): UnderprintParamsPx => ({
  alphaThreshold: 128,
  insetPx: 2,
  minIslandAreaPx2: 0,
  fillHoles: false,
  ...overrides,
});

const square = makeAlpha(200, 200, rect(50, 50, 100, 100));

describe('buildUnderprint', () => {
  it('insets by the exact distance', () => {
    const b = polygonsBounds(buildUnderprint(square, params()).polygons);
    expect(b?.minX).toBeCloseTo(52, 0);
    expect(b?.maxX).toBeCloseTo(148, 0);
  });

  it('keeps the traced edge when inset is 0', () => {
    const b = polygonsBounds(buildUnderprint(square, params({ insetPx: 0 })).polygons);
    expect(b?.minX).toBeCloseTo(50, 0);
  });

  it('removes lines thinner than twice the inset', () => {
    const result = buildUnderprint(makeAlpha(120, 140, rect(50, 20, 4, 100)), params({ insetPx: 3 }));
    expect(result.polygons).toEqual([]);
    expect(result.warnings).toEqual([MSG_NOTHING_LEFT]);
  });

  it('keeps holes unless fillHoles is on', () => {
    const donut = makeAlpha(200, 200, minus(rect(40, 40, 120, 120), rect(80, 80, 40, 40)));
    expect(buildUnderprint(donut, params()).polygons[0].holes).toHaveLength(1);
    expect(buildUnderprint(donut, params({ fillHoles: true })).polygons[0].holes).toHaveLength(0);
  });

  it('allows multiple islands', () => {
    const img = makeAlpha(300, 160, anyOf(rect(20, 30, 100, 100), rect(150, 30, 100, 100)));
    const result = buildUnderprint(img, params());
    expect(result.polygons).toHaveLength(2);
    expect(result.stats.islandCount).toBe(2);
  });

  it('reports an empty image', () => {
    const result = buildUnderprint(makeAlpha(50, 50, () => false), params());
    expect(result.warnings).toEqual([MSG_NO_OPAQUE]);
  });
});
