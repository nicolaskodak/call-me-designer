import { nestedSvgMarkup, type ParsedSvg } from '../utils/sanitizeSvg';
import type { LayoutBox } from './types';

const DEFAULT_PAD_PX = 2;

export function measureParsedSvg(svg: ParsedSvg, widthPx: number, heightPx: number, padPx = DEFAULT_PAD_PX): LayoutBox {
  const full: LayoutBox = { x: 0, y: 0, width: widthPx, height: heightPx };
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-100000px;top:-100000px;width:0;height:0;overflow:hidden;visibility:hidden';
  host.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}">${nestedSvgMarkup(svg, widthPx, heightPx)}</svg>`;
  document.body.appendChild(host);
  try {
    const root = host.firstElementChild as SVGGraphicsElement | null;
    if (!root) return full;
    const b = root.getBBox();
    const x0 = Math.max(0, b.x - padPx);
    const y0 = Math.max(0, b.y - padPx);
    const x1 = Math.min(widthPx, b.x + b.width + padPx);
    const y1 = Math.min(heightPx, b.y + b.height + padPx);
    return { x: x0, y: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) };
  } catch {
    return full;
  } finally {
    host.remove();
  }
}
