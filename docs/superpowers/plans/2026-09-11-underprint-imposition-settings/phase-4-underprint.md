# 第 4 階段：白墨頁

先讀 index 的 Global Constraints。這個階段只有一個 task：幾何運算（Task 2.6）、畫布（Task 3.3）、面板元件（Task 3.5）都已完成，這裡把它們組成白墨分頁。

---

### Task 4.1：白墨頁

**Files:**
- Create: `src/components/panels/UnderprintPanel.tsx`
- Modify: `src/App.tsx`（整個檔案換成 Step 2 的內容）

**Interfaces:**
- Consumes：`UnderprintParams`、`DEFAULT_UNDERPRINT_PARAMS`、`underprintParamsToPx`；`DEFAULT_UNDERPRINT_STYLE`；`useGeometry(client, 'underprint', …)`；`useEditorSlot`；`GeometryView`（`mode="fill"`、`referencePaths`）；`buildAlignedSvg({ kind: 'underprint', … })`；`fields.tsx`、`EditSection`、`StylePanel`
- Produces：
  ```ts
  export interface UnderprintPanelProps {
    params: UnderprintParams; onParamsChange(next: UnderprintParams): void;
    geometry: GeometryState; dpi: number | null; hasSource: boolean;
    canUndo: boolean; canRedo: boolean; onUndo(): void; onRedo(): void; segmentCount: number;
    style: DisplayStyle; onStyleChange(s: DisplayStyle): void;
    showCutReference: boolean; onShowCutReferenceChange(v: boolean): void;
    onExport(): void;
    onSendToImposition?: () => void;
  }
  export function UnderprintPanel(p: UnderprintPanelProps): JSX.Element
  ```
  App 內新增的狀態（第 5、6 階段會用到）：`underParams`、`underStyle`、`showCutReference`、`underprintVisitedFor`（開過白墨頁的來源圖片 id）、`under`（`EditorSlot`）、`underGeometry`、`guardSource`（改來源圖片時，同時檢查兩頁的 dirty）。

**規則（來自 index「與 spec 的差異」第 4 點）：** 白墨只在目前這張圖曾經打開過 Underprint 分頁之後才計算；換一張新圖後，要再開一次白墨頁才會計算。

- [ ] **Step 1：建立 `src/components/panels/UnderprintPanel.tsx`**

```tsx
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
```

- [ ] **Step 2：更新 `src/App.tsx`**

整個檔案換成以下內容。和第 3 階段相比的差異：新增白墨的狀態與分頁；`sourcePanel` 改用 `guardSource`；`<main>` 多一個白墨畫布。

```tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConfirmDialog } from './components/ConfirmDialog';
import { GeometryView } from './components/GeometryView';
import ImpositionCanvas, { type ImpositionCanvasHandle } from './components/ImpositionCanvas';
import { CutlinePanel } from './components/panels/CutlinePanel';
import { ImpositionPanel } from './components/panels/ImpositionPanel';
import { SourcePanel } from './components/panels/SourcePanel';
import { UnderprintPanel } from './components/panels/UnderprintPanel';
import { Sidebar, type TabDef } from './components/Sidebar';
import { useRegenerateGuard } from './editor/useRegenerateGuard';
import { exportCutPdf } from './export/cutPdf';
import { buildAlignedSvg, buildTrimmedCutSvg } from './export/svg';
import {
  cutlineParamsToPx,
  DEFAULT_CUTLINE_PARAMS,
  DEFAULT_UNDERPRINT_PARAMS,
  underprintParamsToPx,
} from './geometry/params';
import type { CutlineParams, UnderprintParams } from './geometry/types';
import { useEditorSlot, type EditorSlot } from './hooks/useEditorSlot';
import { useGeometry } from './hooks/useGeometry';
import { useGeometryClient } from './hooks/useGeometryClient';
import { useImposition } from './hooks/useImposition';
import { useSourceImage } from './hooks/useSourceImage';
import { useWorkerImage } from './hooks/useWorkerImage';
import { DEFAULT_CUT_STYLE, DEFAULT_UNDERPRINT_STYLE, type ActiveTab, type DisplayStyle } from './types';
import { DEFAULT_DPI } from './units';
import { downloadText } from './utils/download';

const TABS: readonly TabDef[] = [
  { id: 'editor', label: 'Editor' },
  { id: 'underprint', label: 'Underprint' },
  { id: 'imposition', label: 'Imposition' },
];

const SVG_MIME = 'image/svg+xml;charset=utf-8';
/** 第 6 階段改為讀取設定頁的顏色 */
const EXPORT_CUT_COLOR = '#FF0000';
const EXPORT_UNDERPRINT_COLOR = '#FFFFFF';

const confirmExport = (warnings: readonly string[]): boolean =>
  warnings.length === 0 || window.confirm(`${warnings.join('\n')}\n\n確定要匯出嗎？`);

const EDITOR_TIPS = (
  <>
    <div>拖曳節點調整形狀。</div>
    <div>雙擊節點刪除。</div>
    <div>點線段新增節點。Ctrl/Cmd+Z 復原。</div>
  </>
);

/** 回傳目前有手動編輯、會被覆蓋的分頁名稱 */
const dirtyPages = (entries: readonly [string, EditorSlot][]): string[] =>
  entries.filter(([, slot]) => slot.dirty).map(([name]) => name);

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('editor');
  const sourceApi = useSourceImage(DEFAULT_DPI);
  const { source } = sourceApi;
  const client = useGeometryClient();
  const imageId = useWorkerImage(client, source?.current ?? null);
  const dpi = source?.current.dpi ?? null;

  // 刀模
  const [cutParams, setCutParams] = useState<CutlineParams>(DEFAULT_CUTLINE_PARAMS);
  const [cutStyle, setCutStyle] = useState<DisplayStyle>(DEFAULT_CUT_STYLE);
  const cutParamsPx = useMemo(() => (dpi ? cutlineParamsToPx(cutParams, dpi) : null), [cutParams, dpi]);
  const cutGeometry = useGeometry(client, 'cutline', imageId, cutParamsPx);
  const cut = useEditorSlot();

  // 白墨：這張圖開過白墨頁之後才計算
  const [underParams, setUnderParams] = useState<UnderprintParams>(DEFAULT_UNDERPRINT_PARAMS);
  const [underStyle, setUnderStyle] = useState<DisplayStyle>(DEFAULT_UNDERPRINT_STYLE);
  const [showCutReference, setShowCutReference] = useState(true);
  const [underprintVisitedFor, setUnderprintVisitedFor] = useState<string | null>(null);
  const sourceId = source?.id ?? null;
  useEffect(() => {
    if (activeTab === 'underprint' && sourceId) setUnderprintVisitedFor(sourceId);
  }, [activeTab, sourceId]);
  const underprintEnabled = sourceId !== null && underprintVisitedFor === sourceId;
  const underParamsPx = useMemo(
    () => (dpi && underprintEnabled ? underprintParamsToPx(underParams, dpi) : null),
    [underParams, dpi, underprintEnabled],
  );
  const underGeometry = useGeometry(client, 'underprint', imageId, underParamsPx);
  const under = useEditorSlot();

  const imposition = useImposition(activeTab === 'imposition');
  const impositionRef = useRef<ImpositionCanvasHandle>(null);
  const { guard, dialog } = useRegenerateGuard();

  // 確認後立刻清掉 dirty，避免拖拉桿時重複詢問
  const guardSlots = useCallback(
    (entries: readonly [string, EditorSlot][], action: () => void) =>
      guard(dirtyPages(entries), () => {
        entries.forEach(([, slot]) => slot.clearDirty());
        action();
      }),
    [guard],
  );
  const guardCut = (action: () => void) => guardSlots([['Editor', cut]], action);
  const guardUnder = (action: () => void) => guardSlots([['Underprint', under]], action);
  const guardSource = (action: () => void) => guardSlots([['Editor', cut], ['Underprint', under]], action);

  const exportCut = (kind: 'aligned' | 'trimmed') => {
    const editor = cut.ref.current;
    if (!source || !editor || !confirmExport(cutGeometry.result?.warnings ?? [])) return;
    const { widthPx, heightPx, dpi: d } = source.current;
    const paths = editor.getPathData();
    if (kind === 'aligned') {
      downloadText(buildAlignedSvg({ kind: 'cut', paths, widthPx, heightPx, dpi: d, color: EXPORT_CUT_COLOR }), `${source.name}-cut.svg`, SVG_MIME);
      return;
    }
    const bounds = editor.getBounds();
    if (bounds) downloadText(buildTrimmedCutSvg({ paths, bounds, dpi: d, color: EXPORT_CUT_COLOR }), `${source.name}-cut-trimmed.svg`, SVG_MIME);
  };

  const exportPdf = () => {
    const editor = cut.ref.current;
    if (!source || !editor || !confirmExport(cutGeometry.result?.warnings ?? [])) return;
    const { widthPx, heightPx, dpi: d } = source.current;
    exportCutPdf(
      { image: editor.getImage(), curveSets: editor.getCurveSets(), widthPx, heightPx, dpi: d, color: EXPORT_CUT_COLOR },
      `${source.name}-cut.pdf`,
    ).catch((err: unknown) => {
      console.error('匯出 PDF 失敗', err);
      window.alert('匯出 PDF 失敗，請再試一次。');
    });
  };

  const exportUnderprint = () => {
    const editor = under.ref.current;
    if (!source || !editor) return;
    const { widthPx, heightPx, dpi: d } = source.current;
    const svg = buildAlignedSvg({ kind: 'underprint', paths: editor.getPathData(), widthPx, heightPx, dpi: d, color: EXPORT_UNDERPRINT_COLOR });
    downloadText(svg, `${source.name}-underprint.svg`, SVG_MIME);
  };

  const sourcePanel = (
    <SourcePanel
      source={source}
      loading={sourceApi.loading}
      error={sourceApi.error}
      onUpload={file => guardSource(() => void sourceApi.upload(file))}
      onDpiChange={d => guardSource(() => sourceApi.setDpi(d))}
    />
  );

  return (
    <div className="flex h-screen w-screen bg-black overflow-hidden font-sans">
      <Sidebar
        tabs={TABS}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        footer={activeTab === 'editor' || activeTab === 'underprint' ? EDITOR_TIPS : null}
      >
        {activeTab === 'editor' ? (
          <>
            {sourcePanel}
            <CutlinePanel
              params={cutParams}
              onParamsChange={next => guardCut(() => setCutParams(next))}
              geometry={cutGeometry}
              dpi={dpi}
              hasSource={Boolean(source)}
              canUndo={cut.canUndo}
              canRedo={cut.canRedo}
              onUndo={() => cut.ref.current?.undo()}
              onRedo={() => cut.ref.current?.redo()}
              segmentCount={cut.segmentCount}
              style={cutStyle}
              onStyleChange={setCutStyle}
              onExportAligned={() => exportCut('aligned')}
              onExportTrimmed={() => exportCut('trimmed')}
              onExportPdf={exportPdf}
            />
          </>
        ) : null}
        {activeTab === 'underprint' ? (
          <>
            {sourcePanel}
            <UnderprintPanel
              params={underParams}
              onParamsChange={next => guardUnder(() => setUnderParams(next))}
              geometry={underGeometry}
              dpi={dpi}
              hasSource={Boolean(source)}
              canUndo={under.canUndo}
              canRedo={under.canRedo}
              onUndo={() => under.ref.current?.undo()}
              onRedo={() => under.ref.current?.redo()}
              segmentCount={under.segmentCount}
              style={underStyle}
              onStyleChange={setUnderStyle}
              showCutReference={showCutReference}
              onShowCutReferenceChange={setShowCutReference}
              onExport={exportUnderprint}
            />
          </>
        ) : null}
        {activeTab === 'imposition' ? (
          <ImpositionPanel
            impositionState={imposition.impositionState}
            setImpositionState={imposition.setImpositionState}
            onUpload={imposition.handleImpositionUpload}
            onSetLayerTotalCount={imposition.setLayerTotalCount}
            onAutoLayout={imposition.handleAutoLayout}
            onExportPDF={() => void impositionRef.current?.exportPDF()}
          />
        ) : null}
      </Sidebar>

      <main className="flex-1 relative h-full bg-[radial-gradient(#333_1px,transparent_1px)] [background-size:16px_16px] bg-neutral-900">
        {/* 分頁切換時不 unmount，保留 Paper 的編輯與歷史 */}
        <div className="absolute inset-0" hidden={activeTab !== 'editor'}>
          <GeometryView
            source={source}
            geometry={cutGeometry}
            editorRef={cut.ref}
            mode="stroke"
            style={cutStyle}
            smoothness={cutParams.smoothness}
            active={activeTab === 'editor'}
            testId="cut-canvas"
            {...cut.callbacks}
          />
        </div>
        <div className="absolute inset-0" hidden={activeTab !== 'underprint'}>
          <GeometryView
            source={source}
            geometry={underGeometry}
            editorRef={under.ref}
            mode="fill"
            style={underStyle}
            smoothness={underParams.smoothness}
            referencePaths={showCutReference ? cut.paths : undefined}
            active={activeTab === 'underprint'}
            testId="under-canvas"
            {...under.callbacks}
          />
        </div>
        <div className="absolute inset-0" hidden={activeTab !== 'imposition'}>
          <ImpositionCanvas ref={impositionRef} impositionState={imposition.impositionState} setImpositionState={imposition.setImpositionState} />
        </div>
      </main>

      <ConfirmDialog {...dialog} />
    </div>
  );
};

export default App;
```

- [ ] **Step 3：自動驗證**

Run: `npm run typecheck && npm test && npm run build`
Expected: 全部通過。

- [ ] **Step 4：手動驗證（`npm run dev`）**

用第 3 階段那張有兩個分離圖形的透明 PNG，外加一張帶有內部鏤空（例如字母 O）的透明 PNG：

1. 上傳後停在 Editor，網路／效能面板中看不到白墨運算（白墨分頁還沒開過）。
2. 切到 Underprint → 出現白色半透明的白墨區塊，面板顯示「白墨區塊數 2」；刀模紅色虛線參考線疊在上面。
3. 內縮距離從 0.2 mm 調到 2 mm → 白墨明顯變小；圖案中很細的線條消失。
4. 上傳字母 O 的圖 → 白墨中間是空的；打開「補洞」→ 中間被填滿。
5. 關閉「顯示刀模參考線」→ 虛線消失。
6. 在白墨頁拖曳一個節點 → 改內縮距離 → 跳出確認視窗，訊息只提到 Underprint。
7. 在 Editor 與 Underprint 都拖曳過節點後，修改 DPI → 確認視窗訊息為「你已在 Editor、Underprint 手動編輯過節點…」。
8. 白墨頁的 Ctrl/Cmd+Z 只影響白墨，不影響刀模；切回 Editor，刀模的歷史獨立。
9. 匯出白墨 SVG，確認 `fill="#FFFFFF"`、路徑帶 `fill-rule="evenodd"`、尺寸為 mm。
10. 換一張新圖並停在 Editor → 白墨不計算；切到 Underprint 才開始計算。

- [ ] **Step 5：Commit**

```bash
git add src/App.tsx src/components/panels/UnderprintPanel.tsx
git commit -m "feat: add underprint page with independent params and node editing

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
