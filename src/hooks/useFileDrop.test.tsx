// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import type { DragEvent } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFileDrop, useBlockWindowFileDrop } from './useFileDrop';

afterEach(cleanup);

const file = (name: string, type: string) => new File(['x'], name, { type });

/** 造一個夠用的假 DragEvent；只需要 preventDefault 與 dataTransfer.files */
const dragEvent = (files: File[] = []) => ({
  preventDefault: vi.fn(),
  stopPropagation: vi.fn(),
  dataTransfer: { files, types: ['Files'] },
}) as unknown as DragEvent;

describe('useFileDrop', () => {
  it('拖進來時 isOver 變 true，離開後變回 false', () => {
    const { result } = renderHook(() => useFileDrop(() => undefined));
    expect(result.current.isOver).toBe(false);

    act(() => result.current.dropProps.onDragEnter(dragEvent()));
    expect(result.current.isOver).toBe(true);

    act(() => result.current.dropProps.onDragLeave(dragEvent()));
    expect(result.current.isOver).toBe(false);
  });

  it('滑過子元素造成的巢狀 enter/leave 不會提早關閉', () => {
    const { result } = renderHook(() => useFileDrop(() => undefined));
    act(() => result.current.dropProps.onDragEnter(dragEvent()));
    act(() => result.current.dropProps.onDragEnter(dragEvent()));
    act(() => result.current.dropProps.onDragLeave(dragEvent()));
    expect(result.current.isOver).toBe(true);

    act(() => result.current.dropProps.onDragLeave(dragEvent()));
    expect(result.current.isOver).toBe(false);
  });

  it('drop 會把檔案交出去，並把 isOver 收乾淨', () => {
    const onFiles = vi.fn();
    const { result } = renderHook(() => useFileDrop(onFiles));
    const files = [file('cat.png', 'image/png'), file('cat.svg', 'image/svg+xml')];

    act(() => result.current.dropProps.onDragEnter(dragEvent(files)));
    act(() => result.current.dropProps.onDrop(dragEvent(files)));

    expect(onFiles).toHaveBeenCalledWith(files);
    expect(result.current.isOver).toBe(false);
  });

  it('沒有檔案的 drop 不會呼叫 onFiles', () => {
    const onFiles = vi.fn();
    const { result } = renderHook(() => useFileDrop(onFiles));
    act(() => result.current.dropProps.onDrop(dragEvent([])));
    expect(onFiles).not.toHaveBeenCalled();
  });

  it('onDragOver 一定要 preventDefault，否則瀏覽器不會觸發 drop', () => {
    const { result } = renderHook(() => useFileDrop(() => undefined));
    const e = dragEvent();
    act(() => result.current.dropProps.onDragOver(e));
    expect(e.preventDefault).toHaveBeenCalled();
  });
});

describe('useBlockWindowFileDrop', () => {
  it('掛上事件監聽器，dragover 與 drop 事件會被阻止；卸載後監聽器移除', () => {
    const { unmount } = renderHook(() => useBlockWindowFileDrop());

    // 掛載時，dragover 事件應被阻止
    const dragoverEvent = new Event('dragover', { cancelable: true });
    act(() => window.dispatchEvent(dragoverEvent));
    expect(dragoverEvent.defaultPrevented).toBe(true);

    // 卸載後，dragover 事件不再被阻止
    unmount();
    const dragoverEventAfter = new Event('dragover', { cancelable: true });
    act(() => window.dispatchEvent(dragoverEventAfter));
    expect(dragoverEventAfter.defaultPrevented).toBe(false);
  });
});
