import { extractAlpha, hasTransparency } from '../utils/alpha';
import { readDpiFromBlob } from '../utils/dpi';
import { newId } from '../utils/id';
import { loadImage } from '../utils/imageProcessing';
import type { ImageVersion } from './sourceModel';

export async function loadImageVersion(blob: Blob, defaultDpi: number): Promise<ImageVersion> {
  const url = URL.createObjectURL(blob);
  try {
    const [img, metadataDpi] = await Promise.all([loadImage(url), readDpiFromBlob(blob)]);
    const alpha = extractAlpha(img);
    return {
      versionId: newId(),
      blob,
      url,
      widthPx: alpha.width,
      heightPx: alpha.height,
      dpi: metadataDpi ?? defaultDpi,
      dpiSource: metadataDpi ? 'metadata' : 'default',
      alpha,
      transparent: hasTransparency(alpha.alpha),
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}
