import paper from 'paper';
import { OUTLINES } from './paperItems';

const HIT_TOLERANCE = 5;
const DOUBLE_CLICK_MS = 300;

const insideOutlines = (item: paper.Item | null): boolean => {
  for (let current = item; current; current = current.parent) {
    if (current.name === OUTLINES) return true;
  }
  return false;
};

export function attachEditTool(scope: paper.PaperScope, onEdit: () => void): paper.Tool {
  scope.activate();
  const tool = new scope.Tool();
  let segment: paper.Segment | null = null;
  let dragged = false;
  let lastClick = 0;

  const hitOptions = {
    segments: true,
    stroke: true,
    fill: false,
    tolerance: HIT_TOLERANCE,
    match: (hit: paper.HitResult) => insideOutlines(hit.item),
  };

  tool.onMouseDown = (event: paper.ToolEvent) => {
    segment = null;
    dragged = false;
    const now = Date.now();
    const isDoubleClick = now - lastClick < DOUBLE_CLICK_MS;
    lastClick = now;

    const hit = scope.project.hitTest(event.point, hitOptions);
    if (!hit) return;
    if (hit.type === 'segment') {
      if (isDoubleClick) {
        hit.segment.remove();
        onEdit();
        return;
      }
      segment = hit.segment;
      return;
    }
    if (hit.type === 'stroke' && hit.location && hit.item instanceof paper.Path) {
      segment = hit.item.insert(hit.location.index + 1, event.point);
      onEdit();
    }
  };

  tool.onMouseDrag = (event: paper.ToolEvent) => {
    if (!segment) return;
    dragged = true;
    segment.point = segment.point.add(event.delta);
  };

  tool.onMouseUp = () => {
    if (dragged) onEdit();
    segment = null;
    dragged = false;
  };

  tool.activate();
  return tool;
}
