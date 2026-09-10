import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ConfirmDialog } from './components/ConfirmDialog';
import { GeometryView } from './components/GeometryView';
import ImpositionCanvas, { type ImpositionCanvasHandle } from './components/ImpositionCanvas';
import { CutlinePanel } from './components/panels/CutlinePanel';
import { ImpositionPanel } from './components/panels/ImpositionPanel';
import { SourcePanel } from './components/panels/SourcePanel';
import { Sidebar, type TabDef } from './components/Sidebar';
import { useRegenerateGuard } from './editor/useRegenerateGuard';
import { exportCutPdf } from './export/cutPdf';
import { buildAlignedSvg, buildTrimmedCutSvg } from './export/svg';
import { cutlineParamsToPx, DEFAULT_CUTLINE_PARAMS } from './geometry/params';
import type { CutlineParams } from './geometry/types';
import { useEditorSlot } from './hooks/useEditorSlot';
import { useGeometry } from './hooks/useGeometry';
import { useGeometryClient } from './hooks/useGeometryClient';
import { useImposition } from './hooks/useImposition';
import { useSourceImage } from './hooks/useSourceImage';
import { useWorkerImage } from './hooks/useWorkerImage';
import { DEFAULT_CUT_STYLE, type ActiveTab, type DisplayStyle } from './types';
import { DEFAULT_DPI } from './units';
import { downloadText } from './utils/download';

const TABS: readonly TabDef[] = [
  { id: 'editor', label: 'Editor' },
  { id: 'imposition', label: 'Imposition' },
];

const SVG_MIME = 'image/svg+xml;charset=utf-8';
/** 第 6 階段改為讀取設定頁的顏色 */
const EXPORT_CUT_COLOR = '#FF0000';

const confirmExport = (warnings: readonly string[]): boolean =>
  warnings.length === 0 || window.confirm(`${warnings.join('\n')}\n\n確定要匯出嗎？`);

const EDITOR_TIPS = (
  <>
    <div>拖曳節點調整形狀。</div>
    <div>雙擊節點刪除。</div>
    <div>點線段新增節點。Ctrl/Cmd+Z 復原。</div>
  </>
);

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('editor');
  const sourceApi = useSourceImage(DEFAULT_DPI);
  const { source } = sourceApi;
  const client = useGeometryClient();
  const imageId = useWorkerImage(client, source?.current ?? null);

  const [cutParams, setCutParams] = useState<CutlineParams>(DEFAULT_CUTLINE_PARAMS);
  const [cutStyle, setCutStyle] = useState<DisplayStyle>(DEFAULT_CUT_STYLE);
  const dpi = source?.current.dpi ?? null;
  const cutParamsPx = useMemo(() => (dpi ? cutlineParamsToPx(cutParams, dpi) : null), [cutParams, dpi]);
  const cutGeometry = useGeometry(client, 'cutline', imageId, cutParamsPx);
  const cut = useEditorSlot();

  const imposition = useImposition(activeTab === 'imposition');
  const impositionRef = useRef<ImpositionCanvasHandle>(null);
  const { guard, dialog } = useRegenerateGuard();

  // 會重新產生刀模的操作都經過這裡；確認後立刻清掉 dirty，避免拖拉桿時重複詢問
  const guardCut = useCallback(
    (action: () => void) => guard(cut.dirty ? ['Editor'] : [], () => { cut.clearDirty(); action(); }),
    [guard, cut],
  );

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

  const sourcePanel = (
    <SourcePanel
      source={source}
      loading={sourceApi.loading}
      error={sourceApi.error}
      onUpload={file => guardCut(() => void sourceApi.upload(file))}
      onDpiChange={d => guardCut(() => sourceApi.setDpi(d))}
    />
  );

  return (
    <div className="flex h-screen w-screen bg-black overflow-hidden font-sans">
      <Sidebar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} footer={activeTab === 'editor' ? EDITOR_TIPS : null}>
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
        <div className="absolute inset-0" hidden={activeTab !== 'imposition'}>
          <ImpositionCanvas ref={impositionRef} impositionState={imposition.impositionState} setImpositionState={imposition.setImpositionState} />
        </div>
      </main>

      <ConfirmDialog {...dialog} />
    </div>
  );
};

export default App;
