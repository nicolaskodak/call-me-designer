import { describe, expect, it } from 'vitest';
import { packWithinBoundary } from './packing';

describe('packWithinBoundary', () => {
  it('places a single rect at the origin', () => {
    const result = packWithinBoundary([{ id: 'a', w: 10, h: 10 }], 100, 100, false);
    expect(result).toEqual({ placed: [{ id: 'a', x: 0, y: 0, rotationDeg: 0 }], notPlaced: [] });
  });

  it('places two equal rects side by side', () => {
    const result = packWithinBoundary(
      [{ id: 'a', w: 50, h: 50 }, { id: 'b', w: 50, h: 50 }],
      100, 50, false,
    );
    expect(result.placed).toEqual([
      { id: 'a', x: 0, y: 0, rotationDeg: 0 },
      { id: 'b', x: 50, y: 0, rotationDeg: 0 },
    ]);
    expect(result.notPlaced).toEqual([]);
  });

  it('places larger rects first', () => {
    const result = packWithinBoundary(
      [{ id: 's', w: 10, h: 10 }, { id: 'b', w: 100, h: 90 }],
      100, 100, false,
    );
    expect(result.placed).toEqual([
      { id: 'b', x: 0, y: 0, rotationDeg: 0 },
      { id: 's', x: 0, y: 90, rotationDeg: 0 },
    ]);
  });

  it('reports rects that do not fit', () => {
    const result = packWithinBoundary([{ id: 'a', w: 120, h: 50 }], 100, 150, false);
    expect(result).toEqual({ placed: [], notPlaced: ['a'] });
  });

  it('rotates 90 degrees only when allowed', () => {
    const result = packWithinBoundary([{ id: 'a', w: 120, h: 50 }], 100, 150, true);
    expect(result).toEqual({ placed: [{ id: 'a', x: 0, y: 0, rotationDeg: 90 }], notPlaced: [] });
  });

  it('prefers the unrotated orientation on ties', () => {
    const result = packWithinBoundary([{ id: 'a', w: 50, h: 20 }], 100, 100, true);
    expect(result.placed[0].rotationDeg).toBe(0);
  });

  it('does not mutate the input array', () => {
    const rects = [{ id: 's', w: 10, h: 10 }, { id: 'b', w: 100, h: 90 }];
    packWithinBoundary(rects, 100, 100, false);
    expect(rects.map(r => r.id)).toEqual(['s', 'b']);
  });
});
