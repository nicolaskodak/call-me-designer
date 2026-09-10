import { describe, expect, it } from 'vitest';
import { CSS_PX_PER_MM, formatMm, isValidDpi, mm2ToPx2, mmToPx, pxToMm } from './units';

describe('units', () => {
  it('converts mm to px', () => {
    expect(mmToPx(25.4, 300)).toBe(300);
    expect(mmToPx(2, 300)).toBeCloseTo(23.622, 3);
  });

  it('converts px to mm and back', () => {
    expect(pxToMm(300, 300)).toBe(25.4);
    expect(mmToPx(pxToMm(123.4, 150), 150)).toBeCloseTo(123.4, 9);
  });

  it('converts areas with the square of the scale', () => {
    expect(mm2ToPx2(1, 25.4)).toBe(1);
    expect(mm2ToPx2(0.5, 300)).toBeCloseTo(69.75, 1);
  });

  it('validates dpi range', () => {
    expect(isValidDpi(72)).toBe(true);
    expect(isValidDpi(2400)).toBe(true);
    expect(isValidDpi(71)).toBe(false);
    expect(isValidDpi(2401)).toBe(false);
    expect(isValidDpi(Number.NaN)).toBe(false);
    expect(isValidDpi(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it('formats mm', () => {
    expect(formatMm(2.345)).toBe('2.3 mm');
    expect(formatMm(2, 2)).toBe('2.00 mm');
  });

  it('exposes css px per mm', () => {
    expect(CSS_PX_PER_MM).toBeCloseTo(3.7795, 4);
  });
});
