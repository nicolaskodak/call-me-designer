import React from 'react';
import PathEditorCanvas, { type OutlineMode, type PathEditorHandle } from '../editor/PathEditorCanvas';
import type { GeometryState } from '../hooks/useGeometry';
import type { SourceImage } from '../source/sourceModel';
import type { DisplayStyle, PathData } from '../types';

export interface GeometryViewProps {
  source: SourceImage | null;
  geometry: GeometryState;
  editorRef: React.Ref<PathEditorHandle>;
  mode: OutlineMode;
  style: DisplayStyle;
  smoothness: number;
  referencePaths?: readonly PathData[];
  active: boolean;
  testId: string;
  onHistoryChange: (canUndo: boolean, canRedo: boolean) => void;
  onSegmentCount: (count: number) => void;
  onDirtyChange: (dirty: boolean) => void;
  onPathsChange: (paths: PathData[]) => void;
}

function EmptyState() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-500 pointer-events-none">
      <div className="w-24 h-24 mb-4 border-2 border-dashed border-neutral-700 rounded-xl flex items-center justify-center opacity-50">
        <span className="text-4xl">🖼️</span>
      </div>
      <p className="text-lg font-medium">尚未載入圖片</p>
      <p className="text-sm opacity-60">上傳 PNG、JPG 或 WebP 開始產生路徑。</p>
    </div>
  );
}

export function GeometryView(props: GeometryViewProps) {
  const { source, geometry, editorRef, testId, ...editorProps } = props;
  if (!source) return <EmptyState />;
  const { current } = source;
  return (
    <div className="absolute inset-0">
      <PathEditorCanvas
        ref={editorRef}
        imageUrl={current.url}
        widthPx={current.widthPx}
        heightPx={current.heightPx}
        polygons={geometry.result?.polygons ?? null}
        testId={testId}
        {...editorProps}
      />
      <div
        className="absolute top-3 right-3 px-2 py-1 rounded bg-black/60 text-xs text-white pointer-events-none"
        data-testid={`${testId}-status`}
        data-status={geometry.status}
      >
        {geometry.status === 'processing' ? '計算中…' : geometry.status === 'error' ? '產生路徑失敗' : ''}
      </div>
      {geometry.error ? (
        <div className="absolute bottom-3 left-3 right-3 p-2 rounded bg-red-900/70 text-xs text-red-100">{geometry.error}</div>
      ) : null}
    </div>
  );
}
