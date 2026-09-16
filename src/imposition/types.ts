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

/** 三個可獨立輸出的圖層種類；與 ImpositionShow 的鍵一一對應 */
export type ImpositionLayerKind = 'artwork' | 'underprint' | 'cut';

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
  /**
   * 目前的擺位不是「排圖」跑出來的結果（剛上傳、改份數、改尺寸勾選、切換旋轉都會變 true）。
   * 匯出把關用這個旗標：沒排過圖就匯出，會拿到初始那張與清單無關的版面尺寸。
   */
  layoutStale: boolean;
  /** 這次排圖不使用的尺寸名稱；空陣列＝全部啟用 */
  disabledSizeNames: string[];
}

const DEFAULT_SHEET: ImpositionSheet = { id: 'sheet-1', sizeName: 'A4', widthMm: 297, heightMm: 210 };

export const DEFAULT_IMPOSITION_STATE: ImpositionState = {
  minGapMm: 3,
  // 預設允許旋轉：現行清單裡最小的幾張版面全是直式，關掉旋轉時一張 400×100 的圖
  // 會從 310×420 跳到 565×405（實測 1.76 倍面積）。有方向性的圖再由使用者關掉。
  allowRotate90: true,
  zoom: 1,
  show: { artwork: true, underprint: true, cut: true },
  layers: [],
  instances: [],
  sheets: [DEFAULT_SHEET],
  activeSheetId: DEFAULT_SHEET.id,
  selectedInstanceId: null,
  lastLayoutMessage: null,
  // 初始沒有任何項目，談不上過期；第一次上傳圖層就會被 markLayoutStale 設成 true
  layoutStale: false,
  disabledSizeNames: [],
};

export const ZOOM_OPTIONS: readonly number[] = [0.25, 0.5, 1, 2, 4];
