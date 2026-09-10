import { useCallback, useEffect, useRef, useState } from 'react';
import { loadImageVersion } from '../source/loadImageVersion';
import {
  fileStem,
  scaleDpiForWidth,
  withManualDpi,
  type ImageVersion,
  type SourceImage,
} from '../source/sourceModel';
import { newId } from '../utils/id';

export interface SourceImageApi {
  source: SourceImage | null;
  loading: boolean;
  error: string | null;
  upload(file: File): Promise<void>;
  setDpi(dpi: number): void;
  /** 只有載入完成時目前的來源仍是 expectedSourceId 才套用；中途換了圖就丟棄 */
  replaceCurrent(blob: Blob, expectedSourceId: string): Promise<void>;
  revertToOriginal(): void;
}

const LOAD_ERROR = '無法載入圖片，請確認檔案是 PNG、JPG 或 WebP。';

const revoke = (v: ImageVersion | null | undefined) => {
  if (v) URL.revokeObjectURL(v.url);
};

export function useSourceImage(defaultDpi: number): SourceImageApi {
  const [source, setSource] = useState<SourceImage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sourceRef = useRef<SourceImage | null>(null);
  sourceRef.current = source;
  // 每次上傳遞增；載入完成時已經不是最新一次的上傳就丟棄
  const uploadSeqRef = useRef(0);

  // unmount 時釋放所有 URL
  useEffect(() => () => {
    revoke(sourceRef.current?.current);
    revoke(sourceRef.current?.original);
  }, []);

  const run = useCallback(async (task: () => Promise<void>) => {
    setLoading(true);
    setError(null);
    try {
      await task();
    } catch (err) {
      console.error('載入圖片失敗', err);
      setError(LOAD_ERROR);
    } finally {
      setLoading(false);
    }
  }, []);

  const upload = useCallback((file: File) => run(async () => {
    uploadSeqRef.current += 1;
    const seq = uploadSeqRef.current;
    const version = await loadImageVersion(file, defaultDpi);
    if (seq !== uploadSeqRef.current) {
      revoke(version);
      return;
    }
    const previous = sourceRef.current;
    setSource({ id: newId(), name: fileStem(file.name), current: version, original: null });
    revoke(previous?.current);
    revoke(previous?.original);
  }), [defaultDpi, run]);

  const replaceCurrent = useCallback((blob: Blob, expectedSourceId: string) => run(async () => {
    const loaded = await loadImageVersion(blob, defaultDpi);
    const previous = sourceRef.current;
    // 等待期間換了圖：結果屬於舊的來源，不能套到新圖上
    if (!previous || previous.id !== expectedSourceId) {
      revoke(loaded);
      return;
    }
    const prev = previous.current;
    const version: ImageVersion = {
      ...loaded,
      dpi: scaleDpiForWidth(prev.dpi, prev.widthPx, loaded.widthPx),
      dpiSource: prev.dpiSource,
    };
    setSource({ ...previous, current: version, original: previous.original ?? prev });
    // 已經去背過一次時，被取代的是中間版本，可以釋放
    if (previous.original) revoke(prev);
  }), [defaultDpi, run]);

  const revertToOriginal = useCallback(() => {
    const previous = sourceRef.current;
    if (!previous?.original) return;
    setSource({ ...previous, current: previous.original, original: null });
    revoke(previous.current);
  }, []);

  const setDpi = useCallback((dpi: number) => {
    setSource(s => (s ? withManualDpi(s, dpi) : s));
  }, []);

  return { source, loading, error, upload, setDpi, replaceCurrent, revertToOriginal };
}
