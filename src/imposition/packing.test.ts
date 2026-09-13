import { describe, expect, it } from 'vitest';
import { packWithinBoundary, type PackRect } from './packing';

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

  const sameRects = (n: number, w: number, h: number): PackRect[] =>
    Array.from({ length: n }, (_, i) => ({ id: `s${i}`, w, h }));

  it('rotates into a tall leftover column', () => {
    // 160 寬只排得下一欄 103 寬，右側剩 57 寬 × 210 高。
    // 轉 90° 後是 53 寬 × 103 高，那條直欄還能再放 3 個。
    const rects = sameRects(6, 103, 53);
    expect(packWithinBoundary(rects, 160, 210, false).placed).toHaveLength(3);
    expect(packWithinBoundary(rects, 160, 210, true).placed).toHaveLength(6);
  });

  it('rotates to fill the sheet once the unrotated grid runs out', () => {
    // 297x210 不旋轉只排得下 2 欄 × 3 列 = 6 個，右側剩 91 寬要靠旋轉才用得到
    const rects = sameRects(8, 103, 53);
    expect(packWithinBoundary(rects, 297, 210, false).placed).toHaveLength(6);
    expect(packWithinBoundary(rects, 297, 210, true).notPlaced).toEqual([]);
  });

  it('never overlaps and never leaves the boundary', () => {
    const W = 150;
    const H = 120;
    let seed = 987654321;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    const failures: string[] = [];
    for (let trial = 0; trial < 1000; trial++) {
      const rects = Array.from({ length: 3 + Math.floor(rnd() * 14) }, (_, i) => ({
        id: `r${i}`,
        w: Math.round(5 + rnd() * 90),
        h: Math.round(5 + rnd() * 90),
      }));
      const byId = new Map(rects.map(r => [r.id, r] as const));
      const boxes = packWithinBoundary(rects, W, H, trial % 3 === 0).placed.map(p => {
        const r = byId.get(p.id)!;
        return { id: p.id, x: p.x, y: p.y, w: p.rotationDeg === 90 ? r.h : r.w, h: p.rotationDeg === 90 ? r.w : r.h };
      });

      boxes.forEach((a, i) => {
        if (a.x < 0 || a.y < 0 || a.x + a.w > W || a.y + a.h > H) failures.push(`trial ${trial}: ${a.id} 越界`);
        boxes.slice(i + 1).forEach(b => {
          if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
            failures.push(`trial ${trial}: ${a.id} 與 ${b.id} 重疊`);
          }
        });
      });
    }
    expect(failures).toEqual([]);
  });
});
