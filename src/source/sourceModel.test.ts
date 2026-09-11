import { describe, expect, it } from 'vitest';
import { fileStem, isLargeImage, scaleDpiForWidth, withManualDpi, type ImageVersion, type SourceImage } from './sourceModel';

const version = (overrides: Partial<ImageVersion> = {}): ImageVersion => ({
  versionId: 'v1',
  blob: new Blob(),
  url: 'blob:v1',
  widthPx: 3000,
  heightPx: 2000,
  dpi: 300,
  dpiSource: 'metadata',
  alpha: { width: 1, height: 1, alpha: new Uint8ClampedArray([255]) },
  transparent: false,
  ...overrides,
});

describe('sourceModel', () => {
  it('strips the extension from filenames', () => {
    expect(fileStem('cat.png')).toBe('cat');
    expect(fileStem('my.cat.v2.jpg')).toBe('my.cat.v2');
    expect(fileStem('noext')).toBe('noext');
  });

  it('scales dpi to keep the physical size', () => {
    expect(scaleDpiForWidth(300, 3000, 600)).toBe(60);
    expect(scaleDpiForWidth(300, 3000, 3000)).toBe(300);
  });

  it('sets a manual dpi without mutating the source', () => {
    const source: SourceImage = { id: 's', name: 'cat', current: version(), original: null };
    const next = withManualDpi(source, 150);
    expect(next.current.dpi).toBe(150);
    expect(next.current.dpiSource).toBe('manual');
    expect(source.current.dpi).toBe(300);
  });

  it('flags images above 40 MP', () => {
    expect(isLargeImage(version({ widthPx: 8000, heightPx: 5000 }))).toBe(false);
    expect(isLargeImage(version({ widthPx: 8000, heightPx: 5001 }))).toBe(true);
  });
});
