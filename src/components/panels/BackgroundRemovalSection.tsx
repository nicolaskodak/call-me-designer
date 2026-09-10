import { Eraser, RotateCcw, Settings } from 'lucide-react';
import React from 'react';
import type { RemoveBgSize } from '../../settings/schema';
import type { SourceImage } from '../../source/sourceModel';
import { ActionButton, Warnings } from './fields';

interface BackgroundRemovalSectionProps {
  source: SourceImage | null;
  hasKey: boolean;
  size: RemoveBgSize;
  busy: boolean;
  error: string | null;
  onRemove: () => void;
  onRevert: () => void;
  onOpenSettings: () => void;
}

const PREVIEW_HINT = 'preview 免費但解析度低（約 0.25 MP），實際尺寸不變，有效 DPI 會下降。';

export function BackgroundRemovalSection({ source, hasKey, size, busy, error, onRemove, onRevert, onOpenSettings }: BackgroundRemovalSectionProps) {
  if (!source) return null;
  return (
    <div className="space-y-2">
      {!source.current.transparent ? (
        <div className="p-2 rounded bg-amber-900/30 border border-amber-700 text-[11px] text-amber-200">
          此圖沒有透明背景，無法產生輪廓。
        </div>
      ) : null}
      {hasKey ? (
        <ActionButton onClick={onRemove} disabled={busy} testId="remove-bg-button">
          <Eraser className="w-3 h-3" /> {busy ? '去背中…' : '用 remove.bg 去背'}
        </ActionButton>
      ) : (
        <ActionButton onClick={onOpenSettings} testId="remove-bg-settings">
          <Settings className="w-3 h-3" /> 前往設定填寫 remove.bg API key
        </ActionButton>
      )}
      {source.original ? (
        <ActionButton onClick={onRevert} disabled={busy} testId="revert-original">
          <RotateCcw className="w-3 h-3" /> 還原原圖
        </ActionButton>
      ) : null}
      {hasKey && size === 'preview' ? <p className="text-[10px] text-neutral-500">{PREVIEW_HINT}</p> : null}
      <Warnings messages={error ? [error] : []} />
    </div>
  );
}
