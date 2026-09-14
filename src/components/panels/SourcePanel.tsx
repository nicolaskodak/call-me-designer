import { Upload } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useFileDrop } from '../../hooks/useFileDrop';
import { isLargeImage, pickDroppedSourceImage, type DpiSource, type SourceImage } from '../../source/sourceModel';
import { DPI_MAX, DPI_MIN, formatMm, isValidDpi, pxToMm } from '../../units';
import { Section, Warnings } from './fields';

const DPI_SOURCE_LABEL: Record<DpiSource, string> = { metadata: '來自圖檔', default: '預設值', manual: '手動' };

interface SourcePanelProps {
  source: SourceImage | null;
  loading: boolean;
  error: string | null;
  onUpload: (file: File) => void;
  onDpiChange: (dpi: number) => void;
  children?: React.ReactNode; // 第 6 階段放去背按鈕
}

function DpiField({ dpi, source, onCommit }: { dpi: number; source: DpiSource; onCommit: (dpi: number) => void }) {
  const shown = String(Number(dpi.toFixed(1)));
  const [draft, setDraft] = useState(shown);
  useEffect(() => setDraft(shown), [shown]);

  const commit = () => {
    const value = Number(draft);
    if (isValidDpi(value) && value !== dpi) onCommit(value);
    else setDraft(shown);
  };

  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      <span className="text-neutral-400">DPI（{DPI_SOURCE_LABEL[source]}）</span>
      <input
        type="number"
        min={DPI_MIN}
        max={DPI_MAX}
        value={draft}
        data-testid="source-dpi"
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
        }}
        className="w-24 px-2 py-1 rounded bg-neutral-700 border border-neutral-600 text-white text-right"
      />
    </label>
  );
}

export function SourcePanel({ source, loading, error, onUpload, onDpiChange, children }: SourcePanelProps) {
  const v = source?.current;
  const [dropWarning, setDropWarning] = useState<string | null>(null);

  // 走和點擊上傳同一個 onUpload，覆蓋確認與「換圖時中止去背」才會一致
  const { isOver, dropProps } = useFileDrop(files => {
    const { file, warning } = pickDroppedSourceImage(files);
    setDropWarning(warning);
    if (file) onUpload(file);
  });

  const warnings = [
    ...(v && isLargeImage(v) ? ['圖片很大，處理可能較慢。'] : []),
    ...(v && v.dpi < DPI_MIN ? ['有效 DPI 偏低，印刷可能不夠清晰。'] : []),
    ...(dropWarning ? [dropWarning] : []),
    ...(error ? [error] : []),
  ];
  const tone = isOver ? 'border-blue-500 bg-blue-500/10' : 'border-neutral-600 hover:border-blue-500 hover:bg-neutral-700/50';

  return (
    <Section title="來源圖片">
      <label
        {...dropProps}
        data-testid="source-dropzone"
        data-drag-over={isOver ? 'true' : undefined}
        className={`flex flex-col items-center justify-center w-full h-20 border-2 border-dashed rounded-lg transition cursor-pointer ${tone}`}
      >
        <Upload className="w-6 h-6 mb-1 text-neutral-500" />
        <span className="text-xs text-neutral-400">{loading ? '載入中…' : isOver ? '放開以上傳' : '點擊或拖曳上傳 PNG／JPG／WebP'}</span>
        <input
          type="file"
          className="hidden"
          accept="image/png,image/jpeg,image/webp"
          data-testid="source-upload"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) onUpload(file);
            e.target.value = '';
          }}
        />
      </label>
      {v && source ? (
        <div className="space-y-2">
          <div className="text-xs text-neutral-300 truncate" title={source.name}>{source.name}</div>
          <div className="text-[11px] text-neutral-500">
            {v.widthPx} × {v.heightPx} px ／ {formatMm(pxToMm(v.widthPx, v.dpi))} × {formatMm(pxToMm(v.heightPx, v.dpi))}
          </div>
          <DpiField dpi={v.dpi} source={v.dpiSource} onCommit={onDpiChange} />
        </div>
      ) : null}
      {children}
      <Warnings messages={warnings} />
    </Section>
  );
}
