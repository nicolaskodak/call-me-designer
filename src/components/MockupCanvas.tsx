import React, { useEffect, useRef, useState } from 'react';
import { MockupState } from '../types';

interface MockupCanvasProps {
  mockupState: MockupState;
  setMockupState: React.Dispatch<React.SetStateAction<MockupState>>;
}

type DragState = {
  id: string;
  pointerOffsetX: number;
  pointerOffsetY: number;
} | null;

const MockupCanvas: React.FC<MockupCanvasProps> = ({ mockupState, setMockupState }) => {
  const boundaryRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<DragState>(null);

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

  const clearSelection = () => {
    setMockupState(prev => ({
      ...prev,
      selectedInstanceId: null,
    }));
  };

  return (
    <div className="absolute inset-0 flex items-center justify-center p-6">
      <div
        ref={boundaryRef}
        className="relative border-2 border-dashed border-neutral-700 rounded-lg overflow-hidden bg-neutral-900/20"
        style={{ width: mockupState.boundaryWidth, height: mockupState.boundaryHeight }}
        onMouseDown={clearSelection}
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
          const boxW = rotationDeg === 90 ? layer.height : layer.width;
          const boxH = rotationDeg === 90 ? layer.width : layer.height;

          const isSelected = mockupState.selectedInstanceId === instance.id;
          const isNotPlaced = mockupState.notPlacedInstanceIds.includes(instance.id);

          return (
          <div
            key={instance.id}
            className={
              `absolute cursor-move ${isNotPlaced ? 'opacity-70' : ''} ` +
              `${isSelected ? 'ring-2 ring-blue-500' : ''}`
            }
            style={{ left: instance.x, top: instance.y, width: boxW, height: boxH }}
            onMouseDown={(e) => handleMouseDown(e, instance.id)}
            role="button"
            aria-label={`Mockup item ${layer.name}`}
          >
            {isNotPlaced ? (
              <div className="absolute inset-0 border-2 border-red-500 rounded pointer-events-none" />
            ) : null}

            {rotationDeg === 90 ? (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ width: layer.width, height: layer.height, transformOrigin: 'top left', transform: `translateX(${layer.height}px) rotate(90deg)` }}
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
            ) : (
              <>
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
              </>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
};

export default MockupCanvas;
