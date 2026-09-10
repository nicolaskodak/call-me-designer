import DOMPurify from 'dompurify';
import { escapeAttr } from '../export/svg';

export interface ParsedSvg {
  viewBox: string;
  inner: string;
}

/** href 只留本地片段與點陣 data URI */
const SAFE_HREF = /^(#|data:image\/(png|jpeg|jpg|gif|webp);)/i;
const HREF_ATTRS = new Set(['href', 'xlink:href']);
const IMPORT_RULE = /@import[^;]*(;|$)/gi;
const URL_FN = /url\(\s*(['"]?)([\s\S]*?)\1\s*(\)|$)/gi;
const IMAGE_SET_FN = /image-set\(/gi;
const CSS_ESCAPE = /\\(?:([0-9a-f]{1,6})(?:\r\n|[ \t\r\n\f])?|([\s\S]))/gi;
const PLAIN_CHAR = /^[a-z-]$/i;

/** 把跳脫過的英文字母與 - 還原（例如 \75rl( → url(），避免藏住 url()／@import；其他跳脫原樣保留 */
const decodeCssEscapes = (css: string): string =>
  css.replace(CSS_ESCAPE, (match: string, hex: string | undefined, char: string | undefined) => {
    const decoded = hex !== undefined ? String.fromCharCode(Math.min(parseInt(hex, 16), 0xffff)) : char ?? '';
    return PLAIN_CHAR.test(decoded) ? decoded : match;
  });

/** 移除 @import、非 #… 的 url() 換成 none、image-set() 改成無效函式；沒有外部參照時原樣回傳 */
const stripExternalCss = (css: string): string => {
  const decoded = decodeCssEscapes(css);
  const cleaned = decoded
    .replace(IMPORT_RULE, '')
    .replace(URL_FN, (match: string, _quote: string, target: string) => (target.trim().startsWith('#') ? match : 'none'))
    .replace(IMAGE_SET_FN, 'none(');
  return cleaned === decoded ? css : cleaned;
};

// 上傳的 SVG 會直接插進主文件：不能載入任何外部資源（CSS 屬性選擇器可偷讀 API key、外部連結可當追蹤器）
DOMPurify.addHook('uponSanitizeElement', (node, data) => {
  if (data.tagName !== 'style') return;
  const css = node.textContent ?? '';
  const cleaned = stripExternalCss(css);
  if (cleaned !== css) node.textContent = cleaned;
});

DOMPurify.addHook('uponSanitizeAttribute', (_node, data) => {
  const { attrName, attrValue } = data;
  if (HREF_ATTRS.has(attrName)) {
    if (!SAFE_HREF.test(attrValue.trim())) data.keepAttr = false;
  } else if (attrName === 'style') {
    data.attrValue = stripExternalCss(attrValue);
  } else if (stripExternalCss(attrValue) !== attrValue) {
    data.keepAttr = false;
  }
});

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
