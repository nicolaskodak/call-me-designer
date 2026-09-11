// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';

// jsdom 沒有 2D canvas，但 Paper 載入時就會要一個；這裡只做路徑運算，不會真的畫
vi.hoisted(() => {
  const noop = () => undefined;
  const fakeContext = new Proxy(
    {},
    {
      get: (_target, prop) => (prop === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) }) : noop),
      set: () => true,
    },
  );
  HTMLCanvasElement.prototype.getContext = (() => fakeContext) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

import paper from 'paper';
import { buildCutline } from '../geometry/cutline';
import {
  cutlineParamsToPx,
  DEFAULT_CUTLINE_PARAMS,
  DEFAULT_UNDERPRINT_PARAMS,
  underprintParamsToPx,
} from '../geometry/params';
import { disc, makeAlpha, minus, rect } from '../geometry/testUtils';
import type { AlphaImage, Point, Polygon, Ring } from '../geometry/types';
import { buildUnderprint } from '../geometry/underprint';
import { buildOutlineItem } from './paperItems';

const DPI = 300;
const CUT_SMOOTHNESS = DEFAULT_CUTLINE_PARAMS.smoothness;
const UNDER_SMOOTHNESS = DEFAULT_UNDERPRINT_PARAMS.smoothness;
/** 平滑後的路徑離幾何輪廓的距離，最多只能比平滑度多這麼多（px） */
const SLACK_PX = 0.5;
const SAMPLES = 2000;
/** 相鄰節點至少要隔這麼遠（px），太近代表接合點旁邊多出了節點 */
const MIN_NODE_GAP_PX = 1;

const shapes: Record<string, AlphaImage> = {
  square: makeAlpha(400, 400, rect(100, 100, 200, 200)),
  'wide rectangle': makeAlpha(600, 300, rect(50, 100, 500, 80)),
  disc: makeAlpha(400, 400, disc(200, 200, 150)),
  'half disc': makeAlpha(400, 400, (x, y) => disc(200, 200, 150)(x, y) && y < 200),
};

const underprintOf = (img: AlphaImage): Polygon[] =>
  buildUnderprint(img, underprintParamsToPx(DEFAULT_UNDERPRINT_PARAMS, DPI)).polygons;
const cutlineOf = (img: AlphaImage): Polygon[] =>
  buildCutline(img, cutlineParamsToPx(DEFAULT_CUTLINE_PARAMS, DPI)).polygons;

const distanceToSegment = (p: Point, a: Point, b: Point): number => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
};

const distanceToRing = (p: Point, ring: Ring): number =>
  ring.reduce((min, a, i) => Math.min(min, distanceToSegment(p, a, ring[(i + 1) % ring.length])), Infinity);

/** 沿著路徑取樣，回傳離幾何輪廓最遠的距離（px） */
const maxDeviation = (path: paper.Path, ring: Ring): number =>
  Array.from({ length: SAMPLES }, (_, i) => path.getPointAt((path.length * i) / SAMPLES)).reduce(
    (max, pt) => Math.max(max, distanceToRing([pt.x, pt.y], ring)),
    0,
  );

/** 刀模每個外圈是 Group 底下的一條 Path；白墨是 Group 底下一個 CompoundPath，外圈在最前面 */
const firstPath = (item: paper.Item): paper.Path => {
  const child = item.firstChild;
  return (child instanceof paper.CompoundPath ? child.firstChild : child) as paper.Path;
};

let scope: paper.PaperScope;

beforeAll(() => {
  scope = new paper.PaperScope();
  scope.setup(new paper.Size(10, 10));
});

describe('buildOutlineItem smoothing', () => {
  describe.each(Object.entries(shapes))('%s', (_name, img) => {
    it('keeps the underprint within the smoothing tolerance', () => {
      const polygons = underprintOf(img);
      const path = firstPath(buildOutlineItem(scope, polygons, 'fill', UNDER_SMOOTHNESS));
      expect(maxDeviation(path, polygons[0].outer)).toBeLessThanOrEqual(UNDER_SMOOTHNESS + SLACK_PX);
    });

    it('keeps the cut line within the smoothing tolerance', () => {
      const polygons = cutlineOf(img);
      const path = firstPath(buildOutlineItem(scope, polygons, 'stroke', CUT_SMOOTHNESS));
      expect(maxDeviation(path, polygons[0].outer)).toBeLessThanOrEqual(CUT_SMOOTHNESS + SLACK_PX);
    });
  });

  // 刀模是往外擴的圓角，沒有尖角：每個節點的進出把手都要在同一條直線上
  it.each(['disc', 'half disc', 'square'])('keeps the %s cut line free of kinks and stray nodes', name => {
    const path = firstPath(buildOutlineItem(scope, cutlineOf(shapes[name]), 'stroke', CUT_SMOOTHNESS));
    path.segments.forEach((segment, i) => {
      const next = path.segments[(i + 1) % path.segments.length];
      expect(segment.point.getDistance(next.point)).toBeGreaterThan(MIN_NODE_GAP_PX);
      const { handleIn, handleOut } = segment;
      expect(Math.abs(handleIn.cross(handleOut)) / (handleIn.length * handleOut.length)).toBeLessThan(1e-6);
      expect(handleIn.dot(handleOut)).toBeLessThan(0);
    });
  });

  it('smooths holes the same way as the outer ring', () => {
    const polygons = underprintOf(makeAlpha(400, 400, minus(rect(60, 60, 280, 280), disc(200, 200, 80))));
    const rings = polygons.flatMap(p => [p.outer, ...p.holes]);
    const compound = buildOutlineItem(scope, polygons, 'fill', UNDER_SMOOTHNESS).firstChild as paper.CompoundPath;
    const paths = compound.children as paper.Path[];
    expect(paths).toHaveLength(2);
    paths.forEach((path, i) => expect(maxDeviation(path, rings[i])).toBeLessThanOrEqual(UNDER_SMOOTHNESS + SLACK_PX));
    expect(paths[0].segments).toHaveLength(4);
  });

  it('keeps the edges of a rectangle straight and its corners sharp', () => {
    const polygons = underprintOf(shapes.square);
    const path = firstPath(buildOutlineItem(scope, polygons, 'fill', UNDER_SMOOTHNESS));
    expect(path.segments).toHaveLength(4);
    expect(path.segments.every(s => s.handleIn.isZero() && s.handleOut.isZero())).toBe(true);
    expect(maxDeviation(path, polygons[0].outer)).toBeLessThan(0.01);
  });

  it('uses the exact polygon when smoothness is 0', () => {
    const polygons = cutlineOf(shapes.disc);
    const path = firstPath(buildOutlineItem(scope, polygons, 'stroke', 0));
    expect(path.segments.map(s => [s.point.x, s.point.y])).toEqual(polygons[0].outer.map(([x, y]) => [x, y]));
  });
});
