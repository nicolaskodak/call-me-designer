import React, { useCallback, useEffect, useState } from 'react';
import { isTypingTarget } from '../editor/keyboard';
import { packWithinBoundary, type PackPlacement, type PackRect } from '../imposition/packing';
import {
  DEFAULT_IMPOSITION_STATE,
  type ImpositionInstance,
  type ImpositionLayer,
  type ImpositionState,
} from '../types';
import { newId } from '../utils/id';
import { loadImage } from '../utils/imageProcessing';

export interface ImpositionApi {
  impositionState: ImpositionState;
  setImpositionState: React.Dispatch<React.SetStateAction<ImpositionState>>;
  setLayerTotalCount: (layerId: string, totalCount: number) => void;
  handleAutoLayout: () => void;
  handleImpositionUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
}

/** 第 5 階段會改寫成 mm 版面與純函式 reducer；這裡只是從 App.tsx 搬出來 */
export function useImposition(active: boolean): ImpositionApi {
  const [impositionState, setImpositionState] = useState<ImpositionState>(DEFAULT_IMPOSITION_STATE);

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

  const setLayerTotalCount = (layerId: string, totalCount: number) => {
    const safeTotal = Math.max(0, Math.floor(Number.isFinite(totalCount) ? totalCount : 0));

    setImpositionState(prev => {
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

      let instances: ImpositionInstance[] = prev.instances;
      let removedIds: Set<string> | null = null;

      if (instancesForLayer.length > requiredTotal) {
        const keepIds = new Set(instancesForLayer.slice(0, requiredTotal).map(i => i.id));
        removedIds = new Set(instancesForLayer.filter(i => !keepIds.has(i.id)).map(i => i.id));
        instances = prev.instances.filter(i => i.layerId !== layerId || keepIds.has(i.id));
      } else if (instancesForLayer.length < requiredTotal) {
        const missingCount = requiredTotal - instancesForLayer.length;
        const additions: ImpositionInstance[] = Array.from({ length: missingCount }).map(() => ({
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

  const handleAutoLayout = () => {
    setImpositionState(prev => {
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

      const layerMap = new Map<string, ImpositionLayer>(layers.map(l => [l.id, l] as const));

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
    setImpositionState(prev => {
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
    if (!active) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      const key = e.key.toLowerCase();
      if (key === 'x' || e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelectedInstance();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, deleteSelectedInstance]);

  const handleImpositionUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
    const layersToAdd: ImpositionLayer[] = [];
    const instancesToAdd: ImpositionInstance[] = [];

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
        console.error('Failed to load imposition pair', stem, err);
        missing.push(stem);
      }
    }

    if (layersToAdd.length > 0) {
      setImpositionState(prev => ({
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

  return { impositionState, setImpositionState, setLayerTotalCount, handleAutoLayout, handleImpositionUpload };
}
