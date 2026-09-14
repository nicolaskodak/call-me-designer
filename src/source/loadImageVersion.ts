import { extractAlpha, hasTransparency } from '../utils/alpha';
import { detachBlob } from '../utils/detachBlob';
import { readDpiFromBlob } from '../utils/dpi';
import { newId } from '../utils/id';
import { loadImage } from '../utils/imageProcessing';
import type { ImageVersion } from './sourceModel';

export async function loadImageVersion(source: Blob, defaultDpi: number): Promise<ImageVersion> {
  // 先與磁碟脫鉤再用：傳進來的可能是 File，而 File 只是檔案參照，
  // 檔案被改寫或移走之後讀取會失敗（匯出分層 SVG 時就會踩到）
  const blob = await detachBlob(source);
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
