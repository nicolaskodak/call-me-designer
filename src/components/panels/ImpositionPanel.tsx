import { Download, FileText, Upload } from 'lucide-react';
import React from 'react';
import { useFileDrop } from '../../hooks/useFileDrop';
import type { SheetSize } from '../../imposition/sheetSizes';
import { MAX_SHEETS } from '../../imposition/sheets';
import { layerBoxMm, NO_ENABLED_SIZE_MESSAGE, setAllowRotate, toggleSheetSize } from '../../imposition/state';
import { ZOOM_OPTIONS, type ImpositionShow, type ImpositionState } from '../../imposition/types';
import { formatMm } from '../../units';
import { ActionButton, InfoRow, Section, SelectField, ToggleField, Warnings } from './fields';

interface ImpositionPanelProps {
  state: ImpositionState;
  update: (fn: (s: ImpositionState) => ImpositionState) => void;
  sheetSizes: readonly SheetSize[];
  onUpload: (files: File[]) => void;
  onSetLayerTotalCount: (layerId: string, total: number) => void;
  onAutoLayout: () => void;
  onFitZoom: () => void;
  onExportLayers: () => void;
  onExportCut: () => void;
  onExportUnderprint: () => void;
  onExportPdf: () => void;
  /** PDF 匯出進行中；只用來停用「PDF 預覽」按鈕，不影響其他三個 SVG 匯出按鈕 */
  isPdfExporting: boolean;
  /** 三個 SVG 匯出按鈕共用同一個「匯出中」旗標；不影響 PDF 按鈕 */
  isSvgExporting: boolean;
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
  const { isOver, dropProps } = useFileDrop(onUpload);
  const tone = isOver ? 'border-blue-500 bg-blue-500/10' : 'border-neutral-600 hover:border-blue-500 hover:bg-neutral-700/50';
  return (
    <label
      {...dropProps}
      data-testid="imposition-dropzone"
      data-drag-over={isOver ? 'true' : undefined}
      className={`flex flex-col items-center justify-center w-full h-20 border-2 border-dashed rounded-lg transition cursor-pointer ${tone}`}
    >
      <Upload className="w-6 h-6 mb-1 text-neutral-500" />
      <span className="text-xs text-neutral-400">{isOver ? '放開以上傳' : '上傳或拖曳「圖＋SVG」配對（可多選）'}</span>
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
  const hasUnderprint = state.layers.some(l => l.underprint);
  const zoomOptions = zoomOptionsFor(state.zoom);
  const notPlacedCount = state.instances.filter(i => i.sheetId === null).length;
  // 排圖按鈕的停用條件之一：清單裡的尺寸全部被停用（清單本身是空的時候，這裡的 every 會是 vacuously true，
  // 交由下面的 disabled 判斷一起處理；面板提示則只在「清單非空、但全部被停用」時顯示，見下方用法）
  const allSizesDisabled = props.sheetSizes.every(s => state.disabledSizeNames.includes(s.name));
  // 匯出涵蓋所有版面（buildSheetSvgs 逐版面各出一檔），按鈕的啟用判準要跟涵蓋範圍一致：
  // 只要有任一項目已經排進某張版面（sheetId 不是 null），就有東西可以匯出
  const hasExportableItems = state.instances.some(i => i.sheetId !== null);
  // 光有「排進版面的項目」不夠：剛上傳時項目就已經掛在初始那張版面上了，而那張版面的尺寸
  // 與使用者的清單無關（實測會匯出 297×210 的檔案）。所以還要求擺位確實是排圖跑出來的。
  // 排圖後手動拖曳不會把 layoutStale 設回 true，微調完仍然匯得出去。
  const canExport = hasExportableItems && !state.layoutStale;
  // sheetId 為 null 有兩種成因：項目比所有尺寸都大，或版面數已達上限，這裡不猜測是哪一種
  const notPlacedWarnings = notPlacedCount > 0
    ? [
        `有 ${notPlacedCount} 個項目沒有排入任何版面。`,
        ...(state.sheets.length >= MAX_SHEETS ? [`版面數已達上限 ${MAX_SHEETS} 張，多出的項目無法排入。`] : []),
      ]
    : [];

  return (
    <>
      <UploadBox onUpload={props.onUpload} />
      <Section title="版面">
        <div className="space-y-1" data-testid="sheet-size-list">
          <span className="text-xs text-neutral-400">可用版面尺寸</span>
          {props.sheetSizes.length === 0 ? (
            <p className="text-[10px] text-neutral-500">設定頁還沒有任何版面尺寸。</p>
          ) : (
            props.sheetSizes.map(size => (
              <React.Fragment key={size.name}>
                <ToggleField
                  label={`${size.name}（${formatMm(size.widthMm)} × ${formatMm(size.heightMm)}）`}
                  checked={!state.disabledSizeNames.includes(size.name)}
                  testId={`sheet-size-${size.name}`}
                  onChange={() => update(s => toggleSheetSize(s, size.name))}
                />
              </React.Fragment>
            ))
          )}
          <p className="text-[10px] text-neutral-500">在「設定」分頁新增或刪除尺寸。</p>
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
        <InfoRow label="版面" value={state.sheets.length} testId="imposition-sheet-count" />
        <ActionButton
          onClick={props.onAutoLayout}
          disabled={state.instances.length === 0 || allSizesDisabled}
          testId="imposition-auto-layout"
        >排圖</ActionButton>
        {props.sheetSizes.length > 0 && allSizesDisabled ? (
          <p className="text-[10px] text-amber-300" data-testid="imposition-no-enabled-size">{NO_ENABLED_SIZE_MESSAGE}</p>
        ) : null}
        <Warnings messages={notPlacedWarnings} />
        {state.lastLayoutMessage ? (
          <div className="p-2 rounded bg-neutral-900 border border-neutral-700 text-[10px] text-neutral-300">{state.lastLayoutMessage}</div>
        ) : null}
      </Section>
      <Section title="匯出">
        {state.layoutStale && state.instances.length > 0 ? (
          <p className="text-[10px] text-amber-300" data-testid="imposition-export-needs-layout">
            請先按「排圖」才能匯出：目前的擺位還不是排圖的結果，直接匯出會得到與版面清單無關的尺寸。
          </p>
        ) : null}
        <ActionButton variant="primary" onClick={props.onExportLayers} disabled={!canExport || props.isSvgExporting} testId="export-imposition-layers">
          <Download className="w-3 h-3" /> 分層 SVG（依內容分層，只輸出有內容的層，每層每張版面各一檔）
        </ActionButton>
        <ActionButton onClick={props.onExportCut} disabled={!canExport || props.isSvgExporting} testId="export-imposition-cut">
          <Download className="w-3 h-3" /> 只有刀模 SVG（每張版面一檔）
        </ActionButton>
        <ActionButton onClick={props.onExportUnderprint} disabled={!canExport || !hasUnderprint || props.isSvgExporting} testId="export-imposition-underprint">
          <Download className="w-3 h-3" /> 只有白墨 SVG（每張版面一檔）
        </ActionButton>
        <ActionButton onClick={props.onExportPdf} disabled={!canExport || props.isPdfExporting} testId="export-imposition-pdf">
          <FileText className="w-3 h-3" /> PDF 匯出（點陣，依內容分層，最多 3 個檔案）
        </ActionButton>
        {hasUnderprint ? (
          <p className="text-[10px] text-neutral-500" data-testid="imposition-underprint-hint">
            白墨檔案是純白色，用白底軟體開啟看起來像空白是正常的；請改用支援深色背景的工具檢視內容。
          </p>
        ) : null}
      </Section>
      <Section title="圖層">
        <LayerList state={state} onSetLayerTotalCount={props.onSetLayerTotalCount} />
      </Section>
    </>
  );
}
