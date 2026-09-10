import {
  area,
  booleanOpWithPolyTree,
  ClipType,
  EndType,
  FillRule,
  inflatePaths,
  JoinType,
  PolyTree64,
  simplifyPaths,
  type Path64,
  type Paths64,
  type PolyPath64,
} from 'clipper2-ts';
import type { Polygon, Ring } from './types';

/** Clipper 使用整數座標：px 乘以 100，精度 0.01px */
const SCALE = 100;
const ARC_TOLERANCE_PX = 0.25;
const MITER_LIMIT = 2;
export const TRACE_SIMPLIFY_EPS_PX = 0.5;

const toPath = (ring: Ring): Path64 =>
  ring.map(([x, y]) => ({ x: Math.round(x * SCALE), y: Math.round(y * SCALE) }));

const toRing = (path: Path64): Ring => path.map(p => [p.x / SCALE, p.y / SCALE] as const);

const polygonsToPaths = (polys: readonly Polygon[]): Paths64 =>
  polys.flatMap(p => [toPath(p.outer), ...p.holes.map(toPath)]);

const childrenOf = (node: PolyPath64): PolyPath64[] =>
  Array.from({ length: node.count }, (_, i) => node.child(i));

/** PolyTree 的第一層是外圈、第二層是洞、第三層是洞裡的島（變成獨立的 Polygon） */
const treeToPolygons = (node: PolyPath64): Polygon[] =>
  childrenOf(node).flatMap(outer => {
    const holeNodes = childrenOf(outer);
    const polygon: Polygon = {
      outer: toRing(outer.poly ?? []),
      holes: holeNodes.map(h => toRing(h.poly ?? [])),
    };
    return [polygon, ...holeNodes.flatMap(treeToPolygons)];
  });

const unionPaths = (paths: Paths64, fillRule: FillRule): Polygon[] => {
  const tree = new PolyTree64();
  booleanOpWithPolyTree(ClipType.Union, paths, null, tree, fillRule);
  return treeToPolygons(tree);
};

export function normalizeRings(rings: readonly Ring[]): Polygon[] {
  if (rings.length === 0) return [];
  return unionPaths(rings.map(toPath), FillRule.EvenOdd);
}

export function inflate(polys: readonly Polygon[], deltaPx: number): Polygon[] {
  if (polys.length === 0) return [];
  if (deltaPx === 0) return [...polys];
  const inflated = inflatePaths(
    polygonsToPaths(polys),
    deltaPx * SCALE,
    JoinType.Round,
    EndType.Polygon,
    MITER_LIMIT,
    ARC_TOLERANCE_PX * SCALE,
  );
  return unionPaths(inflated, FillRule.NonZero);
}

export function simplify(polys: readonly Polygon[], epsilonPx: number): Polygon[] {
  if (polys.length === 0) return [];
  return unionPaths(simplifyPaths(polygonsToPaths(polys), epsilonPx * SCALE, true), FillRule.NonZero);
}

export const ringArea = (ring: Ring): number => area(toPath(ring)) / (SCALE * SCALE);

export const polygonArea = (p: Polygon): number =>
  Math.abs(ringArea(p.outer)) - p.holes.reduce((sum, h) => sum + Math.abs(ringArea(h)), 0);

export function removeSmallIslands(polys: readonly Polygon[], minAreaPx2: number): Polygon[] {
  if (minAreaPx2 <= 0) return [...polys];
  return polys.filter(p => Math.abs(ringArea(p.outer)) >= minAreaPx2);
}

export function fillHoles(polys: readonly Polygon[]): Polygon[] {
  if (polys.length === 0) return [];
  return unionPaths(polys.map(p => toPath(p.outer)), FillRule.NonZero);
}

export function prepareBase(rings: readonly Ring[], minIslandAreaPx2: number): Polygon[] {
  return removeSmallIslands(simplify(normalizeRings(rings), TRACE_SIMPLIFY_EPS_PX), minIslandAreaPx2);
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function polygonsBounds(polys: readonly Polygon[]): Bounds | null {
  const points = polys.flatMap(p => p.outer);
  if (points.length === 0) return null;
  return points.reduce<Bounds>(
    (b, [x, y]) => ({
      minX: Math.min(b.minX, x),
      minY: Math.min(b.minY, y),
      maxX: Math.max(b.maxX, x),
      maxY: Math.max(b.maxY, y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}
