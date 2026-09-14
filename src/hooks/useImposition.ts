import { useCallback, useEffect, useRef, useState } from 'react';
import { isTypingTarget } from '../editor/keyboard';
import { buildSourceLayer, pairUploadFiles, type SourceLayerInput } from '../imposition/layers';
import { loadUploadedLayer } from '../imposition/loadUploadedLayer';
import type { SheetSize } from '../imposition/sheetSizes';
import { addLayers, autoLayout, deleteInstance, enabledSizes, setLayerTotalCount, upsertSourceLayer } from '../imposition/state';
import { DEFAULT_IMPOSITION_STATE, type ImpositionLayer, type ImpositionState } from '../imposition/types';
import { newId } from '../utils/id';

export interface ImpositionApi {
  state: ImpositionState;
  update: (fn: (s: ImpositionState) => ImpositionState) => void;
  setLayerTotalCount: (layerId: string, total: number) => void;
  autoLayout: () => void;
  uploadPairs: (files: readonly File[]) => Promise<string[]>;
  sendFromSource: (input: Omit<SourceLayerInput, 'id' | 'imageUrl'>) => void;
}

const DELETE_KEYS = new Set(['x', 'delete', 'backspace']);

/** 圖層消失時釋放它的 object URL；unmount 時全部釋放 */
function useRevokeRemovedLayers(layers: readonly ImpositionLayer[]): void {
  const previous = useRef<readonly ImpositionLayer[]>([]);
  useEffect(() => {
    const alive = new Set(layers.map(l => l.imageUrl));
    previous.current.filter(l => !alive.has(l.imageUrl)).forEach(l => URL.revokeObjectURL(l.imageUrl));
    previous.current = layers;
  }, [layers]);
  useEffect(() => () => previous.current.forEach(l => URL.revokeObjectURL(l.imageUrl)), []);
}

export function useImposition(active: boolean, defaultDpi: number, sheetSizes: readonly SheetSize[]): ImpositionApi {
  const [state, setState] = useState<ImpositionState>(DEFAULT_IMPOSITION_STATE);
  const update = useCallback((fn: (s: ImpositionState) => ImpositionState) => setState(fn), []);
  useRevokeRemovedLayers(state.layers);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || !DELETE_KEYS.has(e.key.toLowerCase())) return;
      update(s => (s.selectedInstanceId ? deleteInstance(s, s.selectedInstanceId) : s));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, update]);

  const uploadPairs = useCallback(async (files: readonly File[]): Promise<string[]> => {
    const { pairs, unpaired } = pairUploadFiles(files);
    const results = await Promise.all(
      pairs.map(pair =>
        loadUploadedLayer(pair, defaultDpi).then(
          layer => ({ layer, failed: null }),
          (err: unknown) => {
            console.error('無法載入配對', pair.stem, err);
            return { layer: null, failed: pair.stem };
          },
        ),
      ),
    );
    const layers = results.flatMap(r => (r.layer ? [r.layer] : []));
    if (layers.length > 0) update(s => addLayers(s, layers, newId));
    return [...unpaired, ...results.flatMap(r => (r.failed ? [r.failed] : []))];
  }, [defaultDpi, update]);

  const sendFromSource = useCallback((input: Omit<SourceLayerInput, 'id' | 'imageUrl'>) => {
    // 圖層擁有自己的 URL，來源圖片換掉時不受影響
    const layer = buildSourceLayer({ ...input, id: newId(), imageUrl: URL.createObjectURL(input.blob) });
    update(s => upsertSourceLayer(s, layer, newId));
  }, [update]);

  return {
    state,
    update,
    setLayerTotalCount: (layerId, total) => update(s => setLayerTotalCount(s, layerId, total, newId)),
    autoLayout: () => update(s => autoLayout(s, enabledSizes(s, sheetSizes), newId)),
    uploadPairs,
    sendFromSource,
  };
}
