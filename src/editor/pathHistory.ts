export interface HistoryState {
  readonly entries: readonly string[];
  readonly index: number;
}

export const EMPTY_HISTORY: HistoryState = { entries: [], index: -1 };

export const resetHistory = (snapshot: string): HistoryState => ({ entries: [snapshot], index: 0 });

export const pushHistory = (h: HistoryState, snapshot: string): HistoryState => ({
  entries: [...h.entries.slice(0, h.index + 1), snapshot],
  index: h.index + 1,
});

export const undoHistory = (h: HistoryState): HistoryState =>
  h.index > 0 ? { ...h, index: h.index - 1 } : h;

export const redoHistory = (h: HistoryState): HistoryState =>
  h.index < h.entries.length - 1 ? { ...h, index: h.index + 1 } : h;

export const currentSnapshot = (h: HistoryState): string | null => h.entries[h.index] ?? null;

export const canUndo = (h: HistoryState): boolean => h.index > 0;

export const canRedo = (h: HistoryState): boolean => h.index < h.entries.length - 1;

/** 第一筆是產生路徑時的基準；index 大於 0 代表有手動編輯 */
export const isDirty = (h: HistoryState): boolean => h.index > 0;
