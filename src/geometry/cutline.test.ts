import { describe, expect, it } from 'vitest';
import { buildCutline } from './cutline';
import { MSG_NO_OPAQUE } from './messages';
import { polygonsBounds } from './polygon';
import { anyOf, makeAlpha, minus, rect } from './testUtils';
import type { CutlineParamsPx } from './types';

const params = (overrides: Partial<CutlineParamsPx> = {}): CutlineParamsPx => ({
  mode: 'precise',
  alphaThreshold: 128,
  offsetPx: 2,
  legacyBlurPx: 5,
  legacyThreshold: 10,
  minIslandAreaPx2: 0,
  singleConnected: true,
  bridgeMode: 'auto',
  bridgeRadiusPx: 5,
  bridgeMaxPx: 40,
  bridgePrecisionPx: 0.25,
  ...overrides,
});

const square = makeAlpha(200, 200, rect(50, 50, 100, 100));
const twoSquares = makeAlpha(300, 160, anyOf(rect(20, 30, 100, 100), rect(150, 30, 100, 100)));
const donut = makeAlpha(200, 200, minus(rect(40, 40, 120, 120), rect(80, 80, 40, 40)));

describe('buildCutline', () => {
  it('offsets by the exact distance', () => {
    const { polygons } = buildCutline(square, params({ offsetPx: 10, singleConnected: false }));
    const b = polygonsBounds(polygons);
    expect(b?.minX).toBeCloseTo(40, 0);
    expect(b?.maxX).toBeCloseTo(160, 0);
  });

  it('keeps separate islands when single-connected is off', () => {
    const result = buildCutline(twoSquares, params({ singleConnected: false }));
    expect(result.polygons).toHaveLength(2);
    expect(result.warnings).toEqual([]);
  });

  it('bridges islands into one closed outline in auto mode', () => {
    const result = buildCutline(twoSquares, params());
    expect(result.polygons).toHaveLength(1);
    expect(result.polygons[0].holes).toHaveLength(0);
    expect(result.warnings).toEqual([]);
    expect(result.stats.bridgeRadiusPx).toBeGreaterThan(12.9);
    expect(result.stats.bridgeRadiusPx).toBeLessThan(13.4);
  });

  it('warns when a manual radius is too small', () => {
    const result = buildCutline(twoSquares, params({ bridgeMode: 'manual', bridgeRadiusPx: 5 }));
    expect(result.polygons).toHaveLength(2);
    expect(result.warnings).toEqual(['仍有 2 個分離區塊']);
    expect(result.stats.bridgeRadiusPx).toBe(5);
  });

  it('warns when auto mode hits the maximum', () => {
    const result = buildCutline(twoSquares, params({ bridgeMaxPx: 5 }));
    expect(result.stats.bridgeRadiusPx).toBe(5);
    expect(result.warnings).toEqual(['仍有 2 個分離區塊']);
  });

  it('fills holes only in single-connected mode', () => {
    expect(buildCutline(donut, params()).polygons[0].holes).toHaveLength(0);
    expect(buildCutline(donut, params({ singleConnected: false })).polygons[0].holes).toHaveLength(1);
  });

  it('removes small islands', () => {
    const img = makeAlpha(200, 200, anyOf(rect(50, 50, 100, 100), rect(185, 185, 2, 2)));
    const result = buildCutline(img, params({ singleConnected: false, minIslandAreaPx2: 10 }));
    expect(result.polygons).toHaveLength(1);
  });

  it('reports an empty image', () => {
    const result = buildCutline(makeAlpha(50, 50, () => false), params());
    expect(result).toEqual({ polygons: [], warnings: [MSG_NO_OPAQUE], stats: { islandCount: 0 } });
  });

  it('uses blur for the offset in legacy mode and ignores offsetPx', () => {
    const legacy = (offsetPx: number) =>
      buildCutline(square, params({ mode: 'legacy', offsetPx, singleConnected: false }));
    const b = polygonsBounds(legacy(0).polygons);
    expect(b?.minX).toBeLessThan(48);
    expect(b?.minX).toBeGreaterThan(40);
    expect(legacy(30)).toEqual(legacy(0));
  });
});
