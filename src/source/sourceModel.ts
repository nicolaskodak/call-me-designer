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
