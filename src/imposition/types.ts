import type { PathData } from '../types';
import type { ParsedSvg } from '../utils/sanitizeSvg';

export interface LayoutBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type CutLayerData = { kind: 'paths'; paths: PathData[] } | { kind: 'svg'; svg: ParsedSvg };

export interface ImpositionLayer {
  id: string;
  /** 從 Editor／Underprint 送來時是來源圖片 id；手動上傳為 null */
  sourceId: string | null;
  name: string;
  imageBlob: Blob;
  /** 圖層自己擁有的 object URL，圖層刪除時 revoke */
  imageUrl: string;
  widthPx: number;
  heightPx: number;
  dpi: number;
  cut: CutLayerData;
  underprint: PathData[] | null;
  /** 排版用的外框（原圖 px 座標，可能超出原圖範圍） */
  layoutBoxPx: LayoutBox;
  totalCount: number;
}

export interface ImpositionSheet {
  id: string;
  /** 來自哪個尺寸定義，供分頁標籤顯示 */
  sizeName: string;
  widthMm: number;
  heightMm: number;
}

export interface ImpositionInstance {
  id: string;
  layerId: string;
  /** null＝沒有任何啟用尺寸放得下 */
  sheetId: string | null;
  /** 所屬版面內的相對座標 */
  xMm: number;
  yMm: number;
  rotationDeg: 0 | 90;
}

export interface ImpositionShow {
  artwork: boolean;
  underprint: boolean;
  cut: boolean;
}

export interface ImpositionState {
  minGapMm: number;
  allowRotate90: boolean;
  zoom: number;
  show: ImpositionShow;
  layers: ImpositionLayer[];
  instances: ImpositionInstance[];
  sheets: ImpositionSheet[];
  activeSheetId: string;
  selectedInstanceId: string | null;
  lastLayoutMessage: string | null;
  /** 這次排圖不使用的尺寸名稱；空陣列＝全部啟用 */
  disabledSizeNames: string[];
}

const DEFAULT_SHEET: ImpositionSheet = { id: 'sheet-1', sizeName: 'A4', widthMm: 297, heightMm: 210 };

export const DEFAULT_IMPOSITION_STATE: ImpositionState = {
  minGapMm: 3,
  allowRotate90: false,
  zoom: 1,
  show: { artwork: true, underprint: true, cut: true },
  layers: [],
  instances: [],
  sheets: [DEFAULT_SHEET],
  activeSheetId: DEFAULT_SHEET.id,
  selectedInstanceId: null,
  lastLayoutMessage: null,
  disabledSizeNames: [],
};

export const ZOOM_OPTIONS: readonly number[] = [0.25, 0.5, 1, 2, 4];
