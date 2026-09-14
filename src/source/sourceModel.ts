import type { AlphaImage } from '../geometry/types';

export type DpiSource = 'metadata' | 'default' | 'manual';

export interface ImageVersion {
  versionId: string;
  blob: Blob;
  url: string;
  widthPx: number;
  heightPx: number;
  dpi: number;
  dpiSource: DpiSource;
  alpha: AlphaImage;
  transparent: boolean;
}

export interface SourceImage {
  /** 上傳時產生，去背或還原都不變；Imposition 用它對應同一個來源 */
  id: string;
  name: string;
  current: ImageVersion;
  /** 去背前的原圖；沒有去背時為 null */
  original: ImageVersion | null;
}

export const LARGE_IMAGE_PIXELS = 40_000_000;

export const fileStem = (filename: string): string => filename.replace(/\.[^.]+$/, '');

export const scaleDpiForWidth = (dpi: number, oldWidthPx: number, newWidthPx: number): number =>
  (dpi * newWidthPx) / oldWidthPx;

export const withManualDpi = (source: SourceImage, dpi: number): SourceImage => ({
  ...source,
  current: { ...source.current, dpi, dpiSource: 'manual' },
});

export const isLargeImage = (v: ImageVersion): boolean => v.widthPx * v.heightPx > LARGE_IMAGE_PIXELS;

const SOURCE_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const SOURCE_IMAGE_EXTENSIONS = /\.(png|jpe?g|webp)$/i;

export interface DroppedSourceImage {
  /** 要使用的圖檔；沒有可用的就是 null */
  file: File | null;
  /** 要提示使用者的訊息；沒問題就是 null */
  warning: string | null;
}

/**
 * 從拖放進來的檔案裡挑出一張來源圖片。
 *
 * 拖放不受 input 的 accept 限制，使用者什麼都拖得進來，所以要自己過濾；
 * 而且從檔案總管拖進來時 type 有時是空字串，那就只剩副檔名可以判斷。
 * 混在一起的不相干檔案安靜忽略，只有「一張都沒有」或「不只一張」才提示。
 */
export function pickDroppedSourceImage(files: readonly File[]): DroppedSourceImage {
  const images = files.filter(f => SOURCE_IMAGE_TYPES.includes(f.type) || SOURCE_IMAGE_EXTENSIONS.test(f.name));
  if (images.length === 0) return { file: null, warning: '請拖入 PNG／JPG／WebP 圖片。' };
  const [first] = images;
  return { file: first, warning: images.length > 1 ? `一次只能處理一張圖，已使用 ${first.name}。` : null };
}
