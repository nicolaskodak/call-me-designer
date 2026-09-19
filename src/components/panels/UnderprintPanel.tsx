import { Download, Send } from 'lucide-react';
import React from 'react';
import type { UnderprintParams } from '../../geometry/types';
import { isGeometryPending, type GeometryState } from '../../hooks/useGeometry';
import type { DisplayStyle } from '../../types';
import { formatMm, pxToMm } from '../../units';
import { EditSection } from './EditSection';
import { ActionButton, InfoRow, Section, SliderField, ToggleField, Warnings } from './fields';
import { StylePanel } from './StylePanel';

export interface UnderprintPanelProps {
  params: UnderprintParams;
  onParamsChange: (next: UnderprintParams) => void;
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
  showCutReference: boolean;
  onShowCutReferenceChange: (value: boolean) => void;
  onExport: () => void;
  onSendToImposition?: () => void;
  /**
   * 刀模幾何是否還沒算完。這顆按鈕雖然在白墨分頁，但 sendToImposition 同時會抓刀模資料，
   * 所以刀模沒算完一樣會把圖層定型成「沒有刀模」。
   */
  cutPending: boolean;
  /** 編輯器目前持有的刀模路徑數；理由同 CutlinePanel 的同名 prop */
  cutPathCount: number;
}

function SettingsSection({ params, onParamsChange }: Pick<UnderprintPanelProps, 'params' | 'onParamsChange'>) {
  const set = <K extends keyof UnderprintParams>(key: K, value: UnderprintParams[K]) => onParamsChange({ ...params, [key]: value });
  return (
    <Section title="白墨設定">
      <SliderField label="Alpha 門檻" value={params.alphaThreshold} min={1} max={254} step={1} hint="alpha 大於等於此值的像素才鋪白墨" onChange={v => set('alphaThreshold', v)} />
      <SliderField label="內縮距離" value={params.insetMm} min={0} max={5} step={0.05} display={formatMm(params.insetMm, 2)} testId="under-inset" onChange={v => set('insetMm', v)} />
      <SliderField label="最小島面積" value={params.minIslandAreaMm2} min={0} max={50} step={0.1} display={`${params.minIslandAreaMm2.toFixed(1)} mm²`} onChange={v => set('minIslandAreaMm2', v)} />
      <ToggleField label="補洞（只保留外圈）" checked={params.fillHoles} testId="under-fill-holes" onChange={v => set('fillHoles', v)} />
    </Section>
  );
}

export function UnderprintPanel(props: UnderprintPanelProps) {
  const { params, onParamsChange, geometry, dpi, hasSource } = props;
  const smoothHint = dpi ? `可能偏移約 ${formatMm(pxToMm(params.smoothness, dpi), 2)}` : undefined;
  const stats = geometry.result?.stats;
  // 白墨幾何還沒算完時停用「送到 Imposition」：這個按鈕會把 editor 當下的
  // getPathData() 定型存進拼版圖層，太早按會拿到還沒更新的空陣列，永久定型成
  // 「沒有白墨」，之後分層匯出就會少一份。
  //
  // 這裡刻意不像 CutlinePanel 那樣多 AND 一個「underprintEnabled」：這個面板剛掛載、
  // `underprintVisitedFor` 的 effect 還沒來得及把 underprintEnabled 從 false 轉成
  // true 的那一個 render，狀態正好就是 underprintEnabled=false 且 geometry.status
  // 還是上一張圖／上一次殘留的 'idle'——如果在這裡也 AND 上 underprintEnabled，
  // 那一個 render 反而會把按鈕解禁，恰好重新打開這次要修的競態。CutlinePanel 沒有
  // 這個「剛掛載」的窗口（它不受 underprintVisitedFor 影響），才需要另外用
  // underprintEnabled 排除「使用者根本沒去過 Underprint 分頁」的正常情況。
  const underprintPending = isGeometryPending(geometry.status);
  return (
    <>
      <SettingsSection params={params} onParamsChange={onParamsChange} />
      {stats ? (
        <div className="space-y-2">
          <InfoRow label="白墨區塊數" value={stats.islandCount} testId="under-island-count" />
          <Warnings messages={geometry.result?.warnings ?? []} />
        </div>
      ) : null}
      <EditSection
        canUndo={props.canUndo}
        canRedo={props.canRedo}
        onUndo={props.onUndo}
        onRedo={props.onRedo}
        segmentCount={props.segmentCount}
        nodeCountTestId="under-node-count"
      >
        <SliderField label="平滑度" value={params.smoothness} min={0} max={20} step={0.5} hint={smoothHint} onChange={v => onParamsChange({ ...params, smoothness: v })} />
      </EditSection>
      <StylePanel style={props.style} onChange={props.onStyleChange}>
        <ToggleField label="顯示刀模參考線" checked={props.showCutReference} testId="under-show-cut" onChange={props.onShowCutReferenceChange} />
      </StylePanel>
      <Section title="匯出">
        <ActionButton onClick={props.onExport} disabled={!hasSource || !stats || stats.islandCount === 0} testId="export-underprint">
          <Download className="w-3 h-3" /> 匯出白墨 SVG（對齊原圖）
        </ActionButton>
        {props.onSendToImposition ? (
          <>
            <ActionButton
              variant="primary"
              onClick={props.onSendToImposition}
              disabled={!hasSource || underprintPending || props.cutPending || props.cutPathCount === 0}
              testId="send-to-imposition-under"
            >
              <Send className="w-3 h-3" /> 送到 Imposition
            </ActionButton>
            {hasSource && props.cutPending ? (
              <p className="text-[10px] text-neutral-500" data-testid="cut-pending-hint">刀模計算中，請稍候…</p>
            ) : hasSource && props.cutPathCount === 0 ? (
              <p className="text-[10px] text-neutral-500" data-testid="cut-empty-hint">目前沒有刀模路徑，無法送出；請回 Die-cut 分頁確認。</p>
            ) : hasSource && underprintPending ? (
              <p className="text-[10px] text-neutral-500" data-testid="underprint-pending-hint">白墨計算中，請稍候…</p>
            ) : null}
          </>
        ) : null}
      </Section>
    </>
  );
}
