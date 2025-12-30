import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { MockupState } from '../types';

interface MockupCanvasProps {
  mockupState: MockupState;
  setMockupState: React.Dispatch<React.SetStateAction<MockupState>>;
}

export type MockupCanvasHandle = {
  exportPDF: () => Promise<void>;
};

type DragState = {
  id: string;
  pointerOffsetX: number;
  pointerOffsetY: number;
} | null;

type PanState = {
  pointerStartX: number;
  pointerStartY: number;
  scrollStartLeft: number;
  scrollStartTop: number;
} | null;

const MockupCanvas = forwardRef<MockupCanvasHandle, MockupCanvasProps>(({ mockupState, setMockupState }, ref) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const boundaryRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<DragState>(null);
  const [panState, setPanState] = useState<PanState>(null);

  const layerById = useRef<Map<string, MockupState['layers'][number]>>(new Map());
  useEffect(() => {
    layerById.current = new Map(mockupState.layers.map(l => [l.id, l]));
  }, [mockupState.layers]);

  useEffect(() => {
    if (!dragState) return;

    const onMouseMove = (e: MouseEvent) => {
      const boundaryEl = boundaryRef.current;
      if (!boundaryEl) return;

      const rect = boundaryEl.getBoundingClientRect();
      const x = e.clientX - rect.left - dragState.pointerOffsetX;
      const y = e.clientY - rect.top - dragState.pointerOffsetY;

      setMockupState(prev => ({
        ...prev,
        instances: prev.instances.map(item => (item.id === dragState.id ? { ...item, x, y } : item)),
      }));
    };

    const onMouseUp = () => {
      setDragState(null);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [dragState, setMockupState]);

  useEffect(() => {
    if (!panState) return;

    const onMouseMove = (e: MouseEvent) => {
      const viewportEl = viewportRef.current;
      if (!viewportEl) return;

      const dx = e.clientX - panState.pointerStartX;
      const dy = e.clientY - panState.pointerStartY;

      viewportEl.scrollLeft = panState.scrollStartLeft - dx;
      viewportEl.scrollTop = panState.scrollStartTop - dy;
    };

    const onMouseUp = () => {
      setPanState(null);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [panState]);

  useImperativeHandle(ref, () => ({
    exportPDF: async () => {
      const boundaryEl = boundaryRef.current;
      if (!boundaryEl) return;

      const w = Math.max(1, Math.floor(mockupState.boundaryWidth));
      const h = Math.max(1, Math.floor(mockupState.boundaryHeight));

      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);

      const maxDim = 4000;
      const scale = Math.max(1, Math.min(2, maxDim / Math.max(w, h)));

      const prevBg = boundaryEl.style.backgroundColor;
      boundaryEl.style.backgroundColor = 'transparent';
      try {
        const canvas = await html2canvas(boundaryEl, {
          backgroundColor: null,
          scale,
          useCORS: true,
          ignoreElements: (el) => {
            return el instanceof HTMLElement && el.dataset.notPlaced === 'true';
          },
        });

        const doc = new jsPDF({
          orientation: w > h ? 'l' : 'p',
          unit: 'px',
          format: [w, h],
          hotfixes: ['px_scaling'],
        });

        // PDF 頁面本身通常不支援真正透明；先填白底避免看到灰底。
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, w, h, 'F');

        const dataUrl = canvas.toDataURL('image/png');
        doc.addImage(dataUrl, 'PNG', 0, 0, w, h);
        doc.save('mockup-layout.pdf');
      } finally {
        boundaryEl.style.backgroundColor = prevBg;
      }
    },
  }), [mockupState.boundaryWidth, mockupState.boundaryHeight]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>, id: string) => {
    const boundaryEl = boundaryRef.current;
    if (!boundaryEl) return;

    const rect = boundaryEl.getBoundingClientRect();
    const pointerX = e.clientX - rect.left;
    const pointerY = e.clientY - rect.top;

    const instance = mockupState.instances.find(i => i.id === id);
    if (!instance) return;

    e.preventDefault();
    e.stopPropagation();

    setMockupState(prev => ({
      ...prev,
      selectedInstanceId: id,
    }));

    setDragState({
      id,
      pointerOffsetX: pointerX - instance.x,
      pointerOffsetY: pointerY - instance.y,
    });
  };

  const handleBoundaryMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const viewportEl = viewportRef.current;
    if (!viewportEl) return;
    if (e.button !== 0) return;

    setMockupState(prev => ({
      ...prev,
      selectedInstanceId: null,
    }));

    e.preventDefault();

    setPanState({
      pointerStartX: e.clientX,
      pointerStartY: e.clientY,
      scrollStartLeft: viewportEl.scrollLeft,
      scrollStartTop: viewportEl.scrollTop,
    });
  };

  return (
    <div
      ref={viewportRef}
      className={`absolute inset-0 overflow-auto ${panState ? 'cursor-grabbing' : 'cursor-grab'}`}
    >
      <div className="min-w-full min-h-full flex items-center justify-center p-6">
        <div
          ref={boundaryRef}
          className="relative border-2 border-dashed border-neutral-700 rounded-lg overflow-hidden bg-neutral-900/20"
          style={{ width: mockupState.boundaryWidth, height: mockupState.boundaryHeight }}
          onMouseDown={handleBoundaryMouseDown}
        >
        {mockupState.instances.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-500 pointer-events-none">
            <p className="text-lg font-medium">No Mockup Items</p>
            <p className="text-sm opacity-60">Upload image + SVG pairs to compose a mockup.</p>
          </div>
        ) : null}

        {mockupState.instances.map(instance => {
          const layer = layerById.current.get(instance.layerId);
          if (!layer) return null;

          const rotationDeg = instance.rotationDeg ?? 0;
          const layoutX = layer.layoutX ?? 0;
          const layoutY = layer.layoutY ?? 0;
          const layoutW = layer.layoutWidth ?? layer.width;
          const layoutH = layer.layoutHeight ?? layer.height;

          const boxW = rotationDeg === 90 ? layoutH : layoutW;
          const boxH = rotationDeg === 90 ? layoutW : layoutH;

          const contentTransform =
            rotationDeg === 90
              ? `translate(${layoutY + layoutH}px, ${-layoutX}px) rotate(90deg)`
              : `translate(${-layoutX}px, ${-layoutY}px)`;

          const isSelected = mockupState.selectedInstanceId === instance.id;
          const isNotPlaced = mockupState.notPlacedInstanceIds.includes(instance.id);

          return (
          <div
            key={instance.id}
            className={
              `absolute cursor-move overflow-hidden ` +
              `${isSelected ? 'ring-2 ring-blue-500' : ''}`
            }
            style={{ left: instance.x, top: instance.y, width: boxW, height: boxH }}
            onMouseDown={(e) => handleMouseDown(e, instance.id)}
            role="button"
            aria-label={`Mockup item ${layer.name}`}
            data-not-placed={isNotPlaced ? 'true' : 'false'}
          >
            {isNotPlaced ? (
              <div className="absolute inset-0 bg-yellow-200/40 pointer-events-none" />
            ) : null}

            <div
              className="absolute inset-0 pointer-events-none"
              style={{ width: layer.width, height: layer.height, transformOrigin: 'top left', transform: contentTransform }}
            >
              <img
                src={layer.imageUrl}
                alt={layer.name}
                draggable={false}
                className="absolute inset-0 w-full h-full select-none pointer-events-none"
              />
              <div
                className="absolute inset-0 pointer-events-none"
                // User-provided SVG. Intended for local composition.
                dangerouslySetInnerHTML={{ __html: layer.svgText }}
              />
            </div>
          </div>
          );
        })}
        </div>
      </div>
    </div>
  );
});

export default MockupCanvas;
