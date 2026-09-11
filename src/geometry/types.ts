export type Point = readonly [number, number];
export type Ring = readonly Point[];

export interface Polygon {
  readonly outer: Ring;
  readonly holes: readonly Ring[];
}

export interface AlphaImage {
  readonly width: number;
  readonly height: number;
  readonly alpha: Uint8ClampedArray;
}

export type CutlineMode = 'precise' | 'legacy';
export type BridgeMode = 'auto' | 'manual';

/** 面板使用的刀模參數（mm） */
export interface CutlineParams {
  mode: CutlineMode;
  alphaThreshold: number;
  offsetMm: number;
  legacyBlurPx: number;
  legacyThreshold: number;
  minIslandAreaMm2: number;
  singleConnected: boolean;
  bridgeMode: BridgeMode;
  bridgeRadiusMm: number;
  bridgeMaxMm: number;
  smoothness: number;
}

/** 面板使用的白墨參數（mm） */
export interface UnderprintParams {
  alphaThreshold: number;
  insetMm: number;
  minIslandAreaMm2: number;
  fillHoles: boolean;
  smoothness: number;
}

/** 送進 worker 的刀模參數（px）。smoothness 在主執行緒套用，不會送進來。 */
export interface CutlineParamsPx {
  mode: CutlineMode;
  alphaThreshold: number;
  offsetPx: number;
  legacyBlurPx: number;
  legacyThreshold: number;
  minIslandAreaPx2: number;
  singleConnected: boolean;
  bridgeMode: BridgeMode;
  bridgeRadiusPx: number;
  bridgeMaxPx: number;
  bridgePrecisionPx: number;
}

export interface UnderprintParamsPx {
  alphaThreshold: number;
  insetPx: number;
  minIslandAreaPx2: number;
  fillHoles: boolean;
}

export interface GeometryStats {
  islandCount: number;
  bridgeRadiusPx?: number;
}

export interface GeometryResult {
  polygons: Polygon[];
  warnings: string[];
  stats: GeometryStats;
}

export type GeometryJobKind = 'cutline' | 'underprint';

export type WorkerRequest =
  | { type: 'setImage'; imageId: string; width: number; height: number; alpha: Uint8ClampedArray }
  | { type: 'dropImage'; imageId: string }
  | { type: 'cutline'; jobId: number; imageId: string; params: CutlineParamsPx }
  | { type: 'underprint'; jobId: number; imageId: string; params: UnderprintParamsPx };

export type WorkerResponse =
  | ({ type: 'result'; jobId: number } & GeometryResult)
  | { type: 'error'; jobId: number; message: string };
