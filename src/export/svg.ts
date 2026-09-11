import type { PathData } from '../types';
import { mmToPx, pxToMm } from '../units';

export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const CUT_STROKE_MM = 0.25;

export const formatNumber = (n: number): string => Number(n.toFixed(4)).toString();

export const escapeAttr = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const pathElement = (p: PathData): string =>
  `<path d="${escapeAttr(p.d)}"${p.fillRule ? ` fill-rule="${p.fillRule}"` : ''}/>`;

export const cutGroup = (paths: readonly PathData[], color: string, strokeWidth: number): string =>
  `<g id="cut" fill="none" stroke="${escapeAttr(color)}" stroke-width="${formatNumber(strokeWidth)}" stroke-linejoin="round">` +
  `${paths.map(pathElement).join('')}</g>`;

export const underprintGroup = (paths: readonly PathData[], color: string): string =>
  `<g id="underprint" fill="${escapeAttr(color)}" stroke="none">${paths.map(pathElement).join('')}</g>`;

const viewBoxAttr = (v: ViewBox) =>
  [v.x, v.y, v.width, v.height].map(formatNumber).join(' ');

export function svgDocument(o: { widthMm: number; heightMm: number; viewBox: ViewBox; body: string }): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${formatNumber(o.widthMm)}mm" height="${formatNumber(o.heightMm)}mm" viewBox="${viewBoxAttr(o.viewBox)}">\n` +
    `${o.body}\n</svg>\n`
  );
}

export function buildAlignedSvg(o: {
  kind: 'cut' | 'underprint';
  paths: readonly PathData[];
  widthPx: number;
  heightPx: number;
  dpi: number;
  color: string;
}): string {
  const body =
    o.kind === 'cut'
      ? cutGroup(o.paths, o.color, mmToPx(CUT_STROKE_MM, o.dpi))
      : underprintGroup(o.paths, o.color);
  return svgDocument({
    widthMm: pxToMm(o.widthPx, o.dpi),
    heightMm: pxToMm(o.heightPx, o.dpi),
    viewBox: { x: 0, y: 0, width: o.widthPx, height: o.heightPx },
    body,
  });
}

export function buildTrimmedCutSvg(o: {
  paths: readonly PathData[];
  bounds: ViewBox;
  dpi: number;
  color: string;
}): string {
  const strokeWidth = mmToPx(CUT_STROKE_MM, o.dpi);
  const pad = strokeWidth / 2;
  const viewBox: ViewBox = {
    x: o.bounds.x - pad,
    y: o.bounds.y - pad,
    width: o.bounds.width + pad * 2,
    height: o.bounds.height + pad * 2,
  };
  return svgDocument({
    widthMm: pxToMm(viewBox.width, o.dpi),
    heightMm: pxToMm(viewBox.height, o.dpi),
    viewBox,
    body: cutGroup(o.paths, o.color, strokeWidth),
  });
}
