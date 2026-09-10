import { FileText, Upload } from 'lucide-react';
import React from 'react';
import type { ImpositionState } from '../../types';

interface ImpositionPanelProps {
  impositionState: ImpositionState;
  setImpositionState: React.Dispatch<React.SetStateAction<ImpositionState>>;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSetLayerTotalCount: (layerId: string, totalCount: number) => void;
  onAutoLayout: () => void;
  onExportPDF: () => void;
}

const inputClass = 'w-full px-2 py-1 rounded bg-neutral-700 border border-neutral-600 text-white text-xs';
const headingClass = 'text-neutral-200 font-semibold text-xs uppercase tracking-wider';

export function ImpositionPanel({ impositionState: s, setImpositionState, onUpload, onSetLayerTotalCount, onAutoLayout, onExportPDF }: ImpositionPanelProps) {
  const setNumber = (key: 'boundaryWidth' | 'boundaryHeight' | 'minGap') => (e: React.ChangeEvent<HTMLInputElement>) =>
    setImpositionState(prev => ({ ...prev, [key]: Math.max(0, Number(e.target.value) || 0) }));

  return (
    <>
      <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-neutral-600 rounded-lg hover:border-blue-500 hover:bg-neutral-700/50 transition cursor-pointer">
        <Upload className="w-8 h-8 mb-2 text-neutral-500" />
        <p className="text-xs text-neutral-400 text-center"><span className="font-semibold">Click to upload</span> image + SVG (multiple)</p>
        <p className="text-[10px] text-neutral-500 mt-1 text-center">Pairing: same filename stem (cat.png + cat.svg)</p>
        <input type="file" className="hidden" multiple accept="image/*,image/svg+xml,.svg" onChange={onUpload} />
      </label>

      <div className="space-y-4">
        <h2 className={headingClass}>Imposition Boundary</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-xs text-neutral-400">Width (px)
            <input type="number" min={100} value={s.boundaryWidth} onChange={setNumber('boundaryWidth')} className={inputClass} />
          </label>
          <label className="space-y-1 text-xs text-neutral-400">Height (px)
            <input type="number" min={100} value={s.boundaryHeight} onChange={setNumber('boundaryHeight')} className={inputClass} />
          </label>
        </div>
        <div className="flex items-center justify-between p-2 bg-neutral-700/30 rounded border border-neutral-700 text-xs">
          <span className="text-neutral-400">Items</span>
          <span className="text-white font-mono">{s.instances.length}</span>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className={headingClass}>Layout</h2>
        <label className="space-y-1 text-xs text-neutral-400 block">Min Gap (px)
          <input type="number" min={0} value={s.minGap} onChange={setNumber('minGap')} className={inputClass} />
        </label>
        <label className="flex items-center justify-between gap-3 p-2 bg-neutral-700/30 rounded border border-neutral-700 text-xs text-neutral-400">
          允許 90° 旋轉
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={s.allowRotate90}
            onChange={e => {
              const allow = e.target.checked;
              setImpositionState(prev => ({
                ...prev,
                allowRotate90: allow,
                instances: allow ? prev.instances : prev.instances.map(i => ({ ...i, rotationDeg: 0 as const })),
                notPlacedInstanceIds: [],
                lastLayoutMessage: null,
              }));
            }}
          />
        </label>
        <button type="button" onClick={onAutoLayout} disabled={s.instances.length === 0} className="w-full py-2 rounded text-xs text-white bg-neutral-700 hover:bg-neutral-600 disabled:opacity-30">
          排圖
        </button>
        <button
          type="button"
          onClick={onExportPDF}
          disabled={s.instances.length === 0 || s.notPlacedInstanceIds.length === s.instances.length}
          title="只匯出塞得進去的項目（不含淺黃色項目）"
          className="w-full flex items-center justify-center gap-2 py-2 rounded text-xs text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-30"
        >
          <FileText className="w-3 h-3" /> 匯出 PDF（排除塞不進）
        </button>
        {s.lastLayoutMessage ? (
          <div className="p-2 rounded bg-neutral-900 border border-neutral-700 text-[10px] text-neutral-300">{s.lastLayoutMessage}</div>
        ) : null}
      </div>

      <div className="space-y-3">
        <h2 className={headingClass}>Layers</h2>
        {s.layers.length === 0 ? (
          <div className="text-[10px] text-neutral-500">No layers yet. Upload image + SVG pairs.</div>
        ) : (
          s.layers.map(layer => (
            <div key={layer.id} className="flex items-center gap-2 p-2 rounded bg-neutral-700/20 border border-neutral-700">
              <img src={layer.imageUrl} alt={layer.name} className="w-8 h-8 rounded object-contain bg-neutral-900" draggable={false} />
              <div className="flex-1 min-w-0">
                <div className="text-neutral-200 text-xs truncate">{layer.name}</div>
                <div className="text-[10px] text-neutral-500">{layer.width}×{layer.height}</div>
              </div>
              <label className="flex items-center gap-2 text-[10px] text-neutral-400">總數
                <input
                  type="number"
                  min={0}
                  value={layer.totalCount}
                  onChange={e => onSetLayerTotalCount(layer.id, Number(e.target.value) || 0)}
                  className="w-16 px-2 py-1 rounded bg-neutral-800 border border-neutral-600 text-white text-xs"
                  title="總數為 1 代表只有 1 個；設為 0 代表刪除該圖層"
                />
              </label>
            </div>
          ))
        )}
      </div>
    </>
  );
}
