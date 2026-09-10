import { describe, expect, it } from 'vitest';
import { drawCutPdf, hexToRgb, type PdfLike } from './cutPdf';

// px → mm 的換算有浮點誤差，記錄時先四捨五入到 6 位小數
const round = (v: unknown) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v);

const recorder = () => {
  const calls: unknown[][] = [];
  const record = (name: string, args: unknown[]) => calls.push([name, ...args.map(round)]);
  const doc: PdfLike = {
    addImage: (...args: unknown[]) => { record('addImage', args.slice(1)); },
    setDrawColor: (...args: number[]) => { record('setDrawColor', args); },
    setLineWidth: (w: number) => { record('setLineWidth', [w]); },
    moveTo: (x: number, y: number) => { record('moveTo', [x, y]); },
    curveTo: (...args: number[]) => { record('curveTo', args); },
    close: () => { record('close', []); },
    stroke: () => { record('stroke', []); },
  };
  return { doc, calls };
};

describe('hexToRgb', () => {
  it('parses #RRGGBB', () => {
    expect(hexToRgb('#FF8000')).toEqual([255, 128, 0]);
  });

  it('falls back to red for invalid input', () => {
    expect(hexToRgb('red')).toEqual([255, 0, 0]);
  });
});

describe('drawCutPdf', () => {
  it('draws the image and the curves in mm', () => {
    const { doc, calls } = recorder();
    const image = {} as HTMLImageElement;
    drawCutPdf(doc, {
      image,
      widthPx: 254,
      heightPx: 127,
      dpi: 254, // 10 px = 1 mm
      color: '#FF0000',
      curveSets: [{
        start: [10, 20],
        segments: [{ c1: [20, 20], c2: [30, 20], end: [40, 20] }],
        closed: true,
      }],
    });
    expect(calls).toEqual([
      ['addImage', 'PNG', 0, 0, 25.4, 12.7],
      ['setDrawColor', 255, 0, 0],
      ['setLineWidth', 0.25],
      ['moveTo', 1, 2],
      ['curveTo', 2, 2, 3, 2, 4, 2],
      ['close'],
      ['stroke'],
    ]);
  });

  it('skips the image when missing and does not close open curves', () => {
    const { doc, calls } = recorder();
    drawCutPdf(doc, {
      image: null,
      widthPx: 10,
      heightPx: 10,
      dpi: 25.4,
      color: '#00FF00',
      curveSets: [{ start: [0, 0], segments: [], closed: false }],
    });
    expect(calls.map(c => c[0])).toEqual(['setDrawColor', 'setLineWidth', 'moveTo', 'stroke']);
  });
});
