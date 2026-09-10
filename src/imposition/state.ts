import { pxToMm } from '../units';
import { packWithinBoundary } from './packing';
import type { ImpositionInstance, ImpositionLayer, ImpositionState } from './types';

export type IdFactory = () => string;

export function layerBoxMm(layer: ImpositionLayer, rotationDeg: 0 | 90): { w: number; h: number } {
  const w = pxToMm(layer.layoutBoxPx.width, layer.dpi);
  const h = pxToMm(layer.layoutBoxPx.height, layer.dpi);
  return rotationDeg === 90 ? { w: h, h: w } : { w, h };
}

const instancesFor = (layerId: string, count: number, newId: IdFactory): ImpositionInstance[] =>
  Array.from({ length: count }, () => ({ id: newId(), layerId, xMm: 0, yMm: 0, rotationDeg: 0 as const }));

export function addLayers(state: ImpositionState, layers: readonly ImpositionLayer[], newId: IdFactory): ImpositionState {
  return {
    ...state,
    layers: [...state.layers, ...layers],
    instances: [...state.instances, ...layers.flatMap(l => instancesFor(l.id, Math.max(1, l.totalCount), newId))],
    notPlacedInstanceIds: [],
    lastLayoutMessage: null,
  };
}

export function upsertSourceLayer(state: ImpositionState, incoming: ImpositionLayer, newId: IdFactory): ImpositionState {
  const existing = incoming.sourceId ? state.layers.find(l => l.sourceId === incoming.sourceId) : undefined;
  if (!existing) return addLayers(state, [{ ...incoming, totalCount: 1 }], newId);
  return {
    ...state,
    layers: state.layers.map(l => (l.id === existing.id ? { ...incoming, id: existing.id, totalCount: existing.totalCount } : l)),
    // 外框可能改變，需要重新排圖
    notPlacedInstanceIds: [],
    lastLayoutMessage: null,
  };
}

const removeInstances = (state: ImpositionState, instancesToRemove: ReadonlySet<ImpositionInstance>): ImpositionState => {
  const removeIds = new Set<string>();
  instancesToRemove.forEach(inst => removeIds.add(inst.id));
  return {
    ...state,
    instances: state.instances.filter(i => !instancesToRemove.has(i)),
    notPlacedInstanceIds: state.notPlacedInstanceIds.filter(id => !removeIds.has(id)),
    selectedInstanceId: state.selectedInstanceId && removeIds.has(state.selectedInstanceId) ? null : state.selectedInstanceId,
  };
};

const removeLayer = (state: ImpositionState, layerId: string): ImpositionState => {
  const instToRemove = new Set(state.instances.filter(i => i.layerId === layerId));
  return { ...removeInstances(state, instToRemove), layers: state.layers.filter(l => l.id !== layerId), lastLayoutMessage: null };
};

export function setLayerTotalCount(state: ImpositionState, layerId: string, totalCount: number, newId: IdFactory): ImpositionState {
  const total = Math.max(0, Math.floor(Number.isFinite(totalCount) ? totalCount : 0));
  if (total === 0) return removeLayer(state, layerId);

  const current = state.instances.filter(i => i.layerId === layerId);
  const layers = state.layers.map(l => (l.id === layerId ? { ...l, totalCount: total } : l));
  if (current.length > total) {
    const removed = new Set(current.slice(total));
    return { ...removeInstances({ ...state, layers }, removed), lastLayoutMessage: null };
  }
  return {
    ...state,
    layers,
    instances: [...state.instances, ...instancesFor(layerId, total - current.length, newId)],
    lastLayoutMessage: null,
  };
}

export function deleteInstance(state: ImpositionState, instanceId: string): ImpositionState {
  const target = state.instances.find(i => i.id === instanceId);
  if (!target) return { ...state, selectedInstanceId: null };
  const remaining = removeInstances(state, new Set([target]));
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

export function autoLayout(state: ImpositionState): ImpositionState {
  const base = state.allowRotate90 ? state.instances : state.instances.map(i => ({ ...i, rotationDeg: 0 as const }));
  const layerMap = new Map(state.layers.map(l => [l.id, l] as const));
  const rects = base.flatMap(inst => {
    const layer = layerMap.get(inst.layerId);
    if (!layer) return [];
    const { w, h } = layerBoxMm(layer, 0);
    return [{ id: inst.id, w: w + state.minGapMm, h: h + state.minGapMm }];
  });

  const result = packWithinBoundary(rects, state.boundaryWidthMm, state.boundaryHeightMm, state.allowRotate90);
  const placed = new Map(result.placed.map(p => [p.id, p] as const));
  const instances = base.map(inst => {
    const p = placed.get(inst.id);
    return p ? { ...inst, xMm: p.x, yMm: p.y, rotationDeg: p.rotationDeg } : inst;
  });
  const rotateNote = state.allowRotate90 ? '（允許 90° 旋轉）' : '';
  return {
    ...state,
    instances,
    notPlacedInstanceIds: result.notPlaced,
    lastLayoutMessage: `排圖完成：塞得進去 ${result.placed.length} 個，塞不進去 ${result.notPlaced.length} 個。${rotateNote}`,
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
  notPlacedInstanceIds: [],
  lastLayoutMessage: null,
});
