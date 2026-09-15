import type { ImpositionLayerKind } from './types';

export interface StageColors {
  cut: string;
  underprint: string;
  /**
   * 白墨路徑的 fillOpacity。畫面即時畫布不帶這個欄位，元件端用 DEFAULT_UNDERPRINT_OPACITY
   * 當預設值，讓使用者能透過半透明看穿疊圖；PDF／SVG 分層匯出的白墨那一輪則透過
   * pdfLayerColors 覆寫成 1——印刷分色版的白墨必須是實墨，不能是畫面用的網點，否則
   * 白墨會變薄，甚至被 RIP 當成半調網目處理。
   *
   * 顏色本身維持設定值（預設真白 #FFFFFF），不覆寫：白墨的內容本來就是白色，
   * 在白底檢視器打開看起來一片空白是正確的——檢視困難要靠呈現方式解決（例如提示文字、
   * 或在支援深色背景的工具中開啟），不是竄改匯出資料本身。
   */
  underprintOpacity?: number;
}

/** 畫面即時畫布使用的白墨不透明度；只在元件端當預設值使用，PDF／SVG 匯出不會沿用它 */
export const DEFAULT_UNDERPRINT_OPACITY = 0.8;

/**
 * PDF 分層匯出時，依這一輪要輸出的 kind 決定暫存區截圖用的顏色／不透明度。
 * 只有白墨那一輪需要覆寫：把不透明度改成 1（實墨），不是畫面用的 0.8 網點；
 * 顏色本身照設定值走，不覆寫成任何固定色（白墨就是要維持真白）。
 * 其餘層（原圖／刀模）原樣傳回，不受影響。純函式、不牽涉 DOM，方便單元測試直接驗證，
 * 也不會動到傳入的 colors 物件本身。
 */
export function pdfLayerColors(kind: ImpositionLayerKind, colors: StageColors): StageColors {
  return kind === 'underprint' ? { ...colors, underprintOpacity: 1 } : colors;
}
