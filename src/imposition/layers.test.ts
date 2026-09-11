import { describe, expect, it } from 'vitest';
import { buildSourceLayer, layoutBoxFromBounds, pairUploadFiles } from './layers';

const file = (name: string, type: string) => new File(['x'], name, { type });

describe('pairUploadFiles', () => {
  it('pairs images and SVGs by filename stem', () => {
    const { pairs, unpaired } = pairUploadFiles([
      file('cat.png', 'image/png'),
      file('cat.svg', 'image/svg+xml'),
      file('dog.png', 'image/png'),
      file('readme.txt', 'text/plain'),
    ]);
    expect(pairs.map(p => [p.stem, p.image.name, p.svg.name])).toEqual([['cat', 'cat.png', 'cat.svg']]);
    expect(unpaired).toEqual(['dog', 'readme']);
  });

  it('recognises .SVG files without a mime type', () => {
    const { pairs } = pairUploadFiles([file('a.jpg', 'image/jpeg'), file('a.SVG', '')]);
    expect(pairs).toHaveLength(1);
  });
});

describe('layoutBoxFromBounds', () => {
  it('uses the full image without bounds', () => {
    expect(layoutBoxFromBounds(null, 100, 50, 2)).toEqual({ x: 0, y: 0, width: 100, height: 50 });
  });

  it('pads the bounds without clamping to the image', () => {
    expect(layoutBoxFromBounds({ x: -10, y: 5, width: 120, height: 40 }, 100, 50, 2)).toEqual({ x: -12, y: 3, width: 124, height: 44 });
  });
});

describe('buildSourceLayer', () => {
  const input = {
    id: 'L1',
    sourceId: 'src',
    name: 'cat',
    blob: new Blob(),
    imageUrl: 'blob:cat',
    widthPx: 100,
    heightPx: 50,
    dpi: 25.4,
    cutPaths: [{ d: 'M0 0Z' }],
    cutBounds: { x: 0, y: 0, width: 100, height: 50 },
    underprint: [{ d: 'M1 1Z', fillRule: 'evenodd' as const }],
  };

  it('builds a layer with padded cut bounds', () => {
    const l = buildSourceLayer(input);
    expect(l).toMatchObject({ id: 'L1', sourceId: 'src', totalCount: 1, cut: { kind: 'paths', paths: input.cutPaths }, underprint: input.underprint });
    // 以刀模線寬的一半（0.125 mm）當邊距；25.4 dpi 時 = 0.125 px
    const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
    const { x, y, width, height } = l.layoutBoxPx;
    expect([x, y, width, height].map(r6)).toEqual([-0.125, -0.125, 100.25, 50.25]);
  });

  it('stores an empty underprint as null', () => {
    expect(buildSourceLayer({ ...input, underprint: [] }).underprint).toBeNull();
  });
});
