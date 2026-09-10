import React, { useEffect } from 'react';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, message, confirmLabel, cancelLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60">
      <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="w-96 max-w-[90vw] rounded-lg bg-neutral-800 border border-neutral-600 p-5 space-y-4 shadow-2xl">
        <h2 id="confirm-title" className="text-white font-semibold">{title}</h2>
        <p className="text-sm text-neutral-300">{message}</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} data-testid="cancel-overwrite" className="px-3 py-1.5 rounded text-sm bg-neutral-700 hover:bg-neutral-600 text-white">
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} data-testid="confirm-overwrite" className="px-3 py-1.5 rounded text-sm bg-red-600 hover:bg-red-500 text-white">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
