import { RotateCcw, RotateCw } from 'lucide-react';
import React from 'react';
import { InfoRow, Section } from './fields';

interface EditSectionProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  segmentCount: number;
  nodeCountTestId: string;
  children?: React.ReactNode;
}

const buttonClass =
  'flex-1 flex items-center justify-center gap-2 py-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded text-xs transition disabled:opacity-30 disabled:cursor-not-allowed';

export function EditSection({ canUndo, canRedo, onUndo, onRedo, segmentCount, nodeCountTestId, children }: EditSectionProps) {
  return (
    <Section title="路徑編輯">
      <div className="flex gap-2">
        <button type="button" onClick={onUndo} disabled={!canUndo} className={buttonClass} title="Undo (Ctrl/Cmd+Z)">
          <RotateCcw className="w-3 h-3" /> Undo
        </button>
        <button type="button" onClick={onRedo} disabled={!canRedo} className={buttonClass} title="Redo (Ctrl/Cmd+Shift+Z)">
          <RotateCw className="w-3 h-3" /> Redo
        </button>
      </div>
      {children}
      <InfoRow label="節點數" value={segmentCount} testId={nodeCountTestId} />
    </Section>
  );
}
