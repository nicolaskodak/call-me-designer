// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadBlob, downloadText } from './download';

describe('download', () => {
  const createObjectURL = vi.fn((_blob: Blob) => 'blob:mock');
  const revokeObjectURL = vi.fn((_url: string) => undefined);

  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
  });

  it('clicks a temporary link and revokes the URL on the next tick', () => {
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });

    downloadBlob(new Blob(['x']), 'a.svg');

    expect(downloads).toEqual(['a.svg']);
    expect(document.querySelectorAll('a')).toHaveLength(0);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });

  it('wraps text in a blob with the given mime type', () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    downloadText('<svg/>', 'b.svg', 'image/svg+xml');

    const blob = createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe('image/svg+xml');
    expect(blob.size).toBe(6);
  });
});
