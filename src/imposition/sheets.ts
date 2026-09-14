import { packWithinBoundary, type PackPlacement, type PackRect } from './packing';
import type { SheetSize } from './sheetSizes';

export interface SheetPlacement {
  sizeName: string;
  widthMm: number;
  heightMm: number;
  placed: PackPlacement[];
}

export interface SheetPackResult {
  sheets: SheetPlacement[];
  notPlaced: string[];
}

/** 版面數上限，避免任何情況下的無窮迴圈 */
export const MAX_SHEETS = 50;

const areaOf = (r: { w: number; h: number }) => r.w * r.h;

const byAreaDesc = (a: PackRect, b: PackRect) =>
  areaOf(b) - areaOf(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

interface Candidate {
  size: SheetSize;
  placed: PackPlacement[];
  hasLargest: boolean;
  utilization: number;
}

const candidateFor = (
  size: SheetSize,
  remaining: readonly PackRect[],
  areaById: ReadonlyMap<string, number>,
  allowRotate90: boolean,
  largestId: string,
): Candidate | null => {
  const { placed } = packWithinBoundary(remaining, size.widthMm, size.heightMm, allowRotate90);
  if (placed.length === 0) return null;
  const used = placed.reduce((sum, p) => sum + (areaById.get(p.id) ?? 0), 0);
  return {
    size,
    placed,
    hasLargest: placed.some(p => p.id === largestId),
    utilization: used / (size.widthMm * size.heightMm),
  };
};

/**
 * 逐版面貪婪選尺寸。每開一張版面就對每個尺寸各打包一次，選使用率最高者。
 *
 * 總項目面積固定，因此「總用紙面積最小」等價於「平均使用率最大」，使用率就是這個
 * 目標函數下的直接指標。但只看使用率會出現壞解：塞滿小件的小版面使用率很高，卻把
 * 大件推到後面獨佔一張幾乎空白的大版。所以候選中若有放得下「當前最大件」的，就只
 * 在那些之中比使用率。
 */
export function packIntoSheets(
  rects: readonly PackRect[],
  sizes: readonly SheetSize[],
  allowRotate90: boolean,
  maxSheets: number = MAX_SHEETS,
): SheetPackResult {
  const areaById = new Map(rects.map(r => [r.id, areaOf(r)] as const));
  const sheets: SheetPlacement[] = [];
  let remaining = [...rects].sort(byAreaDesc);

  while (remaining.length > 0 && sheets.length < maxSheets) {
    const largestId = remaining[0].id;
    const candidates = sizes.flatMap(size => {
      const candidate = candidateFor(size, remaining, areaById, allowRotate90, largestId);
      return candidate ? [candidate] : [];
    });
    if (candidates.length === 0) break;

    const withLargest = candidates.filter(c => c.hasLargest);
    const pool = withLargest.length > 0 ? withLargest : candidates;
    // 使用率相同時保留先出現者，結果才有決定性
    const best = pool.reduce((a, b) => (b.utilization > a.utilization ? b : a));

    sheets.push({
      sizeName: best.size.name,
      widthMm: best.size.widthMm,
      heightMm: best.size.heightMm,
      placed: best.placed,
    });
    const usedIds = new Set(best.placed.map(p => p.id));
    remaining = remaining.filter(r => !usedIds.has(r.id));
  }

  return { sheets, notPlaced: remaining.map(r => r.id) };
}
