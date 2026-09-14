import { detachBlob } from '../utils/detachBlob';
import { readDpiFromBlob } from '../utils/dpi';
import { newId } from '../utils/id';
import { loadImage } from '../utils/imageProcessing';
import { parseUploadedSvg } from '../utils/sanitizeSvg';
import type { UploadPair } from './layers';
import { measureParsedSvg } from './measureSvg';
import type { ImpositionLayer } from './types';

export async function loadUploadedLayer(pair: UploadPair, defaultDpi: number): Promise<ImpositionLayer> {
  // 先與磁碟脫鉤再用：pair.image 是 File，檔案被改寫或移走之後讀取會失敗
  const image = await detachBlob(pair.image);
  const imageUrl = URL.createObjectURL(image);
  try {
    const [img, dpi, svgText] = await Promise.all([loadImage(imageUrl), readDpiFromBlob(image), pair.svg.text()]);
    const widthPx = img.naturalWidth;
    const heightPx = img.naturalHeight;
    const svg = parseUploadedSvg(svgText, widthPx, heightPx);
    return {
      id: newId(),
      sourceId: null,
      name: pair.stem,
      imageBlob: image,
      imageUrl,
      widthPx,
      heightPx,
      dpi: dpi ?? defaultDpi,
      cut: { kind: 'svg', svg },
      underprint: null,
      layoutBoxPx: measureParsedSvg(svg, widthPx, heightPx),
      totalCount: 1,
    };
  } catch (err) {
    URL.revokeObjectURL(imageUrl);
    throw err;
  }
}
