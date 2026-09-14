import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFileDrop } from '../hooks/useFileDrop';
import { layerBoxMm, moveInstance, selectInstance, selectSheet, sheetsWithContent, sheetUsage } from '../imposition/state';
import type { ImpositionInstance, ImpositionLayer, ImpositionShow, ImpositionSheet, ImpositionState } from '../imposition/types';
import { computeFitZoom } from '../imposition/zoom';
import { CSS_PX_PER_MM, MM_PER_INCH } from '../units';
import { nestedSvgMarkup } from '../utils/sanitizeSvg';
import { SheetTabs } from './SheetTabs';

/**
 * exportPDF 的結束方式，呼叫端必須依此決定誰該清「匯出中」的旗標：
 * - 'exported'：真的匯出了，由呼叫端顯示成功並清旗標。
 * - 'skipped-busy'：被重入防護擋下——有另一次呼叫正在跑，旗標屬於它，這次呼叫不清。
 * - 'nothing-to-export'：目前沒有任何呼叫在跑，只是沒有可匯出的版面；沒有其他呼叫會清這個旗標，
 *   這次呼叫必須自己清，否則旗標永遠不會歸零、按鈕永遠停用。
 */
export type ExportPdfResult = 'exported' | 'skipped-busy' | 'nothing-to-export';

export interface ImpositionCanvasHandle {
  exportPDF(onProgress?: (done: number, total: number) => void): Promise<ExportPdfResult>;
  /** 讓整個版面剛好放進目前的視窗；還沒掛上 DOM 時回傳 null */
  fitZoom(): number | null;
}

interface Colors {
  cut: string;
  underprint: string;
}

interface ImpositionCanvasProps {
  state: ImpositionState;
  update: (fn: (s: ImpositionState) => ImpositionState) => void;
  colors: Colors;
  onDropFiles: (files: File[]) => void;
}

type DragState = { id: string; offsetXMm: number; offsetYMm: number } | null;
type PanState = { x: number; y: number; left: number; top: number } | null;

/**
 * PDF 匯出用的畫面外暫存區快照。整個匯出過程要逐張版面依序截圖，中途使用者仍可以
 * 繼續操作畫布（拖曳、刪除、切換顯示、重新排圖甚至改設定色），若暫存區持續讀「當下」的
 * state／props，先截的頁與還沒截的頁就會落在不同時間點——輕則畫面不一致，重則版面 id
 * 已經被「排圖」整批換掉、filter 不到任何 instance 而生出空白頁，而且不會有任何錯誤。
 * 所以在按下匯出的當下把「這次要匯出什麼」整包凍結成快照，暫存區的渲染只讀這個快照，
 * 不再回頭讀外層的 state／layerById／colors。
 */
interface StageSnapshot {
  sheets: readonly { sheet: ImpositionSheet; instances: readonly ImpositionInstance[] }[];
  layerById: ReadonlyMap<string, ImpositionLayer>;
  show: ImpositionShow;
  colors: Colors;
}

const PDF_DPI = 300;
const MAX_CANVAS_PX = 4000;
/** 對應版面外層的 p-6 */
const VIEWPORT_PADDING_PX = 24;

/** 在 active 期間監聽整個視窗的滑鼠移動與放開 */
function useWindowMouse(active: boolean, onMove: (e: MouseEvent) => void, onUp: () => void): void {
  useEffect(() => {
    if (!active) return;
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [active, onMove, onUp]);
}

const contentTransform = (layer: ImpositionLayer, rotationDeg: 0 | 90, scale: number): string => {
  const { x, y, height } = layer.layoutBoxPx;
  const inner = rotationDeg === 90 ? `translate(${y + height}px, ${-x}px) rotate(90deg)` : `translate(${-x}px, ${-y}px)`;
  return `scale(${scale}) ${inner}`;
};

function ItemContent({ layer, show, colors }: { layer: ImpositionLayer; show: ImpositionShow; colors: Colors }) {
  const { widthPx: w, heightPx: h } = layer;
  const svgProps = { className: 'absolute inset-0 overflow-visible', width: w, height: h, viewBox: `0 0 ${w} ${h}` };
  return (
    <>
      {show.artwork ? (
        <img src={layer.imageUrl} alt={layer.name} draggable={false} className="absolute inset-0 w-full h-full select-none pointer-events-none" />
      ) : null}
      {show.underprint && layer.underprint ? (
        <svg {...svgProps}>
          {layer.underprint.map((p, i) => (
            <path key={i} d={p.d} fill={colors.underprint} fillOpacity={0.8} fillRule="evenodd" />
          ))}
        </svg>
      ) : null}
      {show.cut && layer.cut.kind === 'paths' ? (
        <svg {...svgProps}>
          {layer.cut.paths.map((p, i) => (
            <path key={i} d={p.d} fill="none" stroke={colors.cut} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
      ) : null}
      {show.cut && layer.cut.kind === 'svg' ? (
        <svg className="absolute inset-0 overflow-visible" width={w} height={h} dangerouslySetInnerHTML={{ __html: nestedSvgMarkup(layer.cut.svg, w, h) }} />
      ) : null}
    </>
  );
}

interface ItemProps {
  layer: ImpositionLayer;
  instance: ImpositionInstance;
  k: number;
  selected: boolean;
  show: ImpositionShow;
  colors: Colors;
  onMouseDown?: (e: React.MouseEvent, instance: ImpositionInstance) => void;
}

function ImpositionItem({ layer, instance, k, selected, show, colors, onMouseDown }: ItemProps) {
  const { w, h } = layerBoxMm(layer, instance.rotationDeg);
  const scale = (k * MM_PER_INCH) / layer.dpi;
  return (
    <div
      className={`absolute cursor-move overflow-hidden ${selected ? 'ring-2 ring-blue-500' : ''}`}
      style={{ left: instance.xMm * k, top: instance.yMm * k, width: w * k, height: h * k }}
      onMouseDown={onMouseDown ? e => onMouseDown(e, instance) : undefined}
      role="button"
      aria-label={`Imposition item ${layer.name}`}
      data-testid="imposition-item"
    >
      <div
        className="absolute left-0 top-0 pointer-events-none"
        style={{ width: layer.widthPx, height: layer.heightPx, transformOrigin: 'top left', transform: contentTransform(layer, instance.rotationDeg, scale) }}
      >
        <ItemContent layer={layer} show={show} colors={colors} />
      </div>
    </div>
  );
}

interface SheetBoardProps {
  sheet: ImpositionSheet;
  instances: readonly ImpositionInstance[];
  layerById: ReadonlyMap<string, ImpositionLayer>;
  k: number;
  show: ImpositionShow;
  colors: Colors;
  selectedInstanceId?: string | null;
  onItemMouseDown?: (e: React.MouseEvent, instance: ImpositionInstance) => void;
  onMouseDown?: (e: React.MouseEvent) => void;
  boardRef?: (el: HTMLDivElement | null) => void;
}

/** 一張版面的內容。實況畫布與 PDF 暫存區共用，兩邊必須畫出一樣的東西 */
function SheetBoard(props: SheetBoardProps) {
  const { sheet, instances, layerById, k, show, colors } = props;
  return (
    <div
      ref={props.boardRef}
      className="relative shrink-0 border-2 border-dashed border-neutral-700 rounded-lg overflow-hidden bg-neutral-900/20"
      style={{ width: sheet.widthMm * k, height: sheet.heightMm * k }}
      onMouseDown={props.onMouseDown}
    >
      {instances.map(instance => {
        const layer = layerById.get(instance.layerId);
        return layer ? (
          <React.Fragment key={instance.id}>
            <ImpositionItem
              layer={layer}
              instance={instance}
              k={k}
              selected={props.selectedInstanceId === instance.id}
              show={show}
              colors={colors}
              onMouseDown={props.onItemMouseDown}
            />
          </React.Fragment>
        ) : null;
      })}
    </div>
  );
}

/** 等兩次 rAF，確保 React 剛掛上的暫存區已經完成排版 */
const nextPaint = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

async function captureSheet(el: HTMLDivElement, widthMm: number): Promise<string> {
  const { default: html2canvas } = await import('html2canvas');
  const cssPxPerMm = el.offsetWidth / widthMm;
  if (!Number.isFinite(cssPxPerMm) || cssPxPerMm <= 0) throw new Error('版面尚未排版完成，無法匯出');
  const scale = Math.max(1, Math.min(MAX_CANVAS_PX / Math.max(el.offsetWidth, el.offsetHeight), PDF_DPI / MM_PER_INCH / cssPxPerMm));
  const prevBg = el.style.backgroundColor;
  el.style.backgroundColor = 'transparent';
  try {
    const canvas = await html2canvas(el, { backgroundColor: null, scale, useCORS: true });
    return canvas.toDataURL('image/png');
  } finally {
    el.style.backgroundColor = prevBg;
  }
}

async function buildSheetsPdf(pages: readonly { dataUrl: string; widthMm: number; heightMm: number }[]): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const first = pages[0];
  const doc = new jsPDF({ orientation: first.widthMm > first.heightMm ? 'l' : 'p', unit: 'mm', format: [first.widthMm, first.heightMm] });
  pages.forEach((page, index) => {
    if (index > 0) doc.addPage([page.widthMm, page.heightMm], page.widthMm > page.heightMm ? 'l' : 'p');
    // PDF 頁面不支援真正透明，先鋪白底
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, page.widthMm, page.heightMm, 'F');
    doc.addImage(page.dataUrl, 'PNG', 0, 0, page.widthMm, page.heightMm);
  });
  doc.save('imposition-layout.pdf');
}

const ImpositionCanvas = forwardRef<ImpositionCanvasHandle, ImpositionCanvasProps>(({ state, update, colors, onDropFiles }, ref) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const boundaryRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState>(null);
  const [pan, setPan] = useState<PanState>(null);
  const [stage, setStage] = useState<StageSnapshot | null>(null);
  const stageRefs = useRef(new Map<string, HTMLDivElement>());
  /** exportPDF 的重入防護：連點兩次「PDF 預覽」不會啟動第二個並行匯出去搶同一份 stageRefs */
  const exportingRef = useRef(false);
  const { isOver, dropProps } = useFileDrop(onDropFiles);
  const k = CSS_PX_PER_MM * state.zoom;
  const layerById = useMemo(() => new Map(state.layers.map(l => [l.id, l] as const)), [state.layers]);
  const sheet = state.sheets.find(s => s.id === state.activeSheetId) ?? state.sheets[0];
  const visible = useMemo(
    () => state.instances.filter(i => i.sheetId === state.activeSheetId),
    [state.instances, state.activeSheetId],
  );
  const usageById = useMemo(
    () => new Map(state.sheets.map(s => [s.id, sheetUsage(state, s.id)] as const)),
    [state.sheets, state.instances, state.layers, state.minGapMm],
  );

  const pointerMm = (e: { clientX: number; clientY: number }) => {
    const rect = boundaryRef.current?.getBoundingClientRect();
    return rect ? { x: (e.clientX - rect.left) / k, y: (e.clientY - rect.top) / k } : null;
  };

  const onDragMove = (e: MouseEvent) => {
    const p = pointerMm(e);
    if (drag && p) update(s => moveInstance(s, drag.id, p.x - drag.offsetXMm, p.y - drag.offsetYMm));
  };
  const onPanMove = (e: MouseEvent) => {
    const viewport = viewportRef.current;
    if (!pan || !viewport) return;
    viewport.scrollLeft = pan.left - (e.clientX - pan.x);
    viewport.scrollTop = pan.top - (e.clientY - pan.y);
  };
  useWindowMouse(drag !== null, onDragMove, () => setDrag(null));
  useWindowMouse(pan !== null, onPanMove, () => setPan(null));

  useImperativeHandle(ref, () => ({
    exportPDF: async (onProgress?: (done: number, total: number) => void) => {
      // 重入防護：正在匯出時再次呼叫直接不做事，避免兩個呼叫共用同一份 stageRefs／stage
      // ——先跑完的那個在 finally 清空暫存區，會讓還在跑的那個拿不到元素而悄悄漏頁。
      // 回傳 'skipped-busy' 而不是直接 resolve：呼叫端必須能分辨「這次真的匯出了」與
      // 「這次被擋下、什麼都沒做」，否則被擋下的呼叫會提早宣告成功、提早清掉
      // 「匯出中」的旗標，讓使用者在真正的匯出還沒完成時就以為結束了。
      // 這次呼叫沒有做任何事，「匯出中」的旗標屬於正在跑的那次呼叫，不由這裡清除。
      if (exportingRef.current) return 'skipped-busy';
      exportingRef.current = true;
      try {
        const sheets = sheetsWithContent(state);
        // 目前不可達：按鈕的 hasExportableItems 只檢查「有 instance 掛在某張版面」，
        // sheetsWithContent 額外要求該 instance 引用的圖層還存在——reducer 保證
        // instance 一定引用著存在的圖層，所以兩者實際上不會分岔。但這個保證來自
        // 別處（reducer 的不變式），不是這段程式碼自己保證的；一旦那個不變式未來
        // 改變，這裡就會是「沒有任何呼叫在跑」的情況，若沿用 'skipped-busy' 的語意
        // （旗標由別人清）就會沒有人清旗標，PDF 按鈕永久停用。所以獨立用
        // 'nothing-to-export' 表示「沒事做，但旗標由我自己清」。
        if (sheets.length === 0) return 'nothing-to-export';
        // 在按下的當下把要匯出的內容整包凍結成快照，避免匯出途中使用者的操作
        // （拖曳、刪除、切換顯示、重新排圖、改色）讓還沒截圖的版面讀到不一致的資料
        const snapshot: StageSnapshot = {
          sheets: sheets.map(s => ({ sheet: s, instances: state.instances.filter(i => i.sheetId === s.id) })),
          layerById,
          show: state.show,
          colors,
        };
        setStage(snapshot);
        try {
          await nextPaint();
          const pages: { dataUrl: string; widthMm: number; heightMm: number }[] = [];
          for (const [index, { sheet: s }] of snapshot.sheets.entries()) {
            const el = stageRefs.current.get(s.id);
            // 預期存在卻拿不到 el 一律視為失敗：安靜跳過會少一頁卻不會被任何人發現
            if (!el) throw new Error(`版面 ${s.id} 的暫存區元素不存在，無法匯出`);
            pages.push({ dataUrl: await captureSheet(el, s.widthMm), widthMm: s.widthMm, heightMm: s.heightMm });
            onProgress?.(index + 1, snapshot.sheets.length);
          }
          // 走到這裡 snapshot.sheets.length 必然 > 0（前面已經 return 'nothing-to-export'），
          // 迴圈裡缺 el 也一律 throw，所以 pages.length 必然等於版面數：這個檢查理論上
          // 不會成立。但如果這個推論未來被打破，寧可明確拋錯，也不要悄悄跳過
          // buildSheetsPdf 卻仍然 return 'exported'——那正是「沒存檔卻回報成功」。
          if (pages.length === 0) throw new Error('沒有任何版面成功截圖，無法產生 PDF');
          await buildSheetsPdf(pages);
          return 'exported';
        } finally {
          setStage(null);
          stageRefs.current.clear();
        }
      } finally {
        exportingRef.current = false;
      }
    },
    fitZoom: () => {
      const viewport = viewportRef.current;
      if (!viewport) return null;
      return computeFitZoom(viewport.clientWidth, viewport.clientHeight, sheet.widthMm, sheet.heightMm, VIEWPORT_PADDING_PX);
    },
  }), [state, layerById, colors]);

  const onItemMouseDown = (e: React.MouseEvent, instance: ImpositionInstance) => {
    const p = pointerMm(e);
    if (!p) return;
    e.preventDefault();
    e.stopPropagation();
    update(s => selectInstance(s, instance.id));
    setDrag({ id: instance.id, offsetXMm: p.x - instance.xMm, offsetYMm: p.y - instance.yMm });
  };

  const onBoundaryMouseDown = (e: React.MouseEvent) => {
    const viewport = viewportRef.current;
    if (!viewport || e.button !== 0) return;
    e.preventDefault();
    update(s => selectInstance(s, null));
    setPan({ x: e.clientX, y: e.clientY, left: viewport.scrollLeft, top: viewport.scrollTop });
  };

  return (
    <div className="absolute inset-0 flex flex-col">
      <SheetTabs
        sheets={state.sheets}
        activeSheetId={state.activeSheetId}
        usageById={usageById}
        onSelect={id => update(s => selectSheet(s, id))}
      />
      <div
        ref={viewportRef}
        {...dropProps}
        data-testid="imposition-canvas-dropzone"
        data-drag-over={isOver ? 'true' : undefined}
        className={`relative flex-1 overflow-auto ${pan ? 'cursor-grabbing' : 'cursor-grab'} ${isOver ? 'ring-2 ring-inset ring-blue-500' : ''}`}
      >
        <div className="min-w-full min-h-full flex flex-col items-center justify-center gap-3 p-6">
          {state.instances.length === 0 ? (
            <div className="flex flex-col items-center text-neutral-500 pointer-events-none">
              <p className="text-lg font-medium">尚無排版項目</p>
              <p className="text-sm opacity-60">從 Editor／Underprint 送過來，或拖曳「圖＋SVG」配對進來。</p>
            </div>
          ) : null}
          <SheetBoard
            sheet={sheet}
            instances={visible}
            layerById={layerById}
            k={k}
            show={state.show}
            colors={colors}
            selectedInstanceId={state.selectedInstanceId}
            onItemMouseDown={onItemMouseDown}
            onMouseDown={onBoundaryMouseDown}
            boardRef={el => { boundaryRef.current = el; }}
          />
        </div>
      </div>
      {stage
        ? createPortal(
            // `position: fixed` 沒辦法脫離祖先的 `display: none`——三個分頁都是用 `hidden`
            // 隱藏而非卸載（見 App.tsx），匯出途中如果使用者切到別的分頁，這個容器所在的
            // 祖先會被 `[hidden] { display: none !important; }` 整棵蓋掉，還沒截圖的版面
            // `offsetWidth` 會變 0，觸發 captureSheet 的防護而讓整次匯出失敗、已截好的頁全部
            // 作廢。用 createPortal 掛到 document.body，讓暫存區脫離那個祖先，匯出才不會
            // 受分頁切換影響。
            <div className="fixed top-0 pointer-events-none" style={{ left: -100000 }} aria-hidden data-testid="pdf-export-stage">
              {stage.sheets.map(({ sheet, instances }) => (
                <React.Fragment key={sheet.id}>
                  <SheetBoard
                    sheet={sheet}
                    instances={instances}
                    layerById={stage.layerById}
                    k={CSS_PX_PER_MM}
                    show={stage.show}
                    colors={stage.colors}
                    boardRef={el => {
                      if (el) stageRefs.current.set(sheet.id, el);
                      else stageRefs.current.delete(sheet.id);
                    }}
                  />
                </React.Fragment>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
});

ImpositionCanvas.displayName = 'ImpositionCanvas';
export default ImpositionCanvas;
