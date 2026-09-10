export const MM_PER_INCH = 25.4;
export const CSS_PX_PER_MM = 96 / MM_PER_INCH;
export const DPI_MIN = 72;
export const DPI_MAX = 2400;
export const DEFAULT_DPI = 300;

export const mmToPx = (mm: number, dpi: number): number => (mm / MM_PER_INCH) * dpi;

export const pxToMm = (px: number, dpi: number): number => (px * MM_PER_INCH) / dpi;

export const mm2ToPx2 = (mm2: number, dpi: number): number => mm2 * (dpi / MM_PER_INCH) ** 2;

export const isValidDpi = (dpi: number): boolean =>
  Number.isFinite(dpi) && dpi >= DPI_MIN && dpi <= DPI_MAX;

export const formatMm = (mm: number, digits = 1): string => `${mm.toFixed(digits)} mm`;
