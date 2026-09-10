import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { layerBoxMm, moveInstance, selectInstance } from '../imposition/state';
import type { ImpositionInstance, ImpositionLayer, ImpositionShow, ImpositionState } from '../imposition/types';
import { CSS_PX_PER_MM, MM_PER_INCH } from '../units';
import { nestedSvgMarkup } from '../utils/sanitizeSvg';

export interface ImpositionCanvasHandle {
  exportPDF(): Promise<void>;
}

interface Colors {
  cut: string;
  underprint: string;
}

interface ImpositionCanvasProps {
  state: ImpositionState;
  update: (fn: (s: ImpositionState) => ImpositionState) => void;
  colors: Colors;
}

type DragState = { id: string; offsetXMm: number; offsetYMm: number } | null;
type PanState = { x: number; y: number; left: number; top: number } | null;

const PDF_DPI = 300;
const MAX_CANVAS_PX = 4000;

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
  notPlaced: boolean;
  show: ImpositionShow;
  colors: Colors;
  onMouseDown: (e: React.MouseEvent, instance: ImpositionInstance) => void;
}

function ImpositionItem({ layer, instance, k, selected, notPlaced, show, colors, onMouseDown }: ItemProps) {
  const { w, h } = layerBoxMm(layer, instance.rotationDeg);
  const scale = (k * MM_PER_INCH) / layer.dpi;
  return (
    <div
      className={`absolute cursor-move overflow-hidden ${selected ? 'ring-2 ring-blue-500' : ''}`}
      style={{ left: instance.xMm * k, top: instance.yMm * k, width: w * k, height: h * k }}
      onMouseDown={e => onMouseDown(e, instance)}
      role="button"
      aria-label={`Imposition item ${layer.name}`}
      data-testid="imposition-item"
      data-not-placed={notPlaced ? 'true' : 'false'}
    >
      {notPlaced ? <div className="absolute inset-0 bg-yellow-200/40 pointer-events-none" /> : null}
      <div
        className="absolute left-0 top-0 pointer-events-none"
        style={{ width: layer.widthPx, height: layer.heightPx, transformOrigin: 'top left', transform: contentTransform(layer, instance.rotationDeg, scale) }}
      >
        <ItemContent layer={layer} show={show} colors={colors} />
      </div>
    </div>
  );
}

async function renderPdf(el: HTMLDivElement, widthMm: number, heightMm: number): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  const cssPxPerMm = el.offsetWidth / widthMm;
  const scale = Math.max(1, Math.min(MAX_CANVAS_PX / Math.max(el.offsetWidth, el.offsetHeight), PDF_DPI / MM_PER_INCH / cssPxPerMm));
  const prevBg = el.style.backgroundColor;
  el.style.backgroundColor = 'transparent';
  try {
    const canvas = await html2canvas(el, {
      backgroundColor: null,
      scale,
      useCORS: true,
      ignoreElements: node => node instanceof HTMLElement && node.dataset.notPlaced === 'true',
    });
    const doc = new jsPDF({ orientation: widthMm > heightMm ? 'l' : 'p', unit: 'mm', format: [widthMm, heightMm] });
    // PDF 頁面不支援真正透明，先鋪白底
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, widthMm, heightMm, 'F');
    doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, widthMm, heightMm);
    doc.save('imposition-layout.pdf');
  } finally {
    el.style.backgroundColor = prevBg;
  }
}

const ImpositionCanvas = forwardRef<ImpositionCanvasHandle, ImpositionCanvasProps>(({ state, update, colors }, ref) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const boundaryRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState>(null);
  const [pan, setPan] = useState<PanState>(null);
  const k = CSS_PX_PER_MM * state.zoom;
  const layerById = useMemo(() => new Map(state.layers.map(l => [l.id, l] as const)), [state.layers]);
  const notPlaced = useMemo(() => new Set(state.notPlacedInstanceIds), [state.notPlacedInstanceIds]);

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
    exportPDF: async () => {
      if (boundaryRef.current) await renderPdf(boundaryRef.current, state.boundaryWidthMm, state.boundaryHeightMm);
    },
  }), [state.boundaryWidthMm, state.boundaryHeightMm]);

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
    <div ref={viewportRef} className={`absolute inset-0 overflow-auto ${pan ? 'cursor-grabbing' : 'cursor-grab'}`}>
      <div className="min-w-full min-h-full flex items-center justify-center p-6">
        <div
          ref={boundaryRef}
          className="relative shrink-0 border-2 border-dashed border-neutral-700 rounded-lg overflow-hidden bg-neutral-900/20"
          style={{ width: state.boundaryWidthMm * k, height: state.boundaryHeightMm * k }}
          onMouseDown={onBoundaryMouseDown}
        >
          {state.instances.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-500 pointer-events-none">
              <p className="text-lg font-medium">尚無排版項目</p>
              <p className="text-sm opacity-60">從 Editor／Underprint 送過來，或上傳「圖＋SVG」配對。</p>
            </div>
          ) : null}
          {state.instances.map(instance => {
            const layer = layerById.get(instance.layerId);
            return layer ? (
              <React.Fragment key={instance.id}>
                <ImpositionItem
                  layer={layer}
                  instance={instance}
                  k={k}
                  selected={state.selectedInstanceId === instance.id}
                  notPlaced={notPlaced.has(instance.id)}
                  show={state.show}
                  colors={colors}
                  onMouseDown={onItemMouseDown}
                />
              </React.Fragment>
            ) : null;
          })}
        </div>
      </div>
    </div>
  );
});

ImpositionCanvas.displayName = 'ImpositionCanvas';
export default ImpositionCanvas;
