import { describe, expect, it } from 'vitest';
import { fileStem, isLargeImage, pickDroppedSourceImage, scaleDpiForWidth, withManualDpi, type ImageVersion, type SourceImage } from './sourceModel';

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

describe('pickDroppedSourceImage', () => {
  const file = (name: string, type: string) => new File(['x'], name, { type });

  it('takes the only image', () => {
    const png = file('cat.png', 'image/png');
    expect(pickDroppedSourceImage([png])).toEqual({ file: png, warning: null });
  });

  it('accepts jpg and webp too', () => {
    const jpg = file('cat.jpg', 'image/jpeg');
    const webp = file('cat.webp', 'image/webp');
    expect(pickDroppedSourceImage([jpg]).file).toBe(jpg);
    expect(pickDroppedSourceImage([webp]).file).toBe(webp);
  });

  // 從檔案總管拖進來時 type 有時會是空字串，這時只剩副檔名可以判斷
  it('falls back to the extension when the drop carries no MIME type', () => {
    const png = file('CAT.PNG', '');
    expect(pickDroppedSourceImage([png])).toEqual({ file: png, warning: null });
  });

  it('warns and picks nothing when no file is a supported image', () => {
    const result = pickDroppedSourceImage([file('notes.txt', 'text/plain'), file('cut.svg', 'image/svg+xml')]);
    expect(result.file).toBeNull();
    expect(result.warning).toBe('請拖入 PNG／JPG／WebP 圖片。');
  });

  it('warns and picks nothing for an empty drop', () => {
    expect(pickDroppedSourceImage([]).file).toBeNull();
    expect(pickDroppedSourceImage([]).warning).toBe('請拖入 PNG／JPG／WebP 圖片。');
  });

  it('uses the first image and says so when several are dropped', () => {
    const first = file('a.png', 'image/png');
    const second = file('b.png', 'image/png');
    const result = pickDroppedSourceImage([first, second]);
    expect(result.file).toBe(first);
    expect(result.warning).toBe('一次只能處理一張圖，已使用 a.png。');
  });

  // 混著拖進不相干的檔案不算錯，安靜忽略就好
  it('ignores unsupported files alongside a single image without warning', () => {
    const png = file('cat.png', 'image/png');
    expect(pickDroppedSourceImage([file('notes.txt', 'text/plain'), png])).toEqual({ file: png, warning: null });
  });

  it('does not mutate the input array', () => {
    const files = [file('b.png', 'image/png'), file('a.png', 'image/png')];
    pickDroppedSourceImage(files);
    expect(files.map(f => f.name)).toEqual(['b.png', 'a.png']);
  });
});
