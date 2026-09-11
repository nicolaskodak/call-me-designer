import type { AlphaImage } from '../geometry/types';

export function hasTransparency(alpha: ArrayLike<number>): boolean {
  for (let i = 0; i < alpha.length; i++) {
    if (alpha[i] < 255) return true;
  }
  return false;
}

/** 畫到 canvas 後取出 alpha 通道。只能在瀏覽器使用。 */
export function extractAlpha(source: CanvasImageSource & { width: number; height: number }): AlphaImage {
  const { width, height } = source;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('無法建立 canvas 2D context');
  ctx.drawImage(source, 0, 0);
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const alpha = new Uint8ClampedArray(width * height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
  return { width, height, alpha };
}
