import { useEffect, useState } from 'react';
import type { GeometryClient, JobParams } from '../geometry/client';
import type { GeometryJobKind, GeometryResult } from '../geometry/types';
import { useDebouncedValue } from './useDebouncedValue';

export type GeometryStatus = 'idle' | 'processing' | 'ready' | 'error';

export interface GeometryState {
  status: GeometryStatus;
  result: GeometryResult | null;
  error: string | null;
}

const IDLE: GeometryState = { status: 'idle', result: null, error: null };
export const GEOMETRY_DEBOUNCE_MS = 150;

export function useGeometry<K extends GeometryJobKind>(
  client: GeometryClient | null,
  kind: K,
  imageId: string | null,
  params: JobParams[K] | null,
  delayMs = GEOMETRY_DEBOUNCE_MS,
): GeometryState {
  const debounced = useDebouncedValue(params, delayMs);
  const [state, setState] = useState<GeometryState>(IDLE);

  // 換圖時先清掉上一張圖的結果
  useEffect(() => setState(IDLE), [imageId]);

  useEffect(() => {
    if (!client || !imageId || !debounced) return;
    let cancelled = false;
    setState(s => ({ ...s, status: 'processing' }));
    client
      .run(kind, imageId, debounced)
      .then(result => {
        if (!cancelled && result) setState({ status: 'ready', result, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error('幾何運算失敗', err);
        const message = err instanceof Error ? err.message : String(err);
        setState(s => ({ status: 'error', result: s.result, error: message }));
      });
    return () => {
      cancelled = true;
    };
  }, [client, kind, imageId, debounced]);

  return state;
}
