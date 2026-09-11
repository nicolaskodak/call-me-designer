import { useEffect, useState } from 'react';
import type { GeometryClient } from '../geometry/client';
import type { ImageVersion } from '../source/sourceModel';

/** 把目前的圖片版本送進 worker，回傳 worker 已載入的 versionId */
export function useWorkerImage(client: GeometryClient | null, version: ImageVersion | null): string | null {
  const [readyId, setReadyId] = useState<string | null>(null);
  const versionId = version?.versionId ?? null;
  const alpha = version?.alpha ?? null;

  useEffect(() => {
    if (!client || !versionId || !alpha) {
      setReadyId(null);
      return;
    }
    client.setImage(versionId, alpha);
    setReadyId(versionId);
    return () => client.dropImage(versionId);
  }, [client, versionId, alpha]);

  return readyId;
}
