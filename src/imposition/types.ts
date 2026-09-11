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

export interface ImpositionInstance {
  id: string;
  layerId: string;
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
  boundaryWidthMm: number;
  boundaryHeightMm: number;
  minGapMm: number;
  allowRotate90: boolean;
  zoom: number;
  show: ImpositionShow;
  layers: ImpositionLayer[];
  instances: ImpositionInstance[];
  selectedInstanceId: string | null;
  notPlacedInstanceIds: string[];
  lastLayoutMessage: string | null;
}

export const DEFAULT_IMPOSITION_STATE: ImpositionState = {
  boundaryWidthMm: 297,
  boundaryHeightMm: 210,
  minGapMm: 3,
  allowRotate90: false,
  zoom: 1,
  show: { artwork: true, underprint: true, cut: true },
  layers: [],
  instances: [],
  selectedInstanceId: null,
  notPlacedInstanceIds: [],
  lastLayoutMessage: null,
};

export const ZOOM_OPTIONS: readonly number[] = [0.25, 0.5, 1, 2, 4];
