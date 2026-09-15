import { downloadText } from '../utils/download';
import { blobToDataUrl, buildLayeredExportFiles, buildSheetSvgs, placedItems, type SheetSvgFile } from './exportSvg';
import type { ImpositionLayer, ImpositionLayerKind, ImpositionState } from './types';

const SVG_MIME = 'image/svg+xml;charset=utf-8';
/** 同一個 tick 連發多個下載會被瀏覽器擋掉，每檔之間隔一下 */
const DOWNLOAD_GAP_MS = 250;

const uniqueLayers = (layers: readonly ImpositionLayer[]): ImpositionLayer[] =>
  [...new Map(layers.map(l => [l.id, l] as const)).values()];

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const loadImageDataUrls = (state: ImpositionState): Promise<Map<string, string>> =>
  Promise.all(
    uniqueLayers(placedItems(state).map(i => i.layer)).map(async l => [l.id, await blobToDataUrl(l.imageBlob)] as const),
  ).then(entries => new Map(entries));

/** 依序下載每個檔案，檔案之間留 250ms 間隔避開瀏覽器的連續下載防護；回傳實際下載的檔案數 */
async function downloadAll(files: readonly SheetSvgFile[]): Promise<number> {
  for (const [index, file] of files.entries()) {
    if (index > 0) await wait(DOWNLOAD_GAP_MS);
    downloadText(file.svg, file.filename, SVG_MIME);
  }
  return files.length;
}

/** 回傳實際下載的檔案數 */
export async function downloadImpositionSvg(
  state: ImpositionState,
  kinds: readonly ImpositionLayerKind[],
  colors: { cut: string; underprint: string },
  baseName: string,
): Promise<number> {
  const items = placedItems(state);
  if (items.length === 0) return 0;

  const imageDataUrls = kinds.includes('artwork') ? await loadImageDataUrls(state) : new Map<string, string>();
  const files = buildSheetSvgs({ state, kinds, colors, imageDataUrls, baseName });
  return downloadAll(files);
}

/** 分層匯出（每層每張有內容的版面各一檔）；回傳實際下載的檔案數 */
export async function downloadImpositionLayers(
  state: ImpositionState,
  colors: { cut: string; underprint: string },
  baseName: string,
): Promise<number> {
  const items = placedItems(state);
  if (items.length === 0) return 0;

  const imageDataUrls = await loadImageDataUrls(state);
  const files = buildLayeredExportFiles({ state, colors, imageDataUrls, baseName });
  return downloadAll(files);
}
