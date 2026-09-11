import { describe, expect, it } from 'vitest';
import { CSS_PX_PER_MM } from '../units';
import { computeFitZoom } from './zoom';

describe('computeFitZoom', () => {
  it('fits the width when the width is the limiting side', () => {
    const expected = (600 - 48) / (297 * CSS_PX_PER_MM);
    expect(computeFitZoom(600, 2000, 297, 210, 24)).toBeCloseTo(expected, 10);
  });

  it('fits the height when the height is the limiting side', () => {
    const expected = (500 - 48) / (210 * CSS_PX_PER_MM);
    expect(computeFitZoom(3000, 500, 297, 210, 24)).toBeCloseTo(expected, 10);
  });

  it('clamps to the minimum zoom', () => {
    expect(computeFitZoom(100, 100, 5000, 5000, 24)).toBe(0.1);
  });

  it('clamps to the maximum zoom', () => {
    expect(computeFitZoom(10000, 10000, 10, 10, 24)).toBe(4);
  });

  it.each([
    ['zero viewport width', 0, 500, 297, 210, 24],
    ['negative viewport height', 500, -1, 297, 210, 24],
    ['zero boundary width', 500, 500, 0, 210, 24],
    ['NaN boundary height', 500, 500, 297, Number.NaN, 24],
    ['infinite viewport width', Number.POSITIVE_INFINITY, 500, 297, 210, 24],
    ['negative padding', 500, 500, 297, 210, -1],
  ])('returns 1 for %s', (_label, vw, vh, w, h, pad) => {
    expect(computeFitZoom(vw, vh, w, h, pad)).toBe(1);
  });
});
