import { useCallback, useEffect, useRef, useState } from 'react';
import { createRemoveBgClient, RemoveBgError } from '../services/removeBg';
import type { Settings } from '../settings/schema';

export interface BackgroundRemovalApi {
  busy: boolean;
  error: string | null;
  remove: (input: Blob, sourceId: string) => Promise<void>;
  /** 中止進行中的去背請求（例如換了圖） */
  cancel: () => void;
}

export function useBackgroundRemoval(
  settings: Settings,
  replaceCurrent: (blob: Blob, expectedSourceId: string) => Promise<void>,
): BackgroundRemovalApi {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { apiKey, size } = settings.removeBg;

  useEffect(() => () => abortRef.current?.abort(), []);

  const remove = useCallback(async (input: Blob, sourceId: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError(null);
    try {
      const result = await createRemoveBgClient({ apiKey, size }).removeBackground(input, { signal: controller.signal });
      await replaceCurrent(result, sourceId);
    } catch (err) {
      if (controller.signal.aborted) return;
      if (!(err instanceof RemoveBgError)) console.error('去背失敗', err);
      setError(err instanceof RemoveBgError ? err.message : '去背失敗，請再試一次。');
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setBusy(false);
      }
    }
  }, [apiKey, size, replaceCurrent]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
  }, []);

  return { busy, error, remove, cancel };
}
