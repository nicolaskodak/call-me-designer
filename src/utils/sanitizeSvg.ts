import DOMPurify from 'dompurify';
import { escapeAttr } from '../export/svg';

export interface ParsedSvg {
  viewBox: string;
  inner: string;
}

export function sanitizeSvg(text: string): string {
  return DOMPurify.sanitize(text, { USE_PROFILES: { svg: true, svgFilters: true } });
}

const sizeViewBox = (svg: Element, fallbackWidth: number, fallbackHeight: number): string => {
  const w = parseFloat(svg.getAttribute('width') ?? '');
  const h = parseFloat(svg.getAttribute('height') ?? '');
  return `0 0 ${Number.isFinite(w) ? w : fallbackWidth} ${Number.isFinite(h) ? h : fallbackHeight}`;
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

/** DOMPurify 以 HTML 方式序列化，可能拿掉 xmlns；XML 解析前補回，避免 xlink:href 造成解析錯誤 */
const ensureNamespaces = (markup: string): string =>
  markup
    .replace(/^(\s*<svg\b)(?![^>]*\sxmlns=)/i, `$1 xmlns="${SVG_NS}"`)
    .replace(/^(\s*<svg\b)(?![^>]*\sxmlns:xlink=)/i, `$1 xmlns:xlink="${XLINK_NS}"`);

export function parseUploadedSvg(text: string, fallbackWidth: number, fallbackHeight: number): ParsedSvg {
  const doc = new DOMParser().parseFromString(ensureNamespaces(sanitizeSvg(text)), 'image/svg+xml');
  const svg = doc.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('不是有效的 SVG');
  }
  const serializer = new XMLSerializer();
  return {
    viewBox: svg.getAttribute('viewBox') ?? sizeViewBox(svg, fallbackWidth, fallbackHeight),
    inner: Array.from(svg.childNodes).map(node => serializer.serializeToString(node)).join(''),
  };
}

export const nestedSvgMarkup = (parsed: ParsedSvg, widthPx: number, heightPx: number): string =>
  `<svg x="0" y="0" width="${widthPx}" height="${heightPx}" viewBox="${escapeAttr(parsed.viewBox)}" preserveAspectRatio="none" overflow="visible">${parsed.inner}</svg>`;
