import { Download, Send } from 'lucide-react';
import React from 'react';
import type { UnderprintParams } from '../../geometry/types';
import type { GeometryState } from '../../hooks/useGeometry';
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
          <ActionButton variant="primary" onClick={props.onSendToImposition} disabled={!hasSource} testId="send-to-imposition-under">
            <Send className="w-3 h-3" /> 送到 Imposition
          </ActionButton>
        ) : null}
      </Section>
    </>
  );
}
