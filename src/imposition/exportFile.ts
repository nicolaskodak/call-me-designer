import { downloadText } from '../utils/download';
import { blobToDataUrl, buildSheetSvgs, placedItems, type ImpositionLayerKind } from './exportSvg';
import type { ImpositionLayer, ImpositionState } from './types';

const SVG_MIME = 'image/svg+xml;charset=utf-8';
/** 同一個 tick 連發多個下載會被瀏覽器擋掉，每檔之間隔一下 */
const DOWNLOAD_GAP_MS = 250;

const uniqueLayers = (layers: readonly ImpositionLayer[]): ImpositionLayer[] =>
  [...new Map(layers.map(l => [l.id, l] as const)).values()];

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** 回傳實際下載的檔案數 */
export async function downloadImpositionSvg(
  state: ImpositionState,
  kinds: readonly ImpositionLayerKind[],
  colors: { cut: string; underprint: string },
  baseName: string,
): Promise<number> {
  const items = placedItems(state);
  if (items.length === 0) return 0;

  const imageDataUrls = kinds.includes('artwork')
    ? new Map(
        await Promise.all(
          uniqueLayers(items.map(i => i.layer)).map(async l => [l.id, await blobToDataUrl(l.imageBlob)] as const),
        ),
      )
    : new Map<string, string>();

  const files = buildSheetSvgs({ state, kinds, colors, imageDataUrls, baseName });
  for (const [index, file] of files.entries()) {
    if (index > 0) await wait(DOWNLOAD_GAP_MS);
    downloadText(file.svg, file.filename, SVG_MIME);
  }
  return files.length;
}
