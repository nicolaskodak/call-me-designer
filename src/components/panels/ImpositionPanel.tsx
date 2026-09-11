import { Download, FileText, Upload } from 'lucide-react';
import React from 'react';
import { layerBoxMm, setAllowRotate } from '../../imposition/state';
import { ZOOM_OPTIONS, type ImpositionShow, type ImpositionState } from '../../imposition/types';
import { formatMm } from '../../units';
import { ActionButton, InfoRow, Section, SelectField, ToggleField } from './fields';

interface ImpositionPanelProps {
  state: ImpositionState;
  update: (fn: (s: ImpositionState) => ImpositionState) => void;
  onUpload: (files: File[]) => void;
  onSetLayerTotalCount: (layerId: string, total: number) => void;
  onAutoLayout: () => void;
  onFitZoom: () => void;
  onExportLayers: () => void;
  onExportCut: () => void;
  onExportUnderprint: () => void;
  onExportPdf: () => void;
}

const SHOW_LABELS: readonly [keyof ImpositionShow, string][] = [
  ['artwork', '顯示原圖'],
  ['underprint', '顯示白墨'],
  ['cut', '顯示刀模'],
];

/** 固定的縮放選項；目前縮放來自「符合視窗」而不在選項裡時，多加一個選項讓選單能顯示它 */
const zoomOptionsFor = (zoom: number): { value: string; label: string }[] => {
  const options = ZOOM_OPTIONS.map(z => ({ value: String(z), label: `${z * 100}%` }));
  if (ZOOM_OPTIONS.includes(zoom)) return options;
  const fit = { value: String(zoom), label: `${Math.round(zoom * 100)}%（符合視窗）` };
  return [...options, fit].sort((a, b) => Number(a.value) - Number(b.value));
};

function MmInput({ label, value, min, onChange }: { label: string; value: number; min: number; onChange: (v: number) => void }) {
  return (
    <label className="block space-y-1 text-xs text-neutral-400">
      {label}
      <input
        type="number"
        min={min}
        step={0.5}
        value={value}
        onChange={e => onChange(Math.max(min, Number(e.target.value) || 0))}
        className="w-full px-2 py-1 rounded bg-neutral-700 border border-neutral-600 text-white text-xs"
      />
    </label>
  );
}

function UploadBox({ onUpload }: { onUpload: (files: File[]) => void }) {
  return (
    <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-neutral-600 rounded-lg hover:border-blue-500 hover:bg-neutral-700/50 transition cursor-pointer">
      <Upload className="w-6 h-6 mb-1 text-neutral-500" />
      <span className="text-xs text-neutral-400">上傳「圖＋SVG」配對（可多選）</span>
      <span className="text-[10px] text-neutral-500">同檔名配對，例如 cat.png + cat.svg</span>
      <input
        type="file"
        className="hidden"
        multiple
        accept="image/*,image/svg+xml,.svg"
        data-testid="imposition-upload"
        onChange={e => {
          onUpload(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
    </label>
  );
}

function LayerList({ state, onSetLayerTotalCount }: Pick<ImpositionPanelProps, 'state' | 'onSetLayerTotalCount'>) {
  if (state.layers.length === 0) return <div className="text-[10px] text-neutral-500">還沒有圖層。</div>;
  return (
    <div className="space-y-2">
      {state.layers.map(layer => {
        const { w, h } = layerBoxMm(layer, 0);
        return (
          <div key={layer.id} className="flex items-center gap-2 p-2 rounded bg-neutral-700/20 border border-neutral-700">
            <img src={layer.imageUrl} alt={layer.name} className="w-8 h-8 rounded object-contain bg-neutral-900" draggable={false} />
            <div className="flex-1 min-w-0">
              <div className="text-neutral-200 text-xs truncate">{layer.name}</div>
              <div className="text-[10px] text-neutral-500">{formatMm(w)} × {formatMm(h)}</div>
              <div className="text-[10px] text-neutral-400">刀模{layer.underprint ? '＋白墨' : ''}</div>
            </div>
            <label className="flex items-center gap-1 text-[10px] text-neutral-400">
              總數
              <input
                type="number"
                min={0}
                value={layer.totalCount}
                onChange={e => onSetLayerTotalCount(layer.id, Number(e.target.value) || 0)}
                className="w-14 px-2 py-1 rounded bg-neutral-800 border border-neutral-600 text-white text-xs"
                title="設為 0 會刪除該圖層"
              />
            </label>
          </div>
        );
      })}
    </div>
  );
}

export function ImpositionPanel(props: ImpositionPanelProps) {
  const { state, update } = props;
  const placedCount = state.instances.length - state.notPlacedInstanceIds.length;
  const hasUnderprint = state.layers.some(l => l.underprint);
  const zoomOptions = zoomOptionsFor(state.zoom);

  return (
    <>
      <UploadBox onUpload={props.onUpload} />
      <Section title="版面">
        <div className="grid grid-cols-2 gap-3">
          <MmInput label="寬（mm）" value={state.boundaryWidthMm} min={10} onChange={v => update(s => ({ ...s, boundaryWidthMm: v }))} />
          <MmInput label="高（mm）" value={state.boundaryHeightMm} min={10} onChange={v => update(s => ({ ...s, boundaryHeightMm: v }))} />
        </div>
        <MmInput label="最小間距（mm）" value={state.minGapMm} min={0} onChange={v => update(s => ({ ...s, minGapMm: v }))} />
        <ToggleField label="允許 90° 旋轉" checked={state.allowRotate90} onChange={v => update(s => setAllowRotate(s, v))} />
        <SelectField label="縮放" value={String(state.zoom)} options={zoomOptions} onChange={v => update(s => ({ ...s, zoom: Number(v) }))} />
        <ActionButton onClick={props.onFitZoom} testId="imposition-fit">符合視窗</ActionButton>
      </Section>
      <Section title="顯示">
        {SHOW_LABELS.map(([key, label]) => (
          <React.Fragment key={key}>
            <ToggleField label={label} checked={state.show[key]} onChange={v => update(s => ({ ...s, show: { ...s.show, [key]: v } }))} />
          </React.Fragment>
        ))}
      </Section>
      <Section title="排圖">
        <InfoRow label="圖層" value={state.layers.length} testId="imposition-layer-count" />
        <InfoRow label="項目" value={state.instances.length} />
        <ActionButton onClick={props.onAutoLayout} disabled={state.instances.length === 0} testId="imposition-auto-layout">排圖</ActionButton>
        {state.lastLayoutMessage ? (
          <div className="p-2 rounded bg-neutral-900 border border-neutral-700 text-[10px] text-neutral-300">{state.lastLayoutMessage}</div>
        ) : null}
      </Section>
      <Section title="匯出（排除塞不進的項目）">
        <ActionButton variant="primary" onClick={props.onExportLayers} disabled={placedCount === 0} testId="export-imposition-layers">
          <Download className="w-3 h-3" /> 分層 SVG（原圖＋白墨＋刀模）
        </ActionButton>
        <ActionButton onClick={props.onExportCut} disabled={placedCount === 0} testId="export-imposition-cut">
          <Download className="w-3 h-3" /> 只有刀模 SVG
        </ActionButton>
        <ActionButton onClick={props.onExportUnderprint} disabled={placedCount === 0 || !hasUnderprint} testId="export-imposition-underprint">
          <Download className="w-3 h-3" /> 只有白墨 SVG
        </ActionButton>
        <ActionButton onClick={props.onExportPdf} disabled={placedCount === 0} testId="export-imposition-pdf">
          <FileText className="w-3 h-3" /> PDF 預覽（點陣）
        </ActionButton>
      </Section>
      <Section title="圖層">
        <LayerList state={state} onSetLayerTotalCount={props.onSetLayerTotalCount} />
      </Section>
    </>
  );
}
