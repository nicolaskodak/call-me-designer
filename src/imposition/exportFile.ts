import { downloadText } from '../utils/download';
import { blobToDataUrl, buildImpositionSvg, placedItems, type ImpositionLayerKind } from './exportSvg';
import type { ImpositionLayer, ImpositionState } from './types';

const SVG_MIME = 'image/svg+xml;charset=utf-8';

const uniqueLayers = (layers: readonly ImpositionLayer[]): ImpositionLayer[] =>
  [...new Map(layers.map(l => [l.id, l] as const)).values()];

export async function downloadImpositionSvg(
  state: ImpositionState,
  kinds: readonly ImpositionLayerKind[],
  colors: { cut: string; underprint: string },
  filename: string,
): Promise<void> {
  const items = placedItems(state);
  if (items.length === 0) return;
  const imageDataUrls = kinds.includes('artwork')
    ? new Map(
        await Promise.all(
          uniqueLayers(items.map(i => i.layer)).map(async l => [l.id, await blobToDataUrl(l.imageBlob)] as const),
        ),
      )
    : new Map<string, string>();
  const svg = buildImpositionSvg({
    widthMm: state.boundaryWidthMm,
    heightMm: state.boundaryHeightMm,
    items,
    kinds,
    colors,
    imageDataUrls,
  });
  downloadText(svg, filename, SVG_MIME);
}
