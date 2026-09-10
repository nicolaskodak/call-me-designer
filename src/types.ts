/** 一條 SVG 路徑（圖片 px 座標）。白墨的 CompoundPath 會帶 fillRule。 */
export interface PathData {
  d: string;
  fillRule?: 'evenodd';
}

export interface DisplayStyle {
  showOriginal: boolean;
  showPoints: boolean;
  fillColor: string;
  fillOpacity: number;
  strokeColor: string;
  strokeOpacity: number;
  strokeWidth: number;
}

export const DEFAULT_CUT_STYLE: DisplayStyle = {
  showOriginal: true,
  showPoints: true,
  fillColor: '#3b82f6',
  fillOpacity: 0.3,
  strokeColor: '#ef4444',
  strokeOpacity: 1,
  strokeWidth: 3,
};

export const DEFAULT_UNDERPRINT_STYLE: DisplayStyle = {
  showOriginal: true,
  showPoints: true,
  fillColor: '#ffffff',
  fillOpacity: 0.7,
  strokeColor: '#22d3ee',
  strokeOpacity: 1,
  strokeWidth: 1,
};

export type ActiveTab = 'editor' | 'underprint' | 'imposition';