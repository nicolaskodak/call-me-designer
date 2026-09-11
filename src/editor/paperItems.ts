import paper from 'paper';
import type { CurveSet } from '../export/cutPdf';
import type { Point, Polygon, Ring } from '../geometry/types';
import type { DisplayStyle, PathData } from '../types';
import { splitRingIntoRuns } from './ringRuns';

export const OUTLINES = 'outlines';
export const RASTER = 'mainImage';
export const REFERENCE = 'reference';

export type OutlineMode = 'stroke' | 'fill';

const REFERENCE_COLOR = '#ef4444';
const REFERENCE_DASH = [6, 4];

const toPaperPoint = ([x, y]: Point): paper.Point => new paper.Point(x, y);

/** 開放的點列擬合成貝茲曲線；只有兩點的段落是直線，直接用沒有把手的節點 */
const fitRun = (scope: paper.PaperScope, run: readonly Point[], tolerance: number): paper.Segment[] => {
  if (run.length === 2) return run.map(p => new paper.Segment(toPaperPoint(p)));
  const path = new scope.Path({ segments: run.map(toPaperPoint), insert: false });
  path.simplify(tolerance);
  return path.segments;
};

/**
 * 不能直接對封閉路徑 simplify：Paper 會在起點附近掉一段形狀，而且只檢查頂點上的誤差，
 * 頂點很少的直邊（例如長方形的白墨）會被拉成往外鼓的弧線。
 * 所以先切成開放的段落（見 splitRingIntoRuns），逐段擬合，再接回一條封閉路徑。
 */
const smoothRing = (scope: paper.PaperScope, ring: Ring, smoothness: number): paper.Segment[] | null => {
  const runs = splitRingIntoRuns(ring, smoothness);
  if (runs.length === 0) return null;
  const fitted = runs.map(run => fitRun(scope, run, smoothness));
  // 每段的最後一點就是下一段的第一點：合成一個節點，進把手來自前一段、出把手來自這一段。
  // 中間的節點還屬於擬合用的暫時路徑；Paper 加進新路徑時會自動複製已經有路徑的節點。
  return fitted.flatMap((segments, k) => {
    const prev = fitted[(k - 1 + fitted.length) % fitted.length];
    const joint = new paper.Segment(segments[0].point, prev[prev.length - 1].handleIn, segments[0].handleOut);
    return [joint, ...segments.slice(1, -1)];
  });
};

const makePath = (scope: paper.PaperScope, ring: Ring, smoothness: number): paper.Path =>
  new scope.Path({
    segments: (smoothness > 0 ? smoothRing(scope, ring, smoothness) : null) ?? ring.map(toPaperPoint),
    closed: true,
    insert: false,
  });

/** 刀模:每個外圈一條 Path;白墨:所有外圈與洞放進一個 evenodd CompoundPath */
export function buildOutlineItem(
  scope: paper.PaperScope,
  polygons: readonly Polygon[],
  mode: OutlineMode,
  smoothness: number,
): paper.Group {
  scope.activate();
  const children: paper.Item[] =
    mode === 'stroke'
      ? polygons.map(p => makePath(scope, p.outer, smoothness))
      : [
          new scope.CompoundPath({
            children: polygons.flatMap(p => [p.outer, ...p.holes]).map(r => makePath(scope, r, smoothness)),
            fillRule: 'evenodd',
            insert: false,
          }),
        ];
  const group = new scope.Group({ children, insert: true });
  group.name = OUTLINES;
  return group;
}

const withAlpha = (hex: string, alpha: number): paper.Color => {
  const color = new paper.Color(hex);
  color.alpha = alpha;
  return color;
};

// paper.d.ts only declares `fullySelected` on `Path`, but it is a real Item property at
// runtime (Paper.js docs: Item#fullySelected). Narrow cast to access it on any child type.
type FullySelectable = { fullySelected: boolean };

export function applyOutlineStyle(item: paper.Item, style: DisplayStyle): void {
  for (const child of item.children ?? []) {
    child.strokeColor = withAlpha(style.strokeColor, style.strokeOpacity);
    child.fillColor = withAlpha(style.fillColor, style.fillOpacity);
    child.strokeWidth = style.strokeWidth;
    child.strokeCap = 'round';
    child.strokeJoin = 'round';
    (child as unknown as FullySelectable).fullySelected = style.showPoints;
  }
}

export function buildReferenceItem(scope: paper.PaperScope, paths: readonly PathData[]): paper.Group {
  scope.activate();
  const group = new scope.Group(paths.map(p => new scope.CompoundPath(p.d)));
  group.name = REFERENCE;
  group.locked = true;
  group.strokeColor = new paper.Color(REFERENCE_COLOR);
  group.fillColor = null;
  group.dashArray = REFERENCE_DASH;
  group.strokeWidth = 1.5;
  group.strokeScaling = false;
  return group;
}

const isPathItem = (item: paper.Item): item is paper.PathItem =>
  item instanceof paper.Path || item instanceof paper.CompoundPath;

const leafPaths = (item: paper.Item): paper.Path[] =>
  item instanceof paper.Path ? [item] : (item.children ?? []).flatMap(leafPaths);

export function readPathData(item: paper.Item, mode: OutlineMode): PathData[] {
  return (item.children ?? [])
    .filter(isPathItem)
    .map(child => (mode === 'fill' ? { d: child.pathData, fillRule: 'evenodd' as const } : { d: child.pathData }));
}

export function readCurveSets(item: paper.Item): CurveSet[] {
  return leafPaths(item)
    .filter(path => path.segments.length > 0)
    .map(path => ({
      start: [path.firstSegment.point.x, path.firstSegment.point.y] as const,
      segments: path.curves.map(c => ({
        c1: [c.point1.x + c.handle1.x, c.point1.y + c.handle1.y] as const,
        c2: [c.point2.x + c.handle2.x, c.point2.y + c.handle2.y] as const,
        end: [c.point2.x, c.point2.y] as const,
      })),
      closed: path.closed,
    }));
}

export const countSegments = (item: paper.Item): number =>
  leafPaths(item).reduce((n, path) => n + path.segments.length, 0);

export function placeAboveRaster(scope: paper.PaperScope, item: paper.Item): void {
  const raster = scope.project.getItem({ name: RASTER });
  if (raster) item.insertAbove(raster);
}
