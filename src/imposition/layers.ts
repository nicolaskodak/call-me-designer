import { CUT_STROKE_MM, type ViewBox } from '../export/svg';
import { fileStem } from '../source/sourceModel';
import type { PathData } from '../types';
import { mmToPx } from '../units';
import type { ImpositionLayer, LayoutBox } from './types';

export interface UploadPair {
  stem: string;
  image: File;
  svg: File;
}

interface UploadGroup {
  image?: File;
  svg?: File;
}

const isSvgFile = (f: File) => f.type === 'image/svg+xml' || f.name.toLowerCase().endsWith('.svg');
const isImageFile = (f: File) => f.type.startsWith('image/') && !isSvgFile(f);

export function pairUploadFiles(files: readonly File[]): { pairs: UploadPair[]; unpaired: string[] } {
  const groups = files.reduce((map, file) => {
    const stem = fileStem(file.name);
    const entry = map.get(stem) ?? {};
    const next: UploadGroup = isSvgFile(file) ? { ...entry, svg: file } : isImageFile(file) ? { ...entry, image: file } : entry;
    return new Map(map).set(stem, next);
  }, new Map<string, UploadGroup>());

  const entries = [...groups.entries()];
  return {
    pairs: entries.flatMap(([stem, g]) => (g.image && g.svg ? [{ stem, image: g.image, svg: g.svg }] : [])),
    unpaired: entries.filter(([, g]) => !(g.image && g.svg)).map(([stem]) => stem),
  };
}

export function layoutBoxFromBounds(bounds: ViewBox | null, widthPx: number, heightPx: number, padPx: number): LayoutBox {
  if (!bounds) return { x: 0, y: 0, width: widthPx, height: heightPx };
  return { x: bounds.x - padPx, y: bounds.y - padPx, width: bounds.width + padPx * 2, height: bounds.height + padPx * 2 };
}

export interface SourceLayerInput {
  id: string;
  sourceId: string;
  name: string;
  blob: Blob;
  imageUrl: string;
  widthPx: number;
  heightPx: number;
  dpi: number;
  cutPaths: PathData[];
  cutBounds: ViewBox | null;
  underprint: PathData[] | null;
}

export function buildSourceLayer(input: SourceLayerInput): ImpositionLayer {
  const pad = mmToPx(CUT_STROKE_MM / 2, input.dpi);
  return {
    id: input.id,
    sourceId: input.sourceId,
    name: input.name,
    imageBlob: input.blob,
    imageUrl: input.imageUrl,
    widthPx: input.widthPx,
    heightPx: input.heightPx,
    dpi: input.dpi,
    cut: { kind: 'paths', paths: input.cutPaths },
    underprint: input.underprint && input.underprint.length > 0 ? input.underprint : null,
    layoutBoxPx: layoutBoxFromBounds(input.cutBounds, input.widthPx, input.heightPx, pad),
    totalCount: 1,
  };
}
