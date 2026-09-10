import { describe, expect, it } from 'vitest';
import type { Ring } from './types';
import {
  fillHoles,
  inflate,
  normalizeRings,
  polygonArea,
  polygonsBounds,
  prepareBase,
  removeSmallIslands,
  ringArea,
  simplify,
} from './polygon';

const sq = (x: number, y: number, w: number, h: number): Ring => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

describe('normalizeRings', () => {
  it('turns an outer ring and an inner ring into one polygon with a hole', () => {
    const polys = normalizeRings([sq(0, 0, 100, 100), sq(30, 30, 40, 40)]);
    expect(polys).toHaveLength(1);
    expect(polys[0].holes).toHaveLength(1);
    expect(polygonArea(polys[0])).toBeCloseTo(8400, 6);
  });

  it('orients outers positive and holes negative', () => {
    const [p] = normalizeRings([sq(0, 0, 100, 100), sq(30, 30, 40, 40)]);
    expect(ringArea(p.outer)).toBeGreaterThan(0);
    expect(ringArea(p.holes[0])).toBeLessThan(0);
  });

  it('splits a self-intersecting bow-tie into two parts', () => {
    const bowTie: Ring = [[0, 0], [10, 10], [10, 0], [0, 10]];
    expect(normalizeRings([bowTie])).toHaveLength(2);
  });

  it('keeps an island inside a hole as a separate polygon', () => {
    const polys = normalizeRings([sq(0, 0, 100, 100), sq(20, 20, 60, 60), sq(40, 40, 20, 20)]);
    expect(polys).toHaveLength(2);
    expect(polys.map(p => p.holes.length).sort()).toEqual([0, 1]);
  });
});

describe('inflate', () => {
  it('grows a square by the delta', () => {
    const b = polygonsBounds(inflate(normalizeRings([sq(0, 0, 100, 100)]), 10));
    expect(b?.minX).toBeCloseTo(-10, 1);
    expect(b?.maxX).toBeCloseTo(110, 1);
    expect(b?.maxY).toBeCloseTo(110, 1);
  });

  it('shrinks a square with a negative delta', () => {
    const b = polygonsBounds(inflate(normalizeRings([sq(0, 0, 100, 100)]), -10));
    expect(b?.minX).toBeCloseTo(10, 1);
    expect(b?.maxX).toBeCloseTo(90, 1);
  });

  it('returns a copy for a zero delta and an empty list for empty input', () => {
    const polys = normalizeRings([sq(0, 0, 10, 10)]);
    const same = inflate(polys, 0);
    expect(same).toEqual(polys);
    expect(same).not.toBe(polys);
    expect(inflate([], 5)).toEqual([]);
  });

  it('merges islands only when the grown shapes overlap', () => {
    // 相距 30px，各自外擴 d 後間距為 30 − 2d，d > 15 才會重疊
    const polys = normalizeRings([sq(0, 0, 100, 100), sq(130, 0, 100, 100)]);
    expect(inflate(polys, 15.5)).toHaveLength(1);
    expect(inflate(polys, 14.9)).toHaveLength(2);
    expect(inflate(polys, 10)).toHaveLength(2);
  });
});

describe('simplify', () => {
  it('removes jitter along straight edges', () => {
    const jittery: Ring = Array.from({ length: 400 }, (_, i) => {
      const t = (i % 100) / 100;
      const j = i % 2 === 0 ? 0.2 : -0.2;
      const side = Math.floor(i / 100);
      if (side === 0) return [t * 100, j] as const;
      if (side === 1) return [100 + j, t * 100] as const;
      if (side === 2) return [100 - t * 100, 100 + j] as const;
      return [j, 100 - t * 100] as const;
    });
    const [p] = simplify(normalizeRings([jittery]), 0.5);
    expect(p.outer.length).toBeLessThan(20);
  });

  it('handles empty input', () => {
    expect(simplify([], 0.5)).toEqual([]);
  });
});

describe('removeSmallIslands', () => {
  it('drops polygons whose outer area is below the minimum', () => {
    const polys = normalizeRings([sq(0, 0, 100, 100), sq(200, 200, 2, 2)]);
    expect(removeSmallIslands(polys, 10)).toHaveLength(1);
    expect(removeSmallIslands(polys, 0)).toHaveLength(2);
  });
});

describe('fillHoles', () => {
  it('removes holes', () => {
    const polys = fillHoles(normalizeRings([sq(0, 0, 100, 100), sq(30, 30, 40, 40)]));
    expect(polys).toHaveLength(1);
    expect(polys[0].holes).toHaveLength(0);
  });

  it('absorbs islands inside holes', () => {
    const polys = fillHoles(normalizeRings([sq(0, 0, 100, 100), sq(20, 20, 60, 60), sq(40, 40, 20, 20)]));
    expect(polys).toHaveLength(1);
    expect(polys[0].holes).toHaveLength(0);
  });

  it('handles empty input', () => {
    expect(fillHoles([])).toEqual([]);
  });
});

describe('prepareBase and polygonsBounds', () => {
  it('normalizes, simplifies and removes small islands', () => {
    const polys = prepareBase([sq(0, 0, 100, 100), sq(200, 200, 2, 2)], 10);
    expect(polys).toHaveLength(1);
  });

  it('returns null bounds for nothing', () => {
    expect(prepareBase([], 0)).toEqual([]);
    expect(polygonsBounds([])).toBeNull();
  });
});
