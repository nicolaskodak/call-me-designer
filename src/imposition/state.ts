import { pxToMm } from '../units';
import { packIntoSheets } from './sheets';
import type { SheetSize } from './sheetSizes';
import type { ImpositionInstance, ImpositionLayer, ImpositionLayerKind, ImpositionSheet, ImpositionState } from './types';

export type IdFactory = () => string;

/** 版面設定或圖層變動後，上次排圖的結果就過期了；擺位保持不動，等使用者自己決定要不要重排 */
export const LAYOUT_STALE_MESSAGE = '圖層或設定有變動，請按「排圖」更新排版。';

/** 版面尺寸清單非空、但全部被停用時，排圖按鈕會停用；這句話同時是按鈕停用當下的訊息，也是面板上的提示文字 */
export const NO_ENABLED_SIZE_MESSAGE = '請先勾選至少一種版面尺寸。';

export function layerBoxMm(layer: ImpositionLayer, rotationDeg: 0 | 90): { w: number; h: number } {
  const w = pxToMm(layer.layoutBoxPx.width, layer.dpi);
  const h = pxToMm(layer.layoutBoxPx.height, layer.dpi);
  return rotationDeg === 90 ? { w: h, h: w } : { w, h };
}

const instancesFor = (layerId: string, count: number, newId: IdFactory, sheetId: string): ImpositionInstance[] =>
  Array.from({ length: count }, () => ({ id: newId(), layerId, sheetId, xMm: 0, yMm: 0, rotationDeg: 0 as const }));

export function addLayers(state: ImpositionState, layers: readonly ImpositionLayer[], newId: IdFactory): ImpositionState {
  return {
    ...state,
    layers: [...state.layers, ...layers],
    instances: [
      ...state.instances,
      ...layers.flatMap(l => instancesFor(l.id, Math.max(1, l.totalCount), newId, state.activeSheetId)),
    ],
    // 新項目都疊在 (0,0)，提示使用者重新排圖
    lastLayoutMessage: LAYOUT_STALE_MESSAGE,
  };
}

export function upsertSourceLayer(state: ImpositionState, incoming: ImpositionLayer, newId: IdFactory): ImpositionState {
  const existing = incoming.sourceId ? state.layers.find(l => l.sourceId === incoming.sourceId) : undefined;
  if (!existing) return addLayers(state, [{ ...incoming, totalCount: 1 }], newId);
  return {
    ...state,
    layers: state.layers.map(l => (l.id === existing.id ? { ...incoming, id: existing.id, totalCount: existing.totalCount } : l)),
    // 外框可能改變，需要重新排圖
    lastLayoutMessage: LAYOUT_STALE_MESSAGE,
  };
}

/** 沒有任何項目的版面就移除；至少保留一張，畫布才不會空白 */
const pruneEmptySheets = (state: ImpositionState): ImpositionState => {
  const used = new Set(state.instances.map(i => i.sheetId));
  const kept = state.sheets.filter(s => used.has(s.id));
  const sheets = kept.length > 0 ? kept : state.sheets.slice(0, 1);
  const activeSheetId = sheets.some(s => s.id === state.activeSheetId) ? state.activeSheetId : sheets[0]?.id ?? state.activeSheetId;
  return { ...state, sheets, activeSheetId };
};

const removeInstances = (state: ImpositionState, ids: ReadonlySet<string>): ImpositionState =>
  pruneEmptySheets({
    ...state,
    instances: state.instances.filter(i => !ids.has(i.id)),
    selectedInstanceId: state.selectedInstanceId && ids.has(state.selectedInstanceId) ? null : state.selectedInstanceId,
  });

const removeLayer = (state: ImpositionState, layerId: string): ImpositionState => {
  const ids = new Set(state.instances.filter(i => i.layerId === layerId).map(i => i.id));
  return { ...removeInstances(state, ids), layers: state.layers.filter(l => l.id !== layerId), lastLayoutMessage: LAYOUT_STALE_MESSAGE };
};

export function setLayerTotalCount(state: ImpositionState, layerId: string, totalCount: number, newId: IdFactory): ImpositionState {
  const total = Math.max(0, Math.floor(Number.isFinite(totalCount) ? totalCount : 0));
  if (total === 0) return removeLayer(state, layerId);

  const current = state.instances.filter(i => i.layerId === layerId);
  const layers = state.layers.map(l => (l.id === layerId ? { ...l, totalCount: total } : l));
  if (current.length > total) {
    const removed = new Set(current.slice(total).map(i => i.id));
    return { ...removeInstances({ ...state, layers }, removed), lastLayoutMessage: LAYOUT_STALE_MESSAGE };
  }
  return {
    ...state,
    layers,
    instances: [...state.instances, ...instancesFor(layerId, total - current.length, newId, state.activeSheetId)],
    lastLayoutMessage: LAYOUT_STALE_MESSAGE,
  };
}

export function deleteInstance(state: ImpositionState, instanceId: string): ImpositionState {
  const target = state.instances.find(i => i.id === instanceId);
  if (!target) return { ...state, selectedInstanceId: null };
  const remaining = removeInstances(state, new Set([instanceId]));
  const layer = state.layers.find(l => l.id === target.layerId);
  if (!layer) return { ...remaining, selectedInstanceId: null };

  const total = Math.max(0, layer.totalCount - 1);
  if (total === 0) return { ...removeLayer(remaining, layer.id), selectedInstanceId: null };
  return {
    ...remaining,
    layers: remaining.layers.map(l => (l.id === layer.id ? { ...l, totalCount: total } : l)),
    selectedInstanceId: null,
  };
}

export function autoLayout(state: ImpositionState, sizes: readonly SheetSize[], newId: IdFactory): ImpositionState {
  if (sizes.length === 0) return { ...state, lastLayoutMessage: NO_ENABLED_SIZE_MESSAGE };

  const base = state.allowRotate90 ? state.instances : state.instances.map(i => ({ ...i, rotationDeg: 0 as const }));
  const layerMap = new Map(state.layers.map(l => [l.id, l] as const));
  const rects = base.flatMap(inst => {
    const layer = layerMap.get(inst.layerId);
    if (!layer) return [];
    const { w, h } = layerBoxMm(layer, 0);
    return [{ id: inst.id, w: w + state.minGapMm, h: h + state.minGapMm }];
  });

  const result = packIntoSheets(rects, sizes, state.allowRotate90);
  const sheets = result.sheets.map(s => ({ id: newId(), sizeName: s.sizeName, widthMm: s.widthMm, heightMm: s.heightMm }));
  const placements = new Map(
    result.sheets.flatMap((s, index) => s.placed.map(p => [p.id, { sheetId: sheets[index].id, placement: p }] as const)),
  );
  const instances = base.map(inst => {
    const hit = placements.get(inst.id);
    return hit
      ? { ...inst, sheetId: hit.sheetId, xMm: hit.placement.x, yMm: hit.placement.y, rotationDeg: hit.placement.rotationDeg }
      : { ...inst, sheetId: null };
  });

  const placedCount = instances.length - result.notPlaced.length;
  const notPlacedNote = result.notPlaced.length > 0 ? `，放不下 ${result.notPlaced.length} 個` : '';
  const rotateNote = state.allowRotate90 ? '（允許 90° 旋轉）' : '';
  // 排不出任何版面時（例如全部項目都放不下），保留一張舊版面，畫布才不會空白；
  // 與 pruneEmptySheets「至少保留一張」的既有不變式一致
  const nextSheets = sheets.length > 0 ? sheets : state.sheets.slice(0, 1);
  return {
    ...state,
    sheets: nextSheets,
    // 一定要從 nextSheets（實際回傳的版面清單）取值，不能沿用舊的 activeSheetId：
    // 排圖前選到的版面可能不是保留下來的那一張，沿用會指向一張已經不存在的版面
    activeSheetId: nextSheets[0]?.id ?? state.activeSheetId,
    instances,
    lastLayoutMessage: `排圖完成：${sheets.length} 個版面，排入 ${placedCount} 個${notPlacedNote}。${rotateNote}`,
  };
}

export const moveInstance = (state: ImpositionState, id: string, xMm: number, yMm: number): ImpositionState => ({
  ...state,
  instances: state.instances.map(i => (i.id === id ? { ...i, xMm, yMm } : i)),
});

export const selectInstance = (state: ImpositionState, id: string | null): ImpositionState => ({
  ...state,
  selectedInstanceId: id,
});

export const setAllowRotate = (state: ImpositionState, allow: boolean): ImpositionState => ({
  ...state,
  allowRotate90: allow,
  instances: allow ? state.instances : state.instances.map(i => ({ ...i, rotationDeg: 0 as const })),
  lastLayoutMessage: LAYOUT_STALE_MESSAGE,
});

export const selectSheet = (state: ImpositionState, sheetId: string): ImpositionState =>
  state.sheets.some(s => s.id === sheetId) ? { ...state, activeSheetId: sheetId, selectedInstanceId: null } : state;

/** 該版面已放置項目（含間距）佔版面面積的比例，0–1 */
export function sheetUsage(state: ImpositionState, sheetId: string): number {
  const sheet = state.sheets.find(s => s.id === sheetId);
  if (!sheet) return 0;
  const layerMap = new Map(state.layers.map(l => [l.id, l] as const));
  const used = state.instances
    .filter(i => i.sheetId === sheetId)
    .reduce((sum, i) => {
      const layer = layerMap.get(i.layerId);
      if (!layer) return sum;
      const { w, h } = layerBoxMm(layer, 0);
      return sum + (w + state.minGapMm) * (h + state.minGapMm);
    }, 0);
  return used / (sheet.widthMm * sheet.heightMm);
}

/**
 * 有實際內容（至少一個項目引用著存在的圖層）的版面，依 state.sheets 原本順序。
 * SVG（`placedItems`／`buildSheetSvgs`）與 PDF（`ImpositionCanvas.exportPDF`）匯出都用這個函式
 * 決定要匯出哪些版面：兩邊各自維護一份「哪張版面算有內容」的判準，遲早會因為其中一邊改動
 * 而悄悄產生「SVG N 檔、PDF M 頁」的落差；共用同一個 selector 讓這個判準只有一個真相來源。
 */
export function sheetsWithContent(state: ImpositionState): ImpositionSheet[] {
  const layerIds = new Set(state.layers.map(l => l.id));
  const sheetIdsWithContent = new Set(
    state.instances.filter(i => i.sheetId !== null && layerIds.has(i.layerId)).map(i => i.sheetId as string),
  );
  return state.sheets.filter(s => sheetIdsWithContent.has(s.id));
}

/**
 * 有實際內容的圖層種類，只計入已排進版面（instance.sheetId 不是 null 且引用著存在的圖層——
 * 判準與 sheetsWithContent 一致）的圖層：
 * - artwork：只要有任何已排入的圖層就算有（每個圖層都有 imageUrl）
 * - underprint：任一已排入的圖層 underprint 非 null 且長度 > 0
 * - cut：任一已排入的圖層 cut.kind === 'svg'，或 cut.kind === 'paths' 且 paths.length > 0
 *
 * PDF（ImpositionCanvas.exportPDF）與 SVG（exportSvg.buildLayeredExportFiles）的分層匯出都用
 * 這個函式決定要輸出哪幾層——sheetsWithContent 已經因為「PDF 與 SVG 各寫一套版面內容判準、
 * 靠別處的不變式才碰巧一致」這個教訓收斂成單一函式，這裡沿用同樣的做法，不要重蹈覆轍。
 * 回傳順序固定為 ['artwork', 'underprint', 'cut'] 的子集。
 */
export function kindsWithContent(state: ImpositionState): ImpositionLayerKind[] {
  const placedLayerIds = new Set(state.instances.filter(i => i.sheetId !== null).map(i => i.layerId));
  const placed = state.layers.filter(l => placedLayerIds.has(l.id));
  const kinds: ImpositionLayerKind[] = [];
  if (placed.length > 0) kinds.push('artwork');
  if (placed.some(l => l.underprint !== null && l.underprint.length > 0)) kinds.push('underprint');
  if (placed.some(l => l.cut.kind === 'svg' || (l.cut.kind === 'paths' && l.cut.paths.length > 0))) kinds.push('cut');
  return kinds;
}

export const toggleSheetSize = (state: ImpositionState, name: string): ImpositionState => ({
  ...state,
  disabledSizeNames: state.disabledSizeNames.includes(name)
    ? state.disabledSizeNames.filter(n => n !== name)
    : [...state.disabledSizeNames, name],
  lastLayoutMessage: LAYOUT_STALE_MESSAGE,
});

/**
 * 設定頁刪掉的尺寸會自然從結果消失；殘留在停用名單裡的名稱，只要沒有被重用就不影響。
 * 名稱一旦被重用（例如刪掉「新尺寸」後再新增一個同樣叫「新尺寸」的尺寸），
 * 就會沿用舊尺寸留下的停用狀態——這是刻意的解耦（設定層不知道拼版層的停用狀態），不在本次修正範圍。
 */
export const enabledSizes = (state: ImpositionState, all: readonly SheetSize[]): SheetSize[] =>
  all.filter(s => !state.disabledSizeNames.includes(s.name));
