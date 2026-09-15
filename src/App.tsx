import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConfirmDialog } from './components/ConfirmDialog';
import { GeometryView } from './components/GeometryView';
import ImpositionCanvas, { type ImpositionCanvasHandle } from './components/ImpositionCanvas';
import { CutlinePanel } from './components/panels/CutlinePanel';
import { ImpositionPanel } from './components/panels/ImpositionPanel';
import { SourcePanel } from './components/panels/SourcePanel';
import { UnderprintPanel } from './components/panels/UnderprintPanel';
import { Sidebar, type TabDef } from './components/Sidebar';
import { Toast } from './components/Toast';
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
import { BackgroundRemovalSection } from './components/panels/BackgroundRemovalSection';
import { SettingsPage } from './components/panels/SettingsPage';
import { useEditorSlot, type EditorSlot } from './hooks/useEditorSlot';
import { useBackgroundRemoval } from './hooks/useBackgroundRemoval';
import { useBlockWindowFileDrop } from './hooks/useFileDrop';
import { useGeometry } from './hooks/useGeometry';
import { useGeometryClient } from './hooks/useGeometryClient';
import { useImposition } from './hooks/useImposition';
import { useSourceImage } from './hooks/useSourceImage';
import { useWorkerImage } from './hooks/useWorkerImage';
import { downloadImpositionLayers, downloadImpositionSvg } from './imposition/exportFile';
import type { ImpositionLayerKind } from './imposition/types';
import { useSettings } from './settings/SettingsContext';
import { DEFAULT_CUT_STYLE, DEFAULT_UNDERPRINT_STYLE, type ActiveTab, type DisplayStyle } from './types';
import { downloadText } from './utils/download';

const TABS: readonly TabDef[] = [
  { id: 'editor', label: 'Editor' },
  { id: 'underprint', label: 'Underprint' },
  { id: 'imposition', label: 'Imposition' },
  { id: 'settings', label: '設定' },
];

const SVG_MIME = 'image/svg+xml;charset=utf-8';

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
  const { settings } = useSettings();
  useBlockWindowFileDrop();
  const exportColors = settings.exportColors;
  const [activeTab, setActiveTab] = useState<ActiveTab>('editor');
  const sourceApi = useSourceImage(settings.defaultDpi);
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

  const imposition = useImposition(activeTab === 'imposition', settings.defaultDpi, settings.sheetSizes);
  const [notice, setNotice] = useState<string | null>(null);
  const clearNotice = useCallback(() => setNotice(null), []);
  const impositionRef = useRef<ImpositionCanvasHandle>(null);
  const [isPdfExporting, setIsPdfExporting] = useState(false);
  const [isSvgExporting, setIsSvgExporting] = useState(false);
  /** 三個 SVG 匯出按鈕共用同一個重入防護：同時只該有一組 SVG 匯出在跑 */
  const svgExportingRef = useRef(false);
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

  const bgRemoval = useBackgroundRemoval(settings, sourceApi.replaceCurrent);
  const removeBackground = () => {
    if (!source) return;
    // 一律從原圖去背，避免對已處理過的結果再處理一次
    const input = source.original?.blob ?? source.current.blob;
    guardSource(() => void bgRemoval.remove(input, source.id));
  };
  const revertOriginal = () => guardSource(() => sourceApi.revertToOriginal());

  const exportCut = (kind: 'aligned' | 'trimmed') => {
    const editor = cut.ref.current;
    if (!source || !editor || !confirmExport(cutGeometry.result?.warnings ?? [])) return;
    const { widthPx, heightPx, dpi: d } = source.current;
    const paths = editor.getPathData();
    if (kind === 'aligned') {
      downloadText(buildAlignedSvg({ kind: 'cut', paths, widthPx, heightPx, dpi: d, color: exportColors.cut }), `${source.name}-cut.svg`, SVG_MIME);
      return;
    }
    const bounds = editor.getBounds();
    if (bounds) downloadText(buildTrimmedCutSvg({ paths, bounds, dpi: d, color: exportColors.cut }), `${source.name}-cut-trimmed.svg`, SVG_MIME);
  };

  const exportPdf = () => {
    const editor = cut.ref.current;
    if (!source || !editor || !confirmExport(cutGeometry.result?.warnings ?? [])) return;
    const { widthPx, heightPx, dpi: d } = source.current;
    exportCutPdf(
      { image: editor.getImage(), curveSets: editor.getCurveSets(), widthPx, heightPx, dpi: d, color: exportColors.cut },
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
    const svg = buildAlignedSvg({ kind: 'underprint', paths: editor.getPathData(), widthPx, heightPx, dpi: d, color: exportColors.underprint });
    downloadText(svg, `${source.name}-underprint.svg`, SVG_MIME);
  };

  const sendToImposition = () => {
    const cutEditor = cut.ref.current;
    if (!source || !cutEditor) return;
    const underPaths = underprintEnabled ? under.ref.current?.getPathData() ?? [] : [];
    const { blob, widthPx, heightPx, dpi: d } = source.current;
    imposition.sendFromSource({
      sourceId: source.id,
      name: source.name,
      blob,
      widthPx,
      heightPx,
      dpi: d,
      cutPaths: cutEditor.getPathData(),
      cutBounds: cutEditor.getBounds(),
      underprint: underPaths.length > 0 ? underPaths : null,
    });
    setActiveTab('imposition');
    setNotice(underPaths.length > 0 ? '已送到 Imposition（含白墨）' : '已送到 Imposition（不含白墨）');
  };

  const exportImposition = (kinds: readonly ImpositionLayerKind[], baseName: string) => {
    // 重入防護：連點兩次任一顆 SVG 匯出按鈕，兩個迴圈交錯送出下載會讓檔名重複、
    // 數量對不上「已匯出 N 個」的宣稱——三個按鈕共用同一個旗標，因為同時只該有
    // 一組 SVG 匯出在跑。用 ref 同步檢查，button 的 disabled 只是第二層防線
    // （React 重新渲染前的空窗期擋不住連點）。
    if (svgExportingRef.current) return;
    svgExportingRef.current = true;
    setIsSvgExporting(true);
    downloadImpositionSvg(imposition.state, kinds, exportColors, baseName)
      .then(count => {
        // count === 0：目前沒有任何可匯出的版面（與 PDF 側的 'nothing-to-export' 是
        // 同一個邊緣情況），不能顯示「已匯出」——使用者會以為拿到了檔案，其實一個都沒有。
        if (count === 0) return;
        setNotice(count > 1 ? `已匯出 ${count} 個 SVG 檔（每張版面一檔）` : '已匯出 SVG');
      })
      .catch((err: unknown) => {
        console.error('匯出 Imposition SVG 失敗', err);
        window.alert('匯出 SVG 失敗，請再試一次。');
      })
      .finally(() => {
        svgExportingRef.current = false;
        setIsSvgExporting(false);
      });
  };

  /** 「分層 SVG」按鈕：每層每張有內容的版面各出一檔，與 exportImposition 共用同一組重入防護 */
  const exportImpositionLayers = () => {
    if (svgExportingRef.current) return;
    svgExportingRef.current = true;
    setIsSvgExporting(true);
    downloadImpositionLayers(imposition.state, exportColors, 'imposition')
      .then(count => {
        if (count === 0) return;
        setNotice(count > 1 ? `已匯出 ${count} 個 SVG 檔（分層，每張版面每層一檔）` : '已匯出 SVG');
      })
      .catch((err: unknown) => {
        console.error('匯出 Imposition SVG 失敗', err);
        window.alert('匯出 SVG 失敗，請再試一次。');
      })
      .finally(() => {
        svgExportingRef.current = false;
        setIsSvgExporting(false);
      });
  };

  const uploadImposition = (files: File[]) => {
    imposition.uploadPairs(files).then(skipped => {
      if (skipped.length > 0) window.alert(`以下檔名沒有配對成「圖片＋SVG」或無法載入，已略過：\n\n${skipped.join('\n')}`);
    }).catch((err: unknown) => console.error('上傳配對失敗', err));
  };

  const sourcePanel = (
    <SourcePanel
      source={source}
      loading={sourceApi.loading}
      error={sourceApi.error}
      onUpload={file => guardSource(() => {
        // 換圖時中止進行中的去背，避免結果套到新圖上
        bgRemoval.cancel();
        void sourceApi.upload(file);
      })}
      onDpiChange={d => guardSource(() => sourceApi.setDpi(d))}
    >
      <BackgroundRemovalSection
        source={source}
        hasKey={settings.removeBg.apiKey.trim().length > 0}
        size={settings.removeBg.size}
        busy={bgRemoval.busy || sourceApi.loading}
        error={bgRemoval.error}
        onRemove={removeBackground}
        onRevert={revertOriginal}
        onOpenSettings={() => setActiveTab('settings')}
      />
    </SourcePanel>
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
              onSendToImposition={sendToImposition}
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
              onSendToImposition={sendToImposition}
            />
          </>
        ) : null}
        {activeTab === 'imposition' ? (
          <ImpositionPanel
            state={imposition.state}
            update={imposition.update}
            sheetSizes={settings.sheetSizes}
            onUpload={uploadImposition}
            onSetLayerTotalCount={imposition.setLayerTotalCount}
            onAutoLayout={imposition.autoLayout}
            onFitZoom={() => {
              const z = impositionRef.current?.fitZoom();
              if (z) imposition.update(s => ({ ...s, zoom: z }));
            }}
            onExportLayers={exportImpositionLayers}
            onExportCut={() => exportImposition(['cut'], 'imposition-cut')}
            onExportUnderprint={() => exportImposition(['underprint'], 'imposition-underprint')}
            isSvgExporting={isSvgExporting}
            isPdfExporting={isPdfExporting}
            onExportPdf={() => {
              setIsPdfExporting(true);
              impositionRef.current
                ?.exportPDF((label, done, total) => setNotice(`正在產生 PDF：${label} ${done} / ${total} 頁`))
                .then(result => {
                  // 「不清旗標」是例外，只有一個理由能豁免：'skipped-busy' 表示這次呼叫被
                  // 重入防護擋下，旗標屬於還在跑的那次呼叫，該由它自己的 'exported' 分支清除
                  // ——這裡若跟著清，會在真正的匯出還沒完成時就讓按鈕提早解除停用。
                  // 除此之外的每一條結束路徑都必須清旗標：'exported' 是正常完成；
                  // 'nothing-to-export' 代表這次呼叫本身沒有任何人在跑，若不清，
                  // 旗標永遠不會歸零、按鈕會永久停用。
                  if (result === 'skipped-busy') return;
                  if (result === 'exported') setNotice('PDF 已匯出');
                  setIsPdfExporting(false);
                })
                .catch((err: unknown) => {
                  console.error('匯出 PDF 失敗', err);
                  window.alert('匯出 PDF 失敗，請再試一次。');
                  // 失敗一定要清旗標，否則按鈕會永遠停用
                  setIsPdfExporting(false);
                });
            }}
          />
        ) : null}
        {activeTab === 'settings' ? <SettingsPage /> : null}
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
          <ImpositionCanvas ref={impositionRef} state={imposition.state} update={imposition.update} colors={exportColors} onDropFiles={uploadImposition} />
        </div>
        {activeTab === 'settings' ? (
          <div className="absolute inset-0 flex items-center justify-center text-neutral-500 text-sm pointer-events-none">
            設定會自動儲存在這個瀏覽器。
          </div>
        ) : null}
        <Toast message={notice} onDone={clearNotice} />
      </main>

      <ConfirmDialog {...dialog} />
    </div>
  );
};

export default App;
