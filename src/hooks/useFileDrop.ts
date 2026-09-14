import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';

export interface FileDropProps {
  onDragEnter: (e: DragEvent) => void;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
}

export interface FileDropResult {
  /** 目前有檔案懸停在上面，用來顯示高亮 */
  isOver: boolean;
  dropProps: FileDropProps;
}

/**
 * 檔案拖放。dragenter／dragleave 會在子元素之間冒泡，
 * 所以用計數器判斷是否真的離開整個投放區。
 */
export function useFileDrop(onFiles: (files: File[]) => void): FileDropResult {
  const depth = useRef(0);
  const [isOver, setIsOver] = useState(false);

  const onDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    depth.current += 1;
    setIsOver(true);
  }, []);

  const onDragOver = useCallback((e: DragEvent) => {
    // 不 preventDefault 的話瀏覽器不會觸發 drop
    e.preventDefault();
  }, []);

  const onDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setIsOver(false);
  }, []);

  const onDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    depth.current = 0;
    setIsOver(false);
    // 專案沒裝 @types/react，DragEvent 實質是 any，Array.from(any) 會被推導成
    // unknown[]；這個斷言是必要的，移除會讓 typecheck 報 TS2345。
    const files = Array.from(e.dataTransfer?.files ?? []) as File[];
    if (files.length > 0) onFiles(files);
  }, [onFiles]);

  return { isOver, dropProps: { onDragEnter, onDragOver, onDragLeave, onDrop } };
}

/** 擋掉「拖到非投放區時瀏覽器直接開檔」的預設行為 */
export function useBlockWindowFileDrop(): void {
  useEffect(() => {
    const block = (e: Event) => e.preventDefault();
    window.addEventListener('dragover', block);
    window.addEventListener('drop', block);
    return () => {
      window.removeEventListener('dragover', block);
      window.removeEventListener('drop', block);
    };
  }, []);
}
