import paper from 'paper';
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import type { CurveSet } from '../export/cutPdf';
import type { ViewBox } from '../export/svg';
import type { Polygon } from '../geometry/types';
import type { DisplayStyle, PathData } from '../types';
import { attachEditTool } from './editTool';
import { isTypingTarget } from './keyboard';
import {
  canRedo,
  canUndo,
  currentSnapshot,
  EMPTY_HISTORY,
  isDirty,
  pushHistory,
  redoHistory,
  resetHistory,
  undoHistory,
  type HistoryState,
} from './pathHistory';
import {
  applyOutlineStyle,
  buildOutlineItem,
  buildReferenceItem,
  countSegments,
  OUTLINES,
  placeAboveRaster,
  RASTER,
  readCurveSets,
  readPathData,
  REFERENCE,
  type OutlineMode,
} from './paperItems';

export type { OutlineMode } from './paperItems';

const FIT_PADDING = 50;
const DIMMED_IMAGE_OPACITY = 0.4;

export interface PathEditorCanvasProps {
  imageUrl: string;
  widthPx: number;
  heightPx: number;
  polygons: readonly Polygon[] | null;
  mode: OutlineMode;
  style: DisplayStyle;
  smoothness: number;
  referencePaths?: readonly PathData[];
  active: boolean;
  testId?: string;
  onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void;
  onSegmentCount?: (count: number) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onPathsChange?: (paths: PathData[]) => void;
}

export interface PathEditorHandle {
  undo(): void;
  redo(): void;
  getPathData(): PathData[];
  getBounds(): ViewBox | null;
  getCurveSets(): CurveSet[];
  getImage(): HTMLImageElement | null;
}

/**
 * 依容器的實際尺寸縮放到適合畫面。
 * 分頁隱藏時容器是 0×0，Paper 會退回 canvas 預設的 300×150，所以不能用 view.viewSize 判斷；
 * 容器還沒有尺寸時回傳 false，等 ResizeObserver 回報真實尺寸再縮放。
 */
const fitView = (scope: paper.PaperScope, container: HTMLElement | null, w: number, h: number): boolean => {
  const width = container?.clientWidth ?? 0;
  const height = container?.clientHeight ?? 0;
  if (width === 0 || height === 0) return false;
  scope.view.viewSize = new paper.Size(width, height);
  scope.view.center = new paper.Point(w / 2, h / 2);
  scope.view.zoom = Math.min((width - FIT_PADDING) / w, (height - FIT_PADDING) / h, 1);
  return true;
};

const PathEditorCanvas = forwardRef<PathEditorHandle, PathEditorCanvasProps>((props, ref) => {
  const { imageUrl, widthPx, heightPx, polygons, mode, style, smoothness, referencePaths, active, testId } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scopeRef = useRef<paper.PaperScope | null>(null);
  const historyRef = useRef<HistoryState>(EMPTY_HISTORY);
  const pendingFitRef = useRef<{ w: number; h: number } | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const outlines = useCallback(
    (): paper.Item | null => scopeRef.current?.project.getItem({ name: OUTLINES }) ?? null,
    [],
  );

  const notify = useCallback(() => {
    const h = historyRef.current;
    const p = propsRef.current;
    const item = outlines();
    p.onHistoryChange?.(canUndo(h), canRedo(h));
    p.onDirtyChange?.(isDirty(h));
    p.onSegmentCount?.(item ? countSegments(item) : 0);
    p.onPathsChange?.(item ? readPathData(item, p.mode) : []);
  }, [outlines]);

  const recordEdit = useCallback(() => {
    const item = outlines();
    if (!item) return;
    historyRef.current = pushHistory(historyRef.current, item.exportJSON());
    notify();
  }, [notify, outlines]);

  const restore = useCallback((json: string) => {
    const scope = scopeRef.current;
    if (!scope) return;
    scope.activate();
    outlines()?.remove();
    const item = scope.project.importJSON(json) as paper.Item;
    item.name = OUTLINES;
    placeAboveRaster(scope, item);
    applyOutlineStyle(item, propsRef.current.style);
    scope.view.update();
    notify();
  }, [notify, outlines]);

  const move = useCallback((step: (h: HistoryState) => HistoryState) => {
    const next = step(historyRef.current);
    if (next === historyRef.current) return;
    historyRef.current = next;
    const snapshot = currentSnapshot(next);
    if (snapshot) restore(snapshot);
  }, [restore]);

  const undo = useCallback(() => move(undoHistory), [move]);
  const redo = useCallback(() => move(redoHistory), [move]);

  useImperativeHandle(ref, () => ({
    undo,
    redo,
    getPathData: () => {
      const item = outlines();
      return item ? readPathData(item, propsRef.current.mode) : [];
    },
    getBounds: () => {
      const item = outlines();
      if (!item || item.isEmpty()) return null;
      const b = item.bounds;
      return { x: b.x, y: b.y, width: b.width, height: b.height };
    },
    getCurveSets: () => {
      const item = outlines();
      return item ? readCurveSets(item) : [];
    },
    getImage: () => {
      const raster = scopeRef.current?.project.getItem({ name: RASTER }) as paper.Raster | null;
      return raster?.image instanceof HTMLImageElement ? raster.image : null;
    },
  }), [undo, redo, outlines]);

  // 1. 建立 scope、編輯工具與尺寸追蹤(只做一次)
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const scope = new paper.PaperScope();
    scope.setup(canvas);
    scopeRef.current = scope;
    const tool = attachEditTool(scope, recordEdit);

    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width === 0 || height === 0) return;
      scope.view.viewSize = new paper.Size(width, height);
      const pending = pendingFitRef.current;
      if (pending && fitView(scope, container, pending.w, pending.h)) pendingFitRef.current = null;
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      tool.remove();
      scope.project.remove();
      scopeRef.current = null;
    };
  }, [recordEdit]);

  // 2. 換圖時重新載入底圖並縮放
  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope) return;
    scope.activate();
    scope.project.getItem({ name: RASTER })?.remove();
    const raster = new scope.Raster(imageUrl);
    raster.name = RASTER;
    raster.locked = true;
    raster.opacity = propsRef.current.style.showOriginal ? 1 : DIMMED_IMAGE_OPACITY;
    raster.onLoad = () => {
      raster.position = new paper.Point(widthPx / 2, heightPx / 2);
      raster.sendToBack();
      pendingFitRef.current = fitView(scope, containerRef.current, widthPx, heightPx) ? null : { w: widthPx, h: heightPx };
    };
  }, [imageUrl, widthPx, heightPx]);

  // 3. 幾何結果或平滑度改變:重新產生路徑並重設歷史
  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope) return;
    outlines()?.remove();
    if (!polygons) {
      historyRef.current = EMPTY_HISTORY;
      notify();
      return;
    }
    const item = buildOutlineItem(scope, polygons, mode, smoothness);
    placeAboveRaster(scope, item);
    applyOutlineStyle(item, propsRef.current.style);
    historyRef.current = resetHistory(item.exportJSON());
    notify();
  }, [polygons, smoothness, mode, notify, outlines]);

  // 4. 只改外觀:不重新產生
  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope) return;
    const raster = scope.project.getItem({ name: RASTER });
    if (raster) raster.opacity = style.showOriginal ? 1 : DIMMED_IMAGE_OPACITY;
    const item = outlines();
    if (item) applyOutlineStyle(item, style);
  }, [style, outlines]);

  // 5. 參考線(白墨頁顯示刀模)
  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope) return;
    scope.project.getItem({ name: REFERENCE })?.remove();
    if (referencePaths && referencePaths.length > 0) buildReferenceItem(scope, referencePaths);
  }, [referencePaths]);

  // 6. 作用中分頁的快捷鍵
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z' || isTypingTarget(e.target)) return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, undo, redo]);

  return (
    <div ref={containerRef} className="absolute inset-0" data-testid={testId}>
      <canvas ref={canvasRef} className="block w-full h-full cursor-crosshair" />
    </div>
  );
});

PathEditorCanvas.displayName = 'PathEditorCanvas';
export default PathEditorCanvas;
