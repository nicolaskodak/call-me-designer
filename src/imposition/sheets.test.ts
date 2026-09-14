import { describe, expect, it } from 'vitest';
import type { PackRect } from './packing';
import { MAX_SHEETS, packIntoSheets } from './sheets';
import { DEFAULT_SHEET_SIZES, type SheetSize } from './sheetSizes';

const A4: SheetSize = { name: 'A4', widthMm: 297, heightMm: 210 };
const A3: SheetSize = { name: 'A3', widthMm: 420, heightMm: 297 };

const same = (n: number, w: number, h: number): PackRect[] =>
  Array.from({ length: n }, (_, i) => ({ id: `s${i}`, w, h }));

/** 把結果攤平成每個項目的實際佔位方框，供重疊與越界檢查 */
const boxesOf = (rects: readonly PackRect[], sheet: { placed: readonly { id: string; x: number; y: number; rotationDeg: 0 | 90 }[] }) => {
  const byId = new Map(rects.map(r => [r.id, r] as const));
  return sheet.placed.map(p => {
    const r = byId.get(p.id)!;
    return { id: p.id, x: p.x, y: p.y, w: p.rotationDeg === 90 ? r.h : r.w, h: p.rotationDeg === 90 ? r.w : r.h };
  });
};

describe('packIntoSheets', () => {
  it('沒有項目時不開任何版面', () => {
    expect(packIntoSheets([], [A4], false)).toEqual({ sheets: [], notPlaced: [] });
  });

  it('單一小件會選面積最小的可用尺寸', () => {
    const result = packIntoSheets([{ id: 'a', w: 100, h: 100 }], DEFAULT_SHEET_SIZES, false);
    expect(result.sheets).toHaveLength(1);
    expect(result.sheets[0].sizeName).toBe('A4');
    expect(result.notPlaced).toEqual([]);
  });

  it('放不下的項目會開新版面', () => {
    const rects = same(20, 103, 53);
    const result = packIntoSheets(rects, [A4], true);
    expect(result.sheets.length).toBeGreaterThan(1);
    expect(result.notPlaced).toEqual([]);
    const total = result.sheets.reduce((n, s) => n + s.placed.length, 0);
    expect(total).toBe(20);
  });

  it('最後一張自動挑小的', () => {
    // 415x290 幾乎佔滿 A3，旁邊塞不下 100x100，第二張只放一個小件時 A4 的使用率贏過 A3
    const rects: PackRect[] = [
      { id: 'big', w: 415, h: 290 },
      { id: 'small', w: 100, h: 100 },
    ];
    const result = packIntoSheets(rects, [A4, A3], false);
    expect(result.sheets.map(s => s.sizeName)).toEqual(['A3', 'A4']);
  });

  it('優先保證放進當前最大件，不會把大件推到後面獨佔空版', () => {
    // 四個 148x105 剛好鋪滿 A4（使用率約 99%），300x250 只有 A3 放得下（使用率約 60%）。
    // 少了最大件保障規則，第一張會選 A4，大件被推到後面。
    const rects: PackRect[] = [{ id: 'big', w: 300, h: 250 }, ...same(4, 148, 105)];
    const result = packIntoSheets(rects, [A4, A3], false);
    expect(result.sheets[0].sizeName).toBe('A3');
    expect(result.sheets[0].placed.some(p => p.id === 'big')).toBe(true);
  });

  it('比所有尺寸都大的項目回報為放不下', () => {
    const result = packIntoSheets([{ id: 'huge', w: 900, h: 900 }, { id: 'ok', w: 50, h: 50 }], [A4, A3], false);
    expect(result.notPlaced).toEqual(['huge']);
    expect(result.sheets).toHaveLength(1);
  });

  it('沒有任何尺寸時全部放不下', () => {
    const result = packIntoSheets([{ id: 'a', w: 10, h: 10 }], [], false);
    expect(result.sheets).toEqual([]);
    expect(result.notPlaced).toEqual(['a']);
  });

  it('尊重版面數上限', () => {
    const result = packIntoSheets(same(30, 250, 190), [A4], false, 2);
    expect(result.sheets).toHaveLength(2);
    expect(result.notPlaced.length).toBe(28);
  });

  it('相同輸入得到相同結果', () => {
    const rects = same(15, 90, 70);
    expect(packIntoSheets(rects, DEFAULT_SHEET_SIZES, true)).toEqual(packIntoSheets(rects, DEFAULT_SHEET_SIZES, true));
  });

  it('不修改傳入的陣列', () => {
    const rects = [{ id: 'a', w: 10, h: 10 }, { id: 'b', w: 200, h: 100 }];
    packIntoSheets(rects, [A4], false);
    expect(rects.map(r => r.id)).toEqual(['a', 'b']);
  });

  it('性質測試：每個項目恰好出現一次，同版面內不重疊、不越界', () => {
    let seed = 20260914;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    const failures: string[] = [];
    for (let trial = 0; trial < 300; trial++) {
      const rects = Array.from({ length: 1 + Math.floor(rnd() * 20) }, (_, i) => ({
        id: `r${i}`,
        w: Math.round(20 + rnd() * 400),
        h: Math.round(20 + rnd() * 300),
      }));
      const result = packIntoSheets(rects, DEFAULT_SHEET_SIZES, trial % 2 === 0);

      const seen = [...result.sheets.flatMap(s => s.placed.map(p => p.id)), ...result.notPlaced].sort();
      if (seen.join(',') !== rects.map(r => r.id).sort().join(',')) {
        failures.push(`trial ${trial}: 項目沒有恰好出現一次`);
      }

      result.sheets.forEach((sheet, index) => {
        if (!DEFAULT_SHEET_SIZES.some(s => s.name === sheet.sizeName)) {
          failures.push(`trial ${trial} sheet ${index}: 尺寸不在清單內`);
        }
        const boxes = boxesOf(rects, sheet);
        boxes.forEach((a, i) => {
          if (a.x < 0 || a.y < 0 || a.x + a.w > sheet.widthMm || a.y + a.h > sheet.heightMm) {
            failures.push(`trial ${trial} sheet ${index}: ${a.id} 越界`);
          }
          boxes.slice(i + 1).forEach(b => {
            if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
              failures.push(`trial ${trial} sheet ${index}: ${a.id} 與 ${b.id} 重疊`);
            }
          });
        });
      });
    }
    expect(failures).toEqual([]);
  });

  it('MAX_SHEETS 是有限的保護值', () => {
    expect(MAX_SHEETS).toBeGreaterThan(0);
    expect(Number.isFinite(MAX_SHEETS)).toBe(true);
  });
});
