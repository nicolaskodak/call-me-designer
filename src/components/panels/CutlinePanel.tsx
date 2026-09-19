import { Download, FileText, Send } from 'lucide-react';
import React from 'react';
import type { CutlineParams, CutlineMode, BridgeMode } from '../../geometry/types';
import type { GeometryState } from '../../hooks/useGeometry';
import type { DisplayStyle } from '../../types';
import { formatMm, pxToMm } from '../../units';
import { EditSection } from './EditSection';
import { ActionButton, InfoRow, Section, SelectField, SliderField, ToggleField, Warnings } from './fields';
import { StylePanel } from './StylePanel';

const MODE_OPTIONS: readonly { value: CutlineMode; label: string }[] = [
  { value: 'precise', label: '精確距離' },
  { value: 'legacy', label: '舊模式（模糊＋門檻）' },
];

const BRIDGE_OPTIONS: readonly { value: BridgeMode; label: string }[] = [
  { value: 'auto', label: '自動' },
  { value: 'manual', label: '手動' },
];

export interface CutlinePanelProps {
  params: CutlineParams;
  onParamsChange: (next: CutlineParams) => void;
  geometry: GeometryState;
  dpi: number | null;
  hasSource: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  segmentCount: number;
  style: DisplayStyle;
  onStyleChange: (style: DisplayStyle) => void;
  onExportAligned: () => void;
  onExportTrimmed: () => void;
  onExportPdf: () => void;
  onSendToImposition?: () => void;
  /** 白墨是否已啟用（使用者去過 Underprint 分頁）；未啟用時完全不受白墨計算狀態影響 */
  underprintEnabled: boolean;
  /** 白墨幾何是否還沒算完（見 isGeometryPending）；只有在 underprintEnabled 也是 true 時才有意義 */
  underprintPending: boolean;
  /** 刀模幾何是否還沒算完；與白墨不同，刀模沒有「啟用」的概念，永遠都要擋 */
  cutPending: boolean;
  /**
   * 編輯器目前持有的刀模路徑數。光看 cutPending 不夠：幾何回報 ready 之後，編輯器還要
   * 再一步才把結果吃進去，中間那段 getPathData() 仍是空的。實測這段殘留約 0.6 秒。
   */
  cutPathCount: number;
}

function GenerationSection({ params, onParamsChange }: Pick<CutlinePanelProps, 'params' | 'onParamsChange'>) {
  const set = <K extends keyof CutlineParams>(key: K, value: CutlineParams[K]) => onParamsChange({ ...params, [key]: value });
  return (
    <Section title="產生設定">
      <SelectField label="產生方式" value={params.mode} options={MODE_OPTIONS} testId="cut-mode" onChange={v => set('mode', v)} />
      {params.mode === 'precise' ? (
        <>
          <SliderField label="Alpha 門檻" value={params.alphaThreshold} min={1} max={254} step={1} onChange={v => set('alphaThreshold', v)} />
          <SliderField label="外擴距離" value={params.offsetMm} min={0} max={20} step={0.1} display={formatMm(params.offsetMm)} testId="cut-offset" onChange={v => set('offsetMm', v)} />
        </>
      ) : (
        <>
          <SliderField label="Blur" value={params.legacyBlurPx} min={0} max={50} step={1} display={`${params.legacyBlurPx}px`} onChange={v => set('legacyBlurPx', v)} />
          <SliderField label="Threshold" value={params.legacyThreshold} min={1} max={100} step={1} hint="數值越低外框越寬" onChange={v => set('legacyThreshold', v)} />
        </>
      )}
      <SliderField label="最小島面積" value={params.minIslandAreaMm2} min={0} max={50} step={0.1} display={`${params.minIslandAreaMm2.toFixed(1)} mm²`} onChange={v => set('minIslandAreaMm2', v)} />
      <ToggleField label="單一連通（刀模只有一圈）" checked={params.singleConnected} testId="cut-single" onChange={v => set('singleConnected', v)} />
      {params.singleConnected ? (
        <>
          <SelectField label="橋接半徑" value={params.bridgeMode} options={BRIDGE_OPTIONS} onChange={v => set('bridgeMode', v)} />
          {params.bridgeMode === 'manual' ? (
            <SliderField label="手動橋接半徑" value={params.bridgeRadiusMm} min={0} max={30} step={0.1} display={formatMm(params.bridgeRadiusMm)} onChange={v => set('bridgeRadiusMm', v)} />
          ) : (
            <SliderField label="自動橋接上限" value={params.bridgeMaxMm} min={1} max={50} step={0.5} display={formatMm(params.bridgeMaxMm)} onChange={v => set('bridgeMaxMm', v)} />
          )}
        </>
      ) : null}
    </Section>
  );
}

function StatusSection({ geometry, dpi }: { geometry: GeometryState; dpi: number | null }) {
  const stats = geometry.result?.stats;
  if (!stats || dpi === null) return null;
  return (
    <div className="space-y-2">
      <InfoRow label="區塊數" value={stats.islandCount} testId="cut-island-count" />
      {stats.bridgeRadiusPx !== undefined ? (
        <InfoRow label="橋接半徑" value={formatMm(pxToMm(stats.bridgeRadiusPx, dpi))} />
      ) : null}
      <Warnings messages={geometry.result?.warnings ?? []} />
    </div>
  );
}

export function CutlinePanel(props: CutlinePanelProps) {
  const { params, onParamsChange, geometry, dpi, hasSource } = props;
  const smoothHint = dpi ? `可能偏移約 ${formatMm(pxToMm(params.smoothness, dpi), 2)}` : undefined;
  // 已啟用白墨、但白墨幾何還沒算完時，這顆按鈕一樣會用 getPathData() 拿到還沒更新的
  // 空陣列，把圖層永久定型成「沒有白墨」——跟 UnderprintPanel 的 send-to-imposition-under
  // 是同一個競態，只是這裡是從 Editor 分頁觸發。未啟用白墨（使用者根本不要白墨）時
  // 完全不受白墨計算狀態影響，正常流程不會被誤擋。
  const blockedByUnderprint = props.underprintEnabled && props.underprintPending;
  // 刀模幾何還沒算完時，getPathData() 回傳空陣列，圖層被永久定型成「沒有刀模」：
  // 圖層列照樣寫著「刀模」，分層匯出卻安靜地少掉刀模檔，toast 仍報成功，送印才發現不能切。
  // 實測（20 倍 CPU 節流、極小的測試圖）這個窗口有 1.4 秒，圖越複雜越長，人很容易按進去。
  // 「幾何 ready」與「編輯器拿到路徑」是兩個時刻，中間送出一樣會定型成沒有刀模；而從按鈕
  // 的角度，這段空窗與「這張圖真的沒有刀模」長得一模一樣，所以兩者都擋，只是說法不同。
  const noCutPaths = !props.cutPending && props.cutPathCount === 0;
  const blocked = blockedByUnderprint || props.cutPending || noCutPaths;
  const blockReason = props.cutPending
    ? { testId: 'cut-pending-hint', text: '刀模計算中，請稍候…' }
    : noCutPaths
      ? { testId: 'cut-empty-hint', text: '目前沒有刀模路徑，無法送出；請調整參數或確認圖片有不透明區域。' }
      : blockedByUnderprint
        ? { testId: 'underprint-pending-hint', text: '白墨計算中，請稍候…' }
        : null;
  return (
    <>
      <GenerationSection params={params} onParamsChange={onParamsChange} />
      <StatusSection geometry={geometry} dpi={dpi} />
      <EditSection
        canUndo={props.canUndo}
        canRedo={props.canRedo}
        onUndo={props.onUndo}
        onRedo={props.onRedo}
        segmentCount={props.segmentCount}
        nodeCountTestId="cut-node-count"
      >
        <SliderField label="平滑度" value={params.smoothness} min={0} max={20} step={0.5} hint={smoothHint} onChange={v => onParamsChange({ ...params, smoothness: v })} />
      </EditSection>
      <StylePanel style={props.style} onChange={props.onStyleChange} />
      <Section title="匯出">
        <ActionButton onClick={props.onExportAligned} disabled={!hasSource} testId="export-cut-aligned">
          <Download className="w-3 h-3" /> 匯出 SVG（對齊原圖）
        </ActionButton>
        <ActionButton onClick={props.onExportTrimmed} disabled={!hasSource} testId="export-cut-trimmed">
          <Download className="w-3 h-3" /> 匯出 SVG（裁切外框）
        </ActionButton>
        <ActionButton onClick={props.onExportPdf} disabled={!hasSource} testId="export-cut-pdf">
          <FileText className="w-3 h-3" /> 匯出 PDF
        </ActionButton>
        {props.onSendToImposition ? (
          <>
            <ActionButton
              variant="primary"
              onClick={props.onSendToImposition}
              disabled={!hasSource || blocked}
              testId="send-to-imposition-cut"
            >
              <Send className="w-3 h-3" /> 送到 Imposition
            </ActionButton>
            {hasSource && blockReason ? (
              <p className="text-[10px] text-neutral-500" data-testid={blockReason.testId}>{blockReason.text}</p>
            ) : null}
          </>
        ) : null}
      </Section>
    </>
  );
}
