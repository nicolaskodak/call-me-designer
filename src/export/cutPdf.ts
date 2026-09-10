import type { Point } from '../geometry/types';
import { pxToMm } from '../units';
import { CUT_STROKE_MM } from './svg';

export interface CurveSegment {
  c1: Point;
  c2: Point;
  end: Point;
}

export interface CurveSet {
  start: Point;
  segments: CurveSegment[];
  closed: boolean;
}

/** jsPDF 用到的最小介面，方便測試 */
export interface PdfLike {
  addImage(image: HTMLImageElement, format: string, x: number, y: number, w: number, h: number): unknown;
  setDrawColor(r: number, g: number, b: number): unknown;
  setLineWidth(width: number): unknown;
  moveTo(x: number, y: number): unknown;
  curveTo(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): unknown;
  close(): unknown;
  stroke(): unknown;
}

export interface CutPdfOptions {
  image: HTMLImageElement | null;
  curveSets: readonly CurveSet[];
  widthPx: number;
  heightPx: number;
  dpi: number;
  color: string;
}

export function hexToRgb(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) return [255, 0, 0];
  return [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)];
}

export function drawCutPdf(doc: PdfLike, o: CutPdfOptions): void {
  const mm = (px: number) => pxToMm(px, o.dpi);
  if (o.image) {
    doc.addImage(o.image, 'PNG', 0, 0, mm(o.widthPx), mm(o.heightPx));
  }
  const [r, g, b] = hexToRgb(o.color);
  doc.setDrawColor(r, g, b);
  doc.setLineWidth(CUT_STROKE_MM);

  for (const set of o.curveSets) {
    doc.moveTo(mm(set.start[0]), mm(set.start[1]));
    for (const s of set.segments) {
      doc.curveTo(mm(s.c1[0]), mm(s.c1[1]), mm(s.c2[0]), mm(s.c2[1]), mm(s.end[0]), mm(s.end[1]));
    }
    if (set.closed) doc.close();
    doc.stroke();
  }
}

export async function exportCutPdf(o: CutPdfOptions, filename = 'contour-crafted-export.pdf'): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const widthMm = pxToMm(o.widthPx, o.dpi);
  const heightMm = pxToMm(o.heightPx, o.dpi);
  const doc = new jsPDF({ orientation: widthMm > heightMm ? 'l' : 'p', unit: 'mm', format: [widthMm, heightMm] });
  drawCutPdf(doc as unknown as PdfLike, o);
  doc.save(filename);
}
