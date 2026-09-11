// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadImageVersion } from '../source/loadImageVersion';
import type { ImageVersion } from '../source/sourceModel';
import { useSourceImage } from './useSourceImage';

vi.mock('../source/loadImageVersion', () => ({ loadImageVersion: vi.fn() }));

interface PendingLoad {
  resolve: (version: ImageVersion) => void;
}

const version = (name: string, widthPx = 100): ImageVersion => ({
  versionId: name,
  blob: new Blob([name]),
  url: `blob:${name}`,
  widthPx,
  heightPx: 50,
  dpi: 300,
  dpiSource: 'default',
  alpha: { width: widthPx, height: 50, alpha: new Uint8ClampedArray(0) },
  transparent: false,
});

const file = (name: string) => new File([name], `${name}.png`, { type: 'image/png' });

let loads: PendingLoad[] = [];
const revoke = vi.fn();
const originalRevoke = URL.revokeObjectURL;

beforeEach(() => {
  loads = [];
  revoke.mockReset();
  URL.revokeObjectURL = revoke;
  vi.mocked(loadImageVersion).mockReset();
  vi.mocked(loadImageVersion).mockImplementation(() => new Promise(resolve => loads.push({ resolve })));
});

afterEach(() => {
  cleanup();
  URL.revokeObjectURL = originalRevoke;
});

/** 上傳 A 並等它載入完成，回傳 hook 與 A 的來源 id */
async function withUploadedA() {
  const hook = renderHook(() => useSourceImage(300));
  let upload: Promise<void> = Promise.resolve();
  act(() => {
    upload = hook.result.current.upload(file('A'));
  });
  await act(async () => {
    loads[0].resolve(version('A'));
    await upload;
  });
  const id = hook.result.current.source?.id;
  if (!id) throw new Error('upload A did not produce a source');
  return { ...hook, aId: id };
}

describe('useSourceImage', () => {
  it('ignores a replacement that finishes after another image was uploaded', async () => {
    const { result, aId } = await withUploadedA();
    let replace: Promise<void> = Promise.resolve();
    let uploadB: Promise<void> = Promise.resolve();
    act(() => {
      replace = result.current.replaceCurrent(new Blob(['X']), aId);
    });
    act(() => {
      uploadB = result.current.upload(file('B'));
    });
    await act(async () => {
      loads[2].resolve(version('B'));
      await uploadB;
    });
    await act(async () => {
      loads[1].resolve(version('X'));
      await replace;
    });
    expect(result.current.source?.current.versionId).toBe('B');
    expect(result.current.source?.original).toBeNull();
    expect(revoke).toHaveBeenCalledWith('blob:X');
  });

  it('keeps the latest upload when an earlier one finishes last', async () => {
    const { result } = renderHook(() => useSourceImage(300));
    let uploadA: Promise<void> = Promise.resolve();
    let uploadB: Promise<void> = Promise.resolve();
    act(() => {
      uploadA = result.current.upload(file('A'));
      uploadB = result.current.upload(file('B'));
    });
    await act(async () => {
      loads[1].resolve(version('B'));
      await uploadB;
    });
    await act(async () => {
      loads[0].resolve(version('A'));
      await uploadA;
    });
    expect(result.current.source?.current.versionId).toBe('B');
    expect(result.current.source?.name).toBe('B');
    expect(revoke).toHaveBeenCalledWith('blob:A');
    expect(revoke).not.toHaveBeenCalledWith('blob:B');
  });

  it('replaces the current version of the same source and keeps the original', async () => {
    const { result, aId } = await withUploadedA();
    let replace: Promise<void> = Promise.resolve();
    act(() => {
      replace = result.current.replaceCurrent(new Blob(['X']), aId);
    });
    await act(async () => {
      loads[1].resolve(version('X', 200));
      await replace;
    });
    const source = result.current.source;
    expect(source?.id).toBe(aId);
    expect(source?.current.versionId).toBe('X');
    expect(source?.current.dpi).toBe(600);
    expect(source?.original?.versionId).toBe('A');
    expect(revoke).not.toHaveBeenCalled();
  });
});
