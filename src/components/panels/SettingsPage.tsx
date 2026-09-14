import { Eye, EyeOff, PlugZap, Plus, Trash2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { DEFAULT_SHEET_SIZES, type SheetSize } from '../../imposition/sheetSizes';
import { createRemoveBgClient, RemoveBgError } from '../../services/removeBg';
import { REMOVE_BG_SIZES, type RemoveBgSize } from '../../settings/schema';
import { useSettings } from '../../settings/SettingsContext';
import { DPI_MAX, DPI_MIN, isValidDpi } from '../../units';
import { ActionButton, Section, SelectField, Warnings } from './fields';

/** 與 src/settings/schema.ts 的 sheetSizeSchema 邊界一致，維持 UI 端 draft 驗證與儲存層驗證同步。 */
const SHEET_NAME_MAX_LENGTH = 20;
const SHEET_SIDE_MAX_MM = 2000;

const SIZE_LABELS: Record<RemoveBgSize, string> = {
  auto: 'auto（依點數自動選最高解析度）',
  preview: 'preview（免費，約 0.25 MP）',
  full: 'full（原始解析度，PNG 最多 10 MP）',
};

const STATUS_NOTICE: Partial<Record<string, string>> = {
  reset: '設定資料損毀，已重設為預設值。',
  unavailable: '這個瀏覽器無法儲存設定，重新整理後會遺失。',
};

function DefaultDpiField({ value, onCommit }: { value: number; onCommit: (dpi: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = Number(draft);
    if (Number.isInteger(n) && isValidDpi(n)) onCommit(n);
    else setDraft(String(value));
  };
  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      <span className="text-neutral-400">預設 DPI（圖檔沒有資訊時使用）</span>
      <input
        type="number"
        min={DPI_MIN}
        max={DPI_MAX}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); }}
        className="w-24 px-2 py-1 rounded bg-neutral-700 border border-neutral-600 text-white text-right"
      />
    </label>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (hex: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      <span className="text-neutral-400">{label}</span>
      <span className="flex items-center gap-2">
        <span className="font-mono text-neutral-500">{value.toUpperCase()}</span>
        <input type="color" value={value} onChange={e => onChange(e.target.value.toUpperCase())} className="w-8 h-8 rounded bg-transparent border-none cursor-pointer" />
      </span>
    </label>
  );
}

function SheetSizeRow({ size, index, onChange, onDelete }: {
  size: SheetSize;
  index: number;
  onChange: (next: SheetSize) => void;
  onDelete: () => void;
}) {
  const [nameDraft, setNameDraft] = useState(size.name);
  const [widthDraft, setWidthDraft] = useState(String(size.widthMm));
  const [heightDraft, setHeightDraft] = useState(String(size.heightMm));
  useEffect(() => setNameDraft(size.name), [size.name]);
  useEffect(() => setWidthDraft(String(size.widthMm)), [size.widthMm]);
  useEffect(() => setHeightDraft(String(size.heightMm)), [size.heightMm]);

  const commitName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed.length >= 1 && trimmed.length <= SHEET_NAME_MAX_LENGTH) onChange({ ...size, name: trimmed });
    else setNameDraft(size.name);
  };
  const commitWidth = () => {
    const n = Number(widthDraft);
    if (Number.isFinite(n) && n > 0 && n <= SHEET_SIDE_MAX_MM) onChange({ ...size, widthMm: n });
    else setWidthDraft(String(size.widthMm));
  };
  const commitHeight = () => {
    const n = Number(heightDraft);
    if (Number.isFinite(n) && n > 0 && n <= SHEET_SIDE_MAX_MM) onChange({ ...size, heightMm: n });
    else setHeightDraft(String(size.heightMm));
  };

  return (
    <div className="flex items-center gap-2 text-xs">
      <input
        value={nameDraft}
        maxLength={SHEET_NAME_MAX_LENGTH}
        data-testid={`sheet-size-name-${index}`}
        onChange={e => setNameDraft(e.target.value)}
        onBlur={commitName}
        onKeyDown={e => { if (e.key === 'Enter') commitName(); }}
        className="flex-1 min-w-0 px-2 py-1 rounded bg-neutral-700 border border-neutral-600 text-white"
      />
      <input
        type="number"
        min={1}
        max={SHEET_SIDE_MAX_MM}
        value={widthDraft}
        data-testid={`sheet-size-width-${index}`}
        onChange={e => setWidthDraft(e.target.value)}
        onBlur={commitWidth}
        onKeyDown={e => { if (e.key === 'Enter') commitWidth(); }}
        className="w-20 px-2 py-1 rounded bg-neutral-700 border border-neutral-600 text-white text-right"
      />
      <span className="text-neutral-500">×</span>
      <input
        type="number"
        min={1}
        max={SHEET_SIDE_MAX_MM}
        value={heightDraft}
        data-testid={`sheet-size-height-${index}`}
        onChange={e => setHeightDraft(e.target.value)}
        onBlur={commitHeight}
        onKeyDown={e => { if (e.key === 'Enter') commitHeight(); }}
        className="w-20 px-2 py-1 rounded bg-neutral-700 border border-neutral-600 text-white text-right"
      />
      <button
        type="button"
        title="刪除"
        data-testid={`sheet-size-delete-${index}`}
        onClick={onDelete}
        className="px-2 py-1 rounded bg-neutral-700 text-neutral-300"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}

function SheetSizesSection() {
  const { settings, update } = useSettings();
  const setSizes = (sizes: SheetSize[]) => update(s => ({ ...s, sheetSizes: sizes }));

  return (
    <Section title="版面尺寸">
      <p className="text-[10px] text-neutral-500">拼版時會從這些尺寸中自動選出最省紙的組合。單位 mm。</p>
      <div className="space-y-2" data-testid="settings-sheet-sizes">
        {settings.sheetSizes.map((size, index) => (
          <React.Fragment key={index}>
            <SheetSizeRow
              index={index}
              size={size}
              onChange={next => setSizes(settings.sheetSizes.map((s, i) => (i === index ? next : s)))}
              onDelete={() => setSizes(settings.sheetSizes.filter((_, i) => i !== index))}
            />
          </React.Fragment>
        ))}
      </div>
      <ActionButton
        onClick={() => setSizes([...settings.sheetSizes, { name: '新尺寸', widthMm: 300, heightMm: 200 }])}
        testId="settings-add-sheet-size"
      >
        <Plus className="w-3 h-3" /> 新增尺寸
      </ActionButton>
      <ActionButton onClick={() => setSizes([...DEFAULT_SHEET_SIZES])} testId="settings-reset-sheet-sizes">
        還原預設清單
      </ActionButton>
    </Section>
  );
}

function ConnectionTest({ apiKey, size }: { apiKey: string; size: RemoveBgSize }) {
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const test = async () => {
    setTesting(true);
    setResult(null);
    try {
      const account = await createRemoveBgClient({ apiKey, size }).getAccount();
      const credits = account.creditsTotal !== null ? `，剩餘點數 ${account.creditsTotal}` : '';
      const free = account.freeCalls !== null ? `，免費次數 ${account.freeCalls}` : '';
      setResult({ ok: true, text: `連線成功${credits}${free}` });
    } catch (err) {
      setResult({ ok: false, text: err instanceof RemoveBgError ? err.message : '測試失敗，請稍後再試。' });
    } finally {
      setTesting(false);
    }
  };
  return (
    <div className="space-y-2">
      <ActionButton onClick={() => void test()} disabled={testing || !apiKey.trim()} testId="settings-test-connection">
        <PlugZap className="w-3 h-3" /> {testing ? '測試中…' : '測試連線'}
      </ActionButton>
      {result ? (
        <p className={`text-[11px] ${result.ok ? 'text-emerald-300' : 'text-red-300'}`} data-testid="settings-test-result">{result.text}</p>
      ) : null}
    </div>
  );
}

export function SettingsPage() {
  const { settings, status, saved, update } = useSettings();
  const [showKey, setShowKey] = useState(false);
  const { apiKey, size } = settings.removeBg;
  const notices = [STATUS_NOTICE[status], !saved && status !== 'unavailable' ? STATUS_NOTICE.unavailable : undefined].filter(
    (n): n is string => Boolean(n),
  );
  const setRemoveBg = (patch: Partial<typeof settings.removeBg>) =>
    update(s => ({ ...s, removeBg: { ...s.removeBg, ...patch } }));

  return (
    <>
      <Warnings messages={notices} />
      <Section title="一般">
        <DefaultDpiField value={settings.defaultDpi} onCommit={dpi => update(s => ({ ...s, defaultDpi: dpi }))} />
      </Section>
      <Section title="匯出顏色">
        <ColorField label="刀模線" value={settings.exportColors.cut} onChange={c => update(s => ({ ...s, exportColors: { ...s.exportColors, cut: c } }))} />
        <ColorField label="白墨" value={settings.exportColors.underprint} onChange={c => update(s => ({ ...s, exportColors: { ...s.exportColors, underprint: c } }))} />
      </Section>
      <SheetSizesSection />
      <Section title="remove.bg 去背">
        <label className="block space-y-1 text-xs">
          <span className="text-neutral-400">API key</span>
          <span className="flex gap-2">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              maxLength={200}
              autoComplete="off"
              spellCheck={false}
              data-testid="settings-removebg-key"
              onChange={e => setRemoveBg({ apiKey: e.target.value })}
              className="flex-1 min-w-0 px-2 py-1 rounded bg-neutral-700 border border-neutral-600 text-white font-mono"
            />
            <button type="button" title={showKey ? '隱藏' : '顯示'} onClick={() => setShowKey(v => !v)} className="px-2 rounded bg-neutral-700 text-neutral-300">
              {showKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            </button>
            <button type="button" title="清除" onClick={() => setRemoveBg({ apiKey: '' })} className="px-2 rounded bg-neutral-700 text-neutral-300">
              <Trash2 className="w-3 h-3" />
            </button>
          </span>
        </label>
        <p className="text-[10px] text-neutral-500">API key 只存在這個瀏覽器，除了呼叫 remove.bg 之外不會送到任何地方。</p>
        <SelectField
          label="輸出尺寸"
          value={size}
          options={REMOVE_BG_SIZES.map(s => ({ value: s, label: SIZE_LABELS[s] }))}
          onChange={v => setRemoveBg({ size: v })}
        />
        <ConnectionTest apiKey={apiKey} size={size} />
      </Section>
    </>
  );
}
