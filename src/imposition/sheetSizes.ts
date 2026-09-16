export interface SheetSize {
  name: string;
  widthMm: number;
  heightMm: number;
}

/**
 * 開箱預設的版面尺寸（寬×高，只用表列方向，不另外試轉 90°）。使用者可在設定頁增刪。
 *
 * 尺寸來源：名稱裡的 4 位數字就是公分（「3040」名稱後面自己寫了 (300x400) 佐證）。
 * 最後三筆原始標示是像素，以 300 DPI 換算後四捨五入到整數 mm（誤差 < 0.1mm：
 * 皮革小方實為 565.07×405.05，證件套／迷你CD 為 630.00×430.02）。
 * 300 DPI 這個假設的佐證是「證件套 7441×5079 px → 630×430mm」剛好等於
 * 另一套命名的「6343 → 63×43cm」。
 */
export const DEFAULT_SHEET_SIZES: readonly SheetSize[] = [
  { name: 'RO【3040 UV直噴】壓克力套版V8切割用 (300x400)', widthMm: 300, heightMm: 400 },
  { name: 'RO【3142 UV仿柯 單片】PET套版_2509V13', widthMm: 310, heightMm: 420 },
  { name: 'RO【3143 CCD】0.8mm壓克力 (250509改)', widthMm: 310, heightMm: 430 },
  { name: 'RO【3244 UV仿柯 雙片】PET套版_2509V14', widthMm: 320, heightMm: 440 },
  { name: 'RO【3448 UV仿柯 雙面】PET套版 (15x20cm4模用)_2509V4', widthMm: 340, heightMm: 480 },
  { name: 'RO【6242 CCD】8_10mm', widthMm: 620, heightMm: 420 },
  { name: 'RO【6343 CCD】常規壓克力', widthMm: 630, heightMm: 430 },
  { name: 'RO【6650 CCD】2_3_4mm壓克力', widthMm: 660, heightMm: 500 },
  { name: '皮革小方(圖) 鏡 6674 x 4784 (35)', widthMm: 565, heightMm: 405 },
  { name: '證件套 7441 x 5079 (25)', widthMm: 630, heightMm: 430 },
  { name: '迷你CD吊飾 7441 x 5079 (96)', widthMm: 630, heightMm: 430 },
];
