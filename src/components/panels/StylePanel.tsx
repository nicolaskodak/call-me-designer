import React from 'react';
import type { DisplayStyle } from '../../types';
import { ColorOpacityField, Section, SliderField, ToggleField } from './fields';

interface StylePanelProps {
  style: DisplayStyle;
  onChange: (style: DisplayStyle) => void;
  children?: React.ReactNode;
}

export function StylePanel({ style, onChange, children }: StylePanelProps) {
  const set = <K extends keyof DisplayStyle>(key: K, value: DisplayStyle[K]) => onChange({ ...style, [key]: value });
  return (
    <Section title="外觀（只影響預覽）">
      <ToggleField label="顯示原圖" checked={style.showOriginal} onChange={v => set('showOriginal', v)} />
      <ToggleField label="顯示可編輯節點" checked={style.showPoints} onChange={v => set('showPoints', v)} />
      {children}
      <ColorOpacityField
        label="描邊顏色與透明度"
        color={style.strokeColor}
        opacity={style.strokeOpacity}
        onColorChange={c => set('strokeColor', c)}
        onOpacityChange={o => set('strokeOpacity', o)}
      />
      <ColorOpacityField
        label="填色與透明度"
        color={style.fillColor}
        opacity={style.fillOpacity}
        onColorChange={c => set('fillColor', c)}
        onOpacityChange={o => set('fillOpacity', o)}
      />
      <SliderField label="描邊寬度" value={style.strokeWidth} min={1} max={10} step={1} display={`${style.strokeWidth}px`} onChange={v => set('strokeWidth', v)} />
    </Section>
  );
}
