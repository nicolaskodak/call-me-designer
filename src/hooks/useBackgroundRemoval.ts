import { useCallback, useEffect, useRef, useState } from 'react';
import { createRemoveBgClient, RemoveBgError } from '../services/removeBg';
import type { Settings } from '../settings/schema';

export interface BackgroundRemovalApi {
  busy: boolean;
  error: string | null;
  remove: (input: Blob) => Promise<void>;
}

export function useBackgroundRemoval(settings: Settings, replaceCurrent: (blob: Blob) => Promise<void>): BackgroundRemovalApi {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { apiKey, size } = settings.removeBg;

  useEffect(() => () => abortRef.current?.abort(), []);

  const remove = useCallback(async (input: Blob) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError(null);
    try {
      const result = await createRemoveBgClient({ apiKey, size }).removeBackground(input, { signal: controller.signal });
      await replaceCurrent(result);
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

  return { busy, error, remove };
}
