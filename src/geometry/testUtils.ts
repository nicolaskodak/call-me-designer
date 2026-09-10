import type { AlphaImage } from './types';

export type Mask = (x: number, y: number) => boolean;

export function makeAlpha(width: number, height: number, inside: Mask, value = 255): AlphaImage {
  const alpha = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (inside(x, y)) alpha[y * width + x] = value;
    }
  }
  return { width, height, alpha };
}

export const rect = (x0: number, y0: number, w: number, h: number): Mask =>
  (x, y) => x >= x0 && x < x0 + w && y >= y0 && y < y0 + h;

export const disc = (cx: number, cy: number, r: number): Mask =>
  (x, y) => (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r;

export const anyOf = (...masks: Mask[]): Mask => (x, y) => masks.some(m => m(x, y));

export const minus = (a: Mask, b: Mask): Mask => (x, y) => a(x, y) && !b(x, y);
