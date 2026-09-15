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

/**
 * 幾何還沒算完：idle（還沒開始，例如 debounce 還沒觸發）或 processing（正在算）。
 * error 不算「還沒算完」——那是已經算完但失敗，繼續當成 pending 會讓依賴這個判斷的
 * UI（例如「送到 Imposition」按鈕）永久卡住，使用者連重試的入口都沒有。
 *
 * CutlinePanel 與 UnderprintPanel 都用這個函式判斷白墨幾何是否還在算，避免兩邊
 * 各寫一份「還沒算完」的定義又漸漸分岔——這個專案已經因為同樣的理由把「哪張版面
 * 算有內容」收斂成 sheetsWithContent、「哪個圖層算有內容」收斂成 kindsWithContent，
 * 這裡沿用同一個教訓。
 */
export const isGeometryPending = (status: GeometryStatus): boolean => status !== 'ready' && status !== 'error';

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
