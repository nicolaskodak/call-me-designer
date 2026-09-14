import type { ImpositionSheet } from '../imposition/types';

interface SheetTabsProps {
  sheets: readonly ImpositionSheet[];
  activeSheetId: string;
  /** 版面 id → 使用率（0–1） */
  usageById: ReadonlyMap<string, number>;
  onSelect: (sheetId: string) => void;
}

/** 只有一張版面時不佔畫面 */
export function SheetTabs({ sheets, activeSheetId, usageById, onSelect }: SheetTabsProps) {
  if (sheets.length <= 1) return null;
  return (
    <div className="flex gap-1 overflow-x-auto p-2 bg-neutral-900/80 border-b border-neutral-800" data-testid="sheet-tabs">
      {sheets.map((sheet, index) => {
        const active = sheet.id === activeSheetId;
        const usage = Math.round((usageById.get(sheet.id) ?? 0) * 100);
        return (
          <button
            key={sheet.id}
            type="button"
            onClick={() => onSelect(sheet.id)}
            aria-current={active ? 'page' : undefined}
            data-testid={`sheet-tab-${index + 1}`}
            className={`shrink-0 px-3 py-1 rounded text-xs transition ${active ? 'bg-blue-600 text-white' : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'}`}
          >
            版面 {index + 1}（{sheet.sizeName}）{usage}%
          </button>
        );
      })}
    </div>
  );
}
