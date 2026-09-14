import { describe, expect, it } from 'vitest';
import { detachBlob } from './detachBlob';

const bytesOf = async (blob: Blob): Promise<number[]> => [...new Uint8Array(await blob.arrayBuffer())];

describe('detachBlob', () => {
  it('複製出內容相同的新 Blob', async () => {
    const source = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    expect(await bytesOf(await detachBlob(source))).toEqual([1, 2, 3]);
  });

  it('保留 MIME 型別', async () => {
    expect((await detachBlob(new Blob(['x'], { type: 'image/webp' }))).type).toBe('image/webp');
  });

  it('回傳的不是同一個物件', async () => {
    const source = new Blob(['x'], { type: 'image/png' });
    expect(await detachBlob(source)).not.toBe(source);
  });

  // 這是這個函式存在的理由：File 只是磁碟檔案的參照，檔案被改寫或移走之後，
  // FileReader 會拋 NotFoundError。複製成純 Blob 才能與磁碟脫鉤。
  it('傳入 File 時回傳的不再是 File，且內容與型別不變', async () => {
    const file = new File([new Uint8Array([9, 9])], 'cat.png', { type: 'image/png' });
    const detached = await detachBlob(file);
    expect(detached instanceof File).toBe(false);
    expect(await bytesOf(detached)).toEqual([9, 9]);
    expect(detached.type).toBe('image/png');
  });

  it('空檔案也能處理', async () => {
    expect((await detachBlob(new Blob([], { type: 'image/png' }))).size).toBe(0);
  });
});
