export interface SheetSize {
  name: string;
  widthMm: number;
  heightMm: number;
}

/** 開箱預設的常見版面尺寸（寬×高，只用表列方向，不另外試轉 90°）。使用者可在設定頁增刪。 */
export const DEFAULT_SHEET_SIZES: readonly SheetSize[] = [
  { name: 'A4', widthMm: 297, heightMm: 210 },
  { name: 'A3', widthMm: 420, heightMm: 297 },
  { name: 'SRA3', widthMm: 450, heightMm: 320 },
  { name: 'A3+', widthMm: 483, heightMm: 329 },
  { name: '菊八開', widthMm: 390, heightMm: 270 },
  { name: '菊四開', widthMm: 540, heightMm: 390 },
  { name: '菊對開', widthMm: 780, heightMm: 540 },
];
