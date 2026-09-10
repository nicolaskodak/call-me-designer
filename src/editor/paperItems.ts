import paper from 'paper';
import type { CurveSet } from '../export/cutPdf';
import type { Polygon, Ring } from '../geometry/types';
import type { DisplayStyle, PathData } from '../types';

export const OUTLINES = 'outlines';
export const RASTER = 'mainImage';
export const REFERENCE = 'reference';

export type OutlineMode = 'stroke' | 'fill';

const REFERENCE_COLOR = '#ef4444';
const REFERENCE_DASH = [6, 4];

const makePath = (scope: paper.PaperScope, ring: Ring, smoothness: number): paper.Path => {
  const path = new scope.Path({
    segments: ring.map(([x, y]) => new paper.Point(x, y)),
    closed: true,
    insert: false,
  });
  if (smoothness > 0) path.simplify(smoothness);
  return path;
};

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
