import React from 'react';

export function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-neutral-200 font-semibold text-xs uppercase tracking-wider">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

interface SliderFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display?: string;
  hint?: string;
  testId?: string;
  onChange: (value: number) => void;
}

export function SliderField({ label, value, min, max, step, display, hint, testId, onChange }: SliderFieldProps) {
  return (
    <label className="block space-y-1">
      <span className="flex justify-between text-xs">
        <span className="text-neutral-400">{label}</span>
        <span className="text-blue-400 font-mono">{display ?? value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        data-testid={testId}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1 bg-neutral-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
      />
      {hint ? <span className="block text-[10px] text-neutral-500">{hint}</span> : null}
    </label>
  );
}

export function ToggleField({ label, checked, testId, onChange }: { label: string; checked: boolean; testId?: string; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 p-2 bg-neutral-700/30 rounded border border-neutral-700 text-xs">
      {/* 版面名稱可能長達 40 幾個字：span 要能收縮換行，checkbox 不能被擠扁 */}
      <span className="text-neutral-300 min-w-0 break-words">{label}</span>
      <input type="checkbox" className="h-4 w-4 shrink-0" checked={checked} data-testid={testId} onChange={e => onChange(e.target.checked)} />
    </label>
  );
}

interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  testId?: string;
  onChange: (v: T) => void;
}

export function SelectField<T extends string>({ label, value, options, testId, onChange }: SelectFieldProps<T>) {
  return (
    <label className="block space-y-1 text-xs">
      <span className="text-neutral-400">{label}</span>
      <select
        value={value}
        data-testid={testId}
        onChange={e => onChange(e.target.value as T)}
        className="w-full px-2 py-1 rounded bg-neutral-700 border border-neutral-600 text-white"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

interface ColorOpacityFieldProps {
  label: string;
  color: string;
  opacity: number;
  onColorChange: (c: string) => void;
  onOpacityChange: (o: number) => void;
}

export function ColorOpacityField({ label, color, opacity, onColorChange, onOpacityChange }: ColorOpacityFieldProps) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center text-xs">
        <span className="text-neutral-400">{label}</span>
        <span className="text-[10px] text-neutral-500 font-mono">{Math.round(opacity * 100)}%</span>
      </div>
      <div className="flex items-center gap-3">
        <input type="color" value={color} onChange={e => onColorChange(e.target.value)} className="w-8 h-8 rounded bg-transparent border-none cursor-pointer shrink-0" />
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={opacity}
          onChange={e => onOpacityChange(Number(e.target.value))}
          className="flex-1 h-1 bg-neutral-600 rounded-lg appearance-none cursor-pointer accent-neutral-400"
        />
      </div>
    </div>
  );
}

interface ActionButtonProps {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
  testId?: string;
  title?: string;
}

export function ActionButton({ children, onClick, disabled, variant = 'secondary', testId, title }: ActionButtonProps) {
  const color = variant === 'primary' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-neutral-700 hover:bg-neutral-600';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-testid={testId}
      className={`w-full flex items-center justify-center gap-2 py-2 rounded text-xs text-white transition disabled:opacity-30 disabled:cursor-not-allowed ${color}`}
    >
      {children}
    </button>
  );
}

export function InfoRow({ label, value, testId }: { label: string; value: React.ReactNode; testId?: string }) {
  return (
    <div className="flex items-center justify-between p-2 bg-neutral-700/30 rounded border border-neutral-700 text-xs">
      <span className="text-neutral-400">{label}</span>
      <span className="text-white font-mono" data-testid={testId}>{value}</span>
    </div>
  );
}

export function Warnings({ messages }: { messages: readonly string[] }) {
  if (messages.length === 0) return null;
  return (
    <ul className="p-2 rounded bg-amber-900/30 border border-amber-700 text-[11px] text-amber-200 space-y-1" data-testid="warnings">
      {messages.map(m => (
        <li key={m}>{m}</li>
      ))}
    </ul>
  );
}
