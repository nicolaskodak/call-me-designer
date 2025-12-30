import React, { useEffect, useState, useRef, useCallback } from 'react';
import EditorCanvas, { EditorCanvasHandle } from './components/EditorCanvas';
import Controls from './components/Controls';
import MockupCanvas, { MockupCanvasHandle } from './components/MockupCanvas';
import { ActiveTab, AppState, DEFAULT_MOCKUP_STATE, DEFAULT_STATE, MockupInstance, MockupLayer, MockupState } from './types';
import { loadImage } from './utils/imageProcessing';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('editor');
  const [appState, setAppState] = useState<AppState>(DEFAULT_STATE);
  const [mockupState, setMockupState] = useState<MockupState>(DEFAULT_MOCKUP_STATE);
  const [segmentCount, setSegmentCount] = useState(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  
  const editorRef = useRef<EditorCanvasHandle>(null);
  const mockupRef = useRef<MockupCanvasHandle>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      try {
        const img = await loadImage(url);
        setAppState(prev => ({
          ...prev,
          imageUrl: url,
          imageWidth: img.width,
          imageHeight: img.height,
          // Reset somewhat on new image but keep preferences
          threshold: 10,
          blurRadius: 15
        }));
        // Reset undo/redo state when new image loads
        setCanUndo(false);
        setCanRedo(false);
      } catch (err) {
        console.error("Failed to load image", err);
        alert("Failed to load image. Please try a valid PNG.");
      }
    }
  };

  const normalizeSvgForOverlay = (svgText: string) => {
    // Ensure the top-level <svg> scales to the item's box.
    // We keep this as a minimal string transform to avoid adding deps.
    const hasWidth = /<svg[^>]*\swidth=/.test(svgText);
    const hasHeight = /<svg[^>]*\sheight=/.test(svgText);

    let result = svgText;
    if (!hasWidth) {
      result = result.replace(/<svg(\s|>)/, '<svg width="100%"$1');
    }
    if (!hasHeight) {
      result = result.replace(/<svg(\s|>)/, '<svg height="100%"$1');
    }
    return result;
  };

  const measureSvgBBox = (svgText: string, viewportW: number, viewportH: number, padding = 2) => {
    const host = document.createElement('div');
    host.style.position = 'absolute';
    host.style.left = '-100000px';
    host.style.top = '-100000px';
    host.style.width = '0';
    host.style.height = '0';
    host.style.overflow = 'hidden';
    host.style.visibility = 'hidden';

    try {
      host.innerHTML = svgText.trim();
      const svg = host.querySelector('svg') as SVGGraphicsElement | null;
      if (!svg) {
        return { x: 0, y: 0, width: viewportW, height: viewportH };
      }

      svg.setAttribute('width', String(viewportW));
      svg.setAttribute('height', String(viewportH));

      document.body.appendChild(host);
      const bbox = svg.getBBox();

      const x0 = Math.max(0, bbox.x - padding);
      const y0 = Math.max(0, bbox.y - padding);
      const x1 = Math.min(viewportW, bbox.x + bbox.width + padding);
      const y1 = Math.min(viewportH, bbox.y + bbox.height + padding);

      const width = Math.max(1, x1 - x0);
      const height = Math.max(1, y1 - y0);

      return { x: x0, y: y0, width, height };
    } catch {
      return { x: 0, y: 0, width: viewportW, height: viewportH };
    } finally {
      if (host.parentNode) host.parentNode.removeChild(host);
    }
  };

  const newId = () => {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  const setLayerTotalCount = (layerId: string, totalCount: number) => {
    const safeTotal = Math.max(0, Math.floor(Number.isFinite(totalCount) ? totalCount : 0));

    setMockupState(prev => {
      if (safeTotal === 0) {
        const instanceIds = new Set(prev.instances.filter(i => i.layerId === layerId).map(i => i.id));
        const layers = prev.layers.filter(l => l.id !== layerId);
        const instances = prev.instances.filter(i => i.layerId !== layerId);
        const selectedInstanceId = prev.selectedInstanceId && instanceIds.has(prev.selectedInstanceId)
          ? null
          : prev.selectedInstanceId;
        const notPlacedInstanceIds = prev.notPlacedInstanceIds.filter(id => !instanceIds.has(id));

        return {
          ...prev,
          layers,
          instances,
          selectedInstanceId,
          notPlacedInstanceIds,
          lastLayoutMessage: null,
        };
      }

      const layers = prev.layers.map(l => (l.id === layerId ? { ...l, totalCount: safeTotal } : l));

      const instancesForLayer = prev.instances.filter(i => i.layerId === layerId);
      const requiredTotal = safeTotal;

      let instances: MockupInstance[] = prev.instances;
      let removedIds: Set<string> | null = null;

      if (instancesForLayer.length > requiredTotal) {
        const keepIds = new Set(instancesForLayer.slice(0, requiredTotal).map(i => i.id));
        removedIds = new Set(instancesForLayer.filter(i => !keepIds.has(i.id)).map(i => i.id));
        instances = prev.instances.filter(i => i.layerId !== layerId || keepIds.has(i.id));
      } else if (instancesForLayer.length < requiredTotal) {
        const missingCount = requiredTotal - instancesForLayer.length;
        const additions: MockupInstance[] = Array.from({ length: missingCount }).map(() => ({
          id: newId(),
          layerId,
          x: 0,
          y: 0,
          rotationDeg: 0,
        }));
        instances = [...prev.instances, ...additions];
      }

      const selectedInstanceId = removedIds && prev.selectedInstanceId && removedIds.has(prev.selectedInstanceId)
        ? null
        : prev.selectedInstanceId;

      const notPlacedInstanceIds = removedIds
        ? prev.notPlacedInstanceIds.filter(id => !removedIds.has(id))
        : prev.notPlacedInstanceIds;

      return { ...prev, layers, instances, selectedInstanceId, notPlacedInstanceIds, lastLayoutMessage: null };
    });
  };

  type PackRect = { id: string; w: number; h: number };
  type PackPlacement = { id: string; x: number; y: number; rotationDeg: 0 | 90 };
  type PackResult = { placed: PackPlacement[]; notPlaced: string[] };

  const packWithinBoundary = (
    rects: PackRect[],
    boundaryWidth: number,
    boundaryHeight: number,
    allowRotate90: boolean
  ): PackResult => {
    type FreeRect = { x: number; y: number; w: number; h: number };
    let free: FreeRect[] = [{ x: 0, y: 0, w: boundaryWidth, h: boundaryHeight }];

    const placed: PackPlacement[] = [];
    const notPlaced: string[] = [];

    const fits = (r: FreeRect, w: number, h: number) => w <= r.w && h <= r.h;
    const area = (r: { w: number; h: number }) => r.w * r.h;

    const pruneContained = (rects: FreeRect[]) => {
      return rects.filter((a, idx) => {
        for (let j = 0; j < rects.length; j++) {
          if (j === idx) continue;
          const b = rects[j];
          const contained =
            a.x >= b.x &&
            a.y >= b.y &&
            a.x + a.w <= b.x + b.w &&
            a.y + a.h <= b.y + b.h;
          if (contained) return false;
        }
        return a.w > 0 && a.h > 0;
      });
    };

    const splitFreeRect = (r: FreeRect, w: number, h: number) => {
      // Place at (r.x, r.y). Split into right and bottom.
      const right: FreeRect = { x: r.x + w, y: r.y, w: r.w - w, h };
      const bottom: FreeRect = { x: r.x, y: r.y + h, w: r.w, h: r.h - h };
      const bottomRight: FreeRect = { x: r.x + w, y: r.y + h, w: r.w - w, h: r.h - h };

      // Keep a simple guillotine split plus leftover area.
      return pruneContained([right, bottom, bottomRight].filter(fr => fr.w > 0 && fr.h > 0));
    };

    const sorted = [...rects].sort((a, b) => area(b) - area(a));

    for (const rect of sorted) {
      const orientations: Array<{ w: number; h: number; rotationDeg: 0 | 90 }> = [
        { w: rect.w, h: rect.h, rotationDeg: 0 },
      ];
      if (allowRotate90 && rect.w !== rect.h) {
        orientations.push({ w: rect.h, h: rect.w, rotationDeg: 90 });
      }

      // choose best free rect by minimum leftover area
      let bestIndex = -1;
      let bestScore = Number.POSITIVE_INFINITY;
      let bestW = rect.w;
      let bestH = rect.h;
      let bestRot: 0 | 90 = 0;
      for (let i = 0; i < free.length; i++) {
        const fr = free[i];
        for (const opt of orientations) {
          if (!fits(fr, opt.w, opt.h)) continue;
          const score = area(fr) - opt.w * opt.h;
          if (
            score < bestScore ||
            (score === bestScore && opt.rotationDeg === 0 && bestRot === 90)
          ) {
            bestScore = score;
            bestIndex = i;
            bestW = opt.w;
            bestH = opt.h;
            bestRot = opt.rotationDeg;
          }
        }
      }

      if (bestIndex === -1) {
        notPlaced.push(rect.id);
        continue;
      }

      const target = free[bestIndex];
      placed.push({ id: rect.id, x: target.x, y: target.y, rotationDeg: bestRot });

      const newFree = splitFreeRect(target, bestW, bestH);
      free = [...free.slice(0, bestIndex), ...free.slice(bestIndex + 1), ...newFree];
      free = pruneContained(free);
    }

    return { placed, notPlaced };
  };

  const handleAutoLayout = () => {
    setMockupState(prev => {
      const layers = prev.layers.map(layer => {
        const missingLayout =
          layer.layoutWidth == null ||
          layer.layoutHeight == null ||
          layer.layoutX == null ||
          layer.layoutY == null;

        if (!missingLayout) return layer;

        const bbox = measureSvgBBox(layer.svgText, layer.width, layer.height);
        return {
          ...layer,
          layoutX: bbox.x,
          layoutY: bbox.y,
          layoutWidth: bbox.width,
          layoutHeight: bbox.height,
        };
      });

      const layerMap = new Map<string, MockupLayer>(layers.map(l => [l.id, l] as const));

      const baseInstances = prev.allowRotate90
        ? prev.instances
        : prev.instances.map(i => ({ ...i, rotationDeg: 0 as const }));

      const rects: PackRect[] = baseInstances
        .map(inst => {
          const layer = layerMap.get(inst.layerId);
          if (!layer) return null;
          return {
            id: inst.id,
            w: (layer.layoutWidth ?? layer.width) + prev.minGap,
            h: (layer.layoutHeight ?? layer.height) + prev.minGap,
          };
        })
        .filter((x): x is PackRect => Boolean(x));

      const result = packWithinBoundary(rects, prev.boundaryWidth, prev.boundaryHeight, prev.allowRotate90);
      const posMap = new Map<string, PackPlacement>(result.placed.map(p => [p.id, p] as const));

      const instances = baseInstances.map(inst => {
        const p = posMap.get(inst.id);
        if (!p) return inst;
        return { ...inst, x: p.x, y: p.y, rotationDeg: p.rotationDeg };
      });

      const notPlacedInstanceIds = result.notPlaced;

      const placedCount = result.placed.length;
      const notPlacedCount = result.notPlaced.length;
      const message = `排圖完成：塞得進去 ${placedCount} 個，塞不進去 ${notPlacedCount} 個。${prev.allowRotate90 ? '（允許 90° 旋轉）' : ''}`;

      return { ...prev, layers, instances, notPlacedInstanceIds, lastLayoutMessage: message };
    });
  };

  const deleteSelectedInstance = useCallback(() => {
    setMockupState(prev => {
      if (!prev.selectedInstanceId) return prev;
      const target = prev.instances.find(i => i.id === prev.selectedInstanceId);
      if (!target) return { ...prev, selectedInstanceId: null };

      const instances = prev.instances.filter(i => i.id !== target.id);
      const notPlacedInstanceIds = prev.notPlacedInstanceIds.filter(id => id !== target.id);

      // Decrement layer total; if becomes 0, delete the layer.
      const layer = prev.layers.find(l => l.id === target.layerId);
      if (!layer) {
        return { ...prev, instances, notPlacedInstanceIds, selectedInstanceId: null };
      }

      const newTotal = Math.max(0, (layer.totalCount ?? 0) - 1);
      if (newTotal === 0) {
        const layers = prev.layers.filter(l => l.id !== layer.id);
        const remainingInstances = instances.filter(i => i.layerId !== layer.id);
        return {
          ...prev,
          layers,
          instances: remainingInstances,
          notPlacedInstanceIds: notPlacedInstanceIds.filter(id => remainingInstances.some(i => i.id === id)),
          selectedInstanceId: null,
        };
      }

      const layers = prev.layers.map(l => (l.id === layer.id ? { ...l, totalCount: newTotal } : l));
      return { ...prev, layers, instances, notPlacedInstanceIds, selectedInstanceId: null };
    });
  }, []);

  useEffect(() => {
    if (activeTab !== 'mockup') return;

    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName?.toLowerCase();
      const isEditing =
        tag === 'input' ||
        tag === 'textarea' ||
        (el ? el.isContentEditable : false);
      if (isEditing) return;

      const key = e.key.toLowerCase();
      if (key === 'x' || e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelectedInstance();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTab, deleteSelectedInstance]);

  const handleMockupUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const groups = new Map<string, { image?: File; svg?: File }>();

    const getStem = (filename: string) => filename.replace(/\.[^.]+$/, '');

    for (const file of files) {
      const nameLower = file.name.toLowerCase();
      const stem = getStem(file.name);
      const entry = groups.get(stem) ?? {};

      const isSvg = file.type === 'image/svg+xml' || nameLower.endsWith('.svg');
      const isImage = file.type.startsWith('image/') && !isSvg;

      if (isSvg) entry.svg = file;
      if (isImage) entry.image = file;

      groups.set(stem, entry);
    }

    const missing: string[] = [];
    const layersToAdd: MockupLayer[] = [];
    const instancesToAdd: MockupInstance[] = [];

    for (const [stem, entry] of groups.entries()) {
      if (!entry.image || !entry.svg) {
        missing.push(stem);
        continue;
      }

      const imageUrl = URL.createObjectURL(entry.image);
      try {
        const [img, svgTextRaw] = await Promise.all([loadImage(imageUrl), entry.svg.text()]);
        const svgText = normalizeSvgForOverlay(svgTextRaw);
        const bbox = measureSvgBBox(svgText, img.width, img.height);

        const layerId = newId();
        layersToAdd.push({
          id: layerId,
          name: stem,
          imageUrl,
          svgText,
          width: img.width,
          height: img.height,
          layoutX: bbox.x,
          layoutY: bbox.y,
          layoutWidth: bbox.width,
          layoutHeight: bbox.height,
          totalCount: 1,
        });

        instancesToAdd.push({
          id: newId(),
          layerId,
          x: 0,
          y: 0,
          rotationDeg: 0,
        });
      } catch (err) {
        console.error('Failed to load mockup pair', stem, err);
        missing.push(stem);
      }
    }

    if (layersToAdd.length > 0) {
      setMockupState(prev => ({
        ...prev,
        layers: [...prev.layers, ...layersToAdd],
        instances: [...prev.instances, ...instancesToAdd],
        notPlacedInstanceIds: [],
        lastLayoutMessage: null,
      }));
    }

    if (missing.length > 0) {
      alert(`以下檔名未能配對到「圖片 + SVG」一組，已略過：\n\n${missing.join('\n')}`);
    }
  };

  const handleExportSvgAligned = () => {
    editorRef.current?.exportSVGAligned();
  };

  const handleExportSvgTrimmed = () => {
    editorRef.current?.exportSVGTrimmed();
  };

  const handleExportPDF = () => {
      if (editorRef.current) {
          editorRef.current.exportPDF();
      }
  };

  const handleExportMockupPDF = () => {
    mockupRef.current?.exportPDF();
  };

  const handleUndo = () => editorRef.current?.undo();
  const handleRedo = () => editorRef.current?.redo();

  const onHistoryChange = useCallback((u: boolean, r: boolean) => {
      setCanUndo(u);
      setCanRedo(r);
  }, []);

  return (
    <div className="flex h-screen w-screen bg-black overflow-hidden font-sans">
      <Controls 
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        appState={appState} 
        setAppState={setAppState} 
        onUpload={handleUpload}
        onMockupUpload={handleMockupUpload}
        mockupState={mockupState}
        setMockupState={setMockupState}
        onSetLayerTotalCount={setLayerTotalCount}
        onAutoLayout={handleAutoLayout}
        onExportMockupPDF={handleExportMockupPDF}
        onExportSvgAligned={handleExportSvgAligned}
        onExportSvgTrimmed={handleExportSvgTrimmed}
        onExportPDF={handleExportPDF}
        segmentCount={segmentCount}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={canUndo}
        canRedo={canRedo}
      />
      
      <main className="flex-1 relative h-full bg-[radial-gradient(#333_1px,transparent_1px)] [background-size:16px_16px] bg-neutral-900">
        {activeTab === 'mockup' ? (
          <MockupCanvas ref={mockupRef} mockupState={mockupState} setMockupState={setMockupState} />
        ) : !appState.imageUrl ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-500 pointer-events-none">
            <div className="w-24 h-24 mb-4 border-2 border-dashed border-neutral-700 rounded-xl flex items-center justify-center opacity-50">
               <span className="text-4xl">🖼️</span>
            </div>
            <p className="text-lg font-medium">No Image Loaded</p>
            <p className="text-sm opacity-60">Upload a PNG to start generating outlines.</p>
          </div>
        ) : (
          <EditorCanvas 
            ref={editorRef}
            appState={appState} 
            onPathChange={setSegmentCount}
            onHistoryChange={onHistoryChange}
          />
        )}
      </main>
    </div>
  );
};

export default App;