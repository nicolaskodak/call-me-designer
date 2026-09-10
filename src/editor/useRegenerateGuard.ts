import { useCallback, useState } from 'react';
import type { ConfirmDialogProps } from '../components/ConfirmDialog';
import { buildOverwriteMessage } from './guardMessage';

interface Pending {
  affected: readonly string[];
  action: () => void;
}

export interface RegenerateGuard {
  /** affected 為會被覆蓋的分頁名稱；空陣列時直接執行 */
  guard(affected: readonly string[], action: () => void): void;
  dialog: ConfirmDialogProps;
}

export function useRegenerateGuard(): RegenerateGuard {
  const [pending, setPending] = useState<Pending | null>(null);

  const guard = useCallback((affected: readonly string[], action: () => void) => {
    if (affected.length === 0) action();
    // 拖拉桿時會連續觸發，保留最後一次的值
    else setPending({ affected, action });
  }, []);

  const onCancel = useCallback(() => setPending(null), []);
  const onConfirm = useCallback(() => {
    pending?.action();
    setPending(null);
  }, [pending]);

  return {
    guard,
    dialog: {
      open: pending !== null,
      title: '覆蓋手動編輯？',
      message: pending ? buildOverwriteMessage(pending.affected) : '',
      confirmLabel: '覆蓋並套用',
      cancelLabel: '取消',
      onConfirm,
      onCancel,
    },
  };
}
