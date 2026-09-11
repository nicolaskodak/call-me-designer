import { describe, expect, it } from 'vitest';
import { hasTransparency } from './alpha';

describe('hasTransparency', () => {
  it('is false when every pixel is opaque', () => {
    expect(hasTransparency(new Uint8ClampedArray([255, 255, 255]))).toBe(false);
  });

  it('is true when any pixel is not fully opaque', () => {
    expect(hasTransparency(new Uint8ClampedArray([255, 254, 255]))).toBe(true);
    expect(hasTransparency([0])).toBe(true);
  });

  it('is false for an empty image', () => {
    expect(hasTransparency([])).toBe(false);
  });
});
