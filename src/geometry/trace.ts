import { contours } from 'd3-contour';
import type { AlphaImage, Point, Ring } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 水平與垂直各一次的 box blur；和舊版 blurAlphaChannel 的結果完全相同 */
export function blurAlpha(alpha: ArrayLike<number>, width: number, height: number, radius: number): Uint8Array {
  const len = width * height;
  const source = Uint8Array.from({ length: len }, (_, i) => alpha[i]);
  if (radius <= 0) return source;

  const count = radius * 2 + 1;
  const temp = new Uint8Array(len);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += source[y * width + clamp(x + k, 0, width - 1)];
      temp[y * width + x] = sum / count;
    }
  }

  const out = new Uint8Array(len);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += temp[clamp(y + k, 0, height - 1) * width + x];
      out[y * width + x] = sum / count;
    }
  }
  return out;
}

const openRing = (ring: Point[]): Ring => {
  if (ring.length < 2) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : ring;
};

/** 在 threshold 取等值線；座標系與圖片 px 相同（像素 i 佔 [i, i+1]） */
export function traceRings(values: ArrayLike<number>, width: number, height: number, threshold: number): Ring[] {
  const [multiPolygon] = contours().size([width, height]).thresholds([threshold])(values as unknown as number[]);
  if (!multiPolygon) return [];
  return multiPolygon.coordinates.flatMap(polygon =>
    polygon.map(ring => openRing(ring.map(([x, y]) => [x, y] as const))),
  );
}

export const tracePrecise = (img: AlphaImage, alphaThreshold: number): Ring[] =>
  traceRings(img.alpha, img.width, img.height, alphaThreshold);

export const traceLegacy = (img: AlphaImage, blurPx: number, threshold: number): Ring[] =>
  traceRings(blurAlpha(img.alpha, img.width, img.height, Math.max(1, blurPx)), img.width, img.height, threshold);
