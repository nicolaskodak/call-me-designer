import { describe, expect, it } from 'vitest';
import { normalizeRings, polygonArea, polygonsBounds } from './polygon';
import { disc, makeAlpha, minus, rect } from './testUtils';
import { blurAlpha, traceLegacy, tracePrecise } from './trace';

describe('blurAlpha', () => {
  it('returns a copy when radius is 0', () => {
    const src = [0, 0, 255, 0, 0];
    const out = blurAlpha(src, 5, 1, 0);
    expect(Array.from(out)).toEqual(src);
  });

  it('box-blurs with clamped edges and truncation', () => {
    expect(Array.from(blurAlpha([0, 0, 255, 0, 0], 5, 1, 1))).toEqual([0, 85, 85, 85, 0]);
  });
});

describe('tracePrecise', () => {
  it('returns nothing for a fully transparent image', () => {
    expect(tracePrecise(makeAlpha(20, 20, () => false), 128)).toEqual([]);
  });

  it('traces a square on pixel edges at threshold 128', () => {
    const rings = tracePrecise(makeAlpha(40, 40, rect(10, 10, 20, 20)), 128);
    const b = polygonsBounds(normalizeRings(rings));
    expect(b?.minX).toBeCloseTo(10, 1);
    expect(b?.maxX).toBeCloseTo(30, 1);
    expect(b?.minY).toBeCloseTo(10, 1);
    expect(b?.maxY).toBeCloseTo(30, 1);
  });

  it('returns open rings', () => {
    const [ring] = tracePrecise(makeAlpha(40, 40, rect(10, 10, 20, 20)), 128);
    expect(ring[0]).not.toEqual(ring[ring.length - 1]);
  });

  it('approximates a disc area within 2%', () => {
    const polys = normalizeRings(tracePrecise(makeAlpha(120, 120, disc(60, 60, 50)), 128));
    expect(polys).toHaveLength(1);
    const expected = Math.PI * 50 * 50;
    expect(Math.abs(polygonArea(polys[0]) - expected) / expected).toBeLessThan(0.02);
  });

  it('keeps holes', () => {
    const img = makeAlpha(120, 120, minus(disc(60, 60, 40), disc(60, 60, 20)));
    const polys = normalizeRings(tracePrecise(img, 128));
    expect(polys).toHaveLength(1);
    expect(polys[0].holes).toHaveLength(1);
  });
});

describe('traceLegacy', () => {
  const img = makeAlpha(60, 60, rect(20, 20, 20, 20));

  it('expands the outline through blur', () => {
    const b = polygonsBounds(normalizeRings(traceLegacy(img, 5, 10)));
    expect(b?.minX).toBeLessThan(17);
    expect(b?.minX).toBeGreaterThan(12);
  });

  it('treats blur 0 as blur 1 like the old implementation', () => {
    expect(traceLegacy(img, 0, 128)).toEqual(traceLegacy(img, 1, 128));
  });
});
