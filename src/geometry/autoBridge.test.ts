import { describe, expect, it } from 'vitest';
import { closeAndFill, findBridgeRadius } from './autoBridge';
import { prepareBase } from './polygon';
import { anyOf, makeAlpha, minus, rect } from './testUtils';
import { tracePrecise } from './trace';

const baseOf = (img: ReturnType<typeof makeAlpha>) => prepareBase(tracePrecise(img, 128), 0);
// 兩個 100×100 正方形，中間相距 30px
const twoSquares = baseOf(makeAlpha(300, 160, anyOf(rect(20, 30, 100, 100), rect(150, 30, 100, 100))));
const oneSquare = baseOf(makeAlpha(200, 200, rect(50, 50, 100, 100)));

describe('closeAndFill', () => {
  it('connects islands when offset + radius covers half the gap', () => {
    expect(closeAndFill(twoSquares, 2, 14)).toHaveLength(1);
    expect(closeAndFill(twoSquares, 2, 12)).toHaveLength(2);
  });

  it('fills holes', () => {
    const donut = baseOf(makeAlpha(200, 200, minus(rect(40, 40, 120, 120), rect(80, 80, 40, 40))));
    const [p] = closeAndFill(donut, 0, 0);
    expect(p.holes).toHaveLength(0);
  });
});

describe('findBridgeRadius', () => {
  it('returns 0 when already connected', () => {
    expect(findBridgeRadius(oneSquare, 2, 40, 0.25)).toBe(0);
  });

  it('finds the smallest connecting radius within the precision', () => {
    const r = findBridgeRadius(twoSquares, 2, 40, 0.25);
    expect(closeAndFill(twoSquares, 2, r)).toHaveLength(1);
    expect(closeAndFill(twoSquares, 2, r - 0.25)).toHaveLength(2);
    expect(r).toBeGreaterThan(12.9);
    expect(r).toBeLessThan(13.4);
  });

  it('returns the maximum when it cannot connect', () => {
    expect(findBridgeRadius(twoSquares, 2, 5, 0.25)).toBe(5);
  });

  it('terminates even with zero precision', () => {
    expect(findBridgeRadius(twoSquares, 2, 40, 0)).toBeGreaterThan(12.9);
  });
});
