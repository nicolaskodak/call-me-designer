import { CUT_STROKE_MM, escapeAttr, formatNumber, pathElement } from '../export/svg';
import { mmToPx, MM_PER_INCH } from '../units';
import { nestedSvgMarkup } from '../utils/sanitizeSvg';
import { kindsWithContent, sheetsWithContent } from './state';
import type { ImpositionInstance, ImpositionLayer, ImpositionLayerKind, ImpositionState } from './types';

export interface PlacedItem {
  layer: ImpositionLayer;
  instance: ImpositionInstance;
}

const INKSCAPE_NS = 'http://www.inkscape.org/namespaces/inkscape';
const f = formatNumber;

export function placedItems(state: ImpositionState, sheetId?: string): PlacedItem[] {
  const layers = new Map(state.layers.map(l => [l.id, l] as const));
  return state.instances.flatMap(instance => {
    const layer = layers.get(instance.layerId);
    if (!layer || instance.sheetId === null) return [];
    if (sheetId !== undefined && instance.sheetId !== sheetId) return [];
    return [{ layer, instance }];
  });
}

export function instanceTransform(layer: ImpositionLayer, instance: ImpositionInstance): string {
  const s = MM_PER_INCH / layer.dpi;
  const { x, y, height } = layer.layoutBoxPx;
  const place = `translate(${f(instance.xMm)} ${f(instance.yMm)}) scale(${f(s)})`;
  return instance.rotationDeg === 90
    ? `${place} translate(${f(y + height)} ${f(-x)}) rotate(90)`
    : `${place} translate(${f(-x)} ${f(-y)})`;
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('無法讀取圖片'));
    reader.readAsDataURL(blob);
  });
}

const artworkItem = ({ layer, instance }: PlacedItem, dataUrl: string | undefined): string =>
  dataUrl
    ? `<g transform="${instanceTransform(layer, instance)}"><image href="${escapeAttr(dataUrl)}" x="0" y="0" width="${f(layer.widthPx)}" height="${f(layer.heightPx)}" preserveAspectRatio="none"/></g>`
    : '';

const underprintItem = ({ layer, instance }: PlacedItem): string =>
  layer.underprint
    ? `<g transform="${instanceTransform(layer, instance)}">${layer.underprint.map(p => pathElement({ ...p, fillRule: 'evenodd' })).join('')}</g>`
    : '';

const cutItem = ({ layer, instance }: PlacedItem): string => {
  // 群組經過 scale，線寬要換回圖層座標才會是 0.25 mm
  const strokeWidth = f(mmToPx(CUT_STROKE_MM, layer.dpi));
  const content =
    layer.cut.kind === 'paths'
      ? layer.cut.paths.map(pathElement).join('')
      : nestedSvgMarkup(layer.cut.svg, layer.widthPx, layer.heightPx);
  return `<g transform="${instanceTransform(layer, instance)}" stroke-width="${strokeWidth}">${content}</g>`;
};

const layerGroup = (kind: ImpositionLayerKind, attrs: string, content: string): string =>
  `<g id="${kind}" inkscape:groupmode="layer" inkscape:label="${kind}"${attrs}>${content}</g>`;

export function buildImpositionSvg(o: {
  widthMm: number;
  heightMm: number;
  items: readonly PlacedItem[];
  kinds: readonly ImpositionLayerKind[];
  colors: { cut: string; underprint: string };
  imageDataUrls: ReadonlyMap<string, string>;
}): string {
  const groups: Record<ImpositionLayerKind, () => string> = {
    artwork: () => layerGroup('artwork', '', o.items.map(item => artworkItem(item, o.imageDataUrls.get(item.layer.id))).join('')),
    underprint: () => layerGroup('underprint', ` fill="${escapeAttr(o.colors.underprint)}" stroke="none"`, o.items.map(underprintItem).join('')),
    cut: () => layerGroup('cut', ` fill="none" stroke="${escapeAttr(o.colors.cut)}" stroke-linejoin="round"`, o.items.map(cutItem).join('')),
  };
  const order: ImpositionLayerKind[] = ['artwork', 'underprint', 'cut'];
  const body = order.filter(k => o.kinds.includes(k)).map(k => groups[k]()).join('\n');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="${INKSCAPE_NS}" width="${f(o.widthMm)}mm" height="${f(o.heightMm)}mm" viewBox="0 0 ${f(o.widthMm)} ${f(o.heightMm)}">\n` +
    `${body}\n</svg>\n`
  );
}

export interface SheetSvgFile {
  filename: string;
  svg: string;
}

/**
 * 每張版面產生一個 SVG，跳過「要輸出的層在這張版面上沒有內容」的組合——整份作業有白墨，
 * 不代表每張版面都有白墨，照出會給印刷廠一個空的分色檔。
 *
 * 號碼在過濾**之前**就綁定到版面：跳過某一層的某張版面時，其餘檔案的號碼不會往前遞補。
 * 這件事是承重的——使用者靠 `-2` 這個號碼把各層疊在一起對位，一旦號碼會位移，
 * underprint-1 可能對到的是第 2 張版，比多出一個空檔案嚴重得多。
 */
export function buildSheetSvgs(o: {
  state: ImpositionState;
  kinds: readonly ImpositionLayerKind[];
  colors: { cut: string; underprint: string };
  imageDataUrls: ReadonlyMap<string, string>;
  baseName: string;
}): SheetSvgFile[] {
  return sheetsWithContent(o.state)
    .map((sheet, index) => ({ sheet, number: index + 1 }))
    .filter(({ sheet }) => kindsWithContent(o.state, sheet.id).some(kind => o.kinds.includes(kind)))
    .map(({ sheet, number }) => {
      const svg = buildImpositionSvg({
        widthMm: sheet.widthMm,
        heightMm: sheet.heightMm,
        items: placedItems(o.state, sheet.id),
        kinds: o.kinds,
        colors: o.colors,
        imageDataUrls: o.imageDataUrls,
      });
      return { svg, filename: `${o.baseName}-${number}.svg` };
    });
}

/**
 * 分層匯出：依 kindsWithContent 決定要輸出哪幾層，每層每張有內容的版面各出一個檔，
 * 檔名為 `${baseName}-${kind}-${版面序號}.svg`（例如 imposition-artwork-1.svg）。
 * 「哪幾層算有內容」與「哪張版面算有內容」都不在這裡重新判斷一次，分別交給
 * kindsWithContent 與（透過 buildSheetSvgs）sheetsWithContent，維持單一真相來源。
 */
export function buildLayeredExportFiles(o: {
  state: ImpositionState;
  colors: { cut: string; underprint: string };
  imageDataUrls: ReadonlyMap<string, string>;
  baseName: string;
}): SheetSvgFile[] {
  const order: ImpositionLayerKind[] = ['artwork', 'underprint', 'cut'];
  const kinds = kindsWithContent(o.state);
  return order
    .filter(kind => kinds.includes(kind))
    .flatMap(kind =>
      buildSheetSvgs({
        state: o.state,
        kinds: [kind],
        colors: o.colors,
        imageDataUrls: o.imageDataUrls,
        baseName: `${o.baseName}-${kind}`,
      }),
    );
}
