import { Settings2 } from 'lucide-react';
import React from 'react';
import type { ActiveTab } from '../types';

export interface TabDef {
  id: ActiveTab;
  label: string;
}

interface SidebarProps {
  tabs: readonly TabDef[];
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export function Sidebar({ tabs, activeTab, onTabChange, footer, children }: SidebarProps) {
  return (
    <aside className="w-80 shrink-0 bg-neutral-800 border-r border-neutral-700 flex flex-col h-full overflow-y-auto text-sm select-none">
      <div className="p-4 border-b border-neutral-700">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-blue-500" />
          Contour Crafted
        </h1>
        <p className="text-neutral-400 text-xs mt-1">刀模、白墨與排版</p>
        <nav className="mt-3 grid grid-cols-2 gap-2">
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              data-testid={`tab-${tab.id}`}
              onClick={() => onTabChange(tab.id)}
              className={`py-2 rounded text-xs transition border ${
                activeTab === tab.id
                  ? 'bg-neutral-700 text-white border-neutral-600'
                  : 'bg-neutral-800 text-neutral-300 border-neutral-700 hover:bg-neutral-700/40'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="p-4 space-y-6 flex-1">{children}</div>
      {footer ? (
        <div className="p-4 bg-neutral-900 border-t border-neutral-700 text-[10px] text-neutral-500 space-y-2">{footer}</div>
      ) : null}
    </aside>
  );
}
