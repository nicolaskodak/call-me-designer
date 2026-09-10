import { useCallback, useMemo, useRef, useState, type RefObject } from 'react';
import type { PathEditorHandle } from '../editor/PathEditorCanvas';
import type { PathData } from '../types';

export interface EditorSlot {
  ref: RefObject<PathEditorHandle | null>;
  canUndo: boolean;
  canRedo: boolean;
  segmentCount: number;
  dirty: boolean;
  paths: PathData[];
  clearDirty: () => void;
  callbacks: {
    onHistoryChange: (canUndo: boolean, canRedo: boolean) => void;
    onSegmentCount: (count: number) => void;
    onDirtyChange: (dirty: boolean) => void;
    onPathsChange: (paths: PathData[]) => void;
  };
}

export function useEditorSlot(): EditorSlot {
  const ref = useRef<PathEditorHandle | null>(null);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [segmentCount, setSegmentCount] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [paths, setPaths] = useState<PathData[]>([]);

  const onHistoryChange = useCallback((canUndo: boolean, canRedo: boolean) => setHistory({ canUndo, canRedo }), []);
  const clearDirty = useCallback(() => setDirty(false), []);
  const callbacks = useMemo(
    () => ({ onHistoryChange, onSegmentCount: setSegmentCount, onDirtyChange: setDirty, onPathsChange: setPaths }),
    [onHistoryChange],
  );

  return { ref, ...history, segmentCount, dirty, paths, clearDirty, callbacks };
}
