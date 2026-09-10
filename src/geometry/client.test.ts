import { describe, expect, it } from 'vitest';
import { GeometryClient, type WorkerLike } from './client';
import { cutlineParamsToPx, DEFAULT_CUTLINE_PARAMS, DEFAULT_UNDERPRINT_PARAMS, underprintParamsToPx } from './params';
import type { WorkerRequest, WorkerResponse } from './types';

class FakeWorker implements WorkerLike {
  posted: { message: WorkerRequest; transfer?: Transferable[] }[] = [];
  terminated = false;
  private listener: ((event: MessageEvent<WorkerResponse>) => void) | null = null;

  postMessage(message: WorkerRequest, transfer?: Transferable[]): void {
    this.posted.push({ message, transfer });
  }
  addEventListener(_type: 'message', listener: (event: MessageEvent<WorkerResponse>) => void): void {
    this.listener = listener;
  }
  terminate(): void {
    this.terminated = true;
  }
  respond(response: WorkerResponse): void {
    this.listener?.({ data: response } as MessageEvent<WorkerResponse>);
  }
}

const RESULT = { polygons: [], warnings: [], stats: { islandCount: 0 } };
const cutParams = cutlineParamsToPx(DEFAULT_CUTLINE_PARAMS, 300);
const underParams = underprintParamsToPx(DEFAULT_UNDERPRINT_PARAMS, 300);

const setup = () => {
  const worker = new FakeWorker();
  return { worker, client: new GeometryClient(worker) };
};

describe('GeometryClient', () => {
  it('transfers a copy of the alpha channel', () => {
    const { worker, client } = setup();
    const image = { width: 2, height: 1, alpha: new Uint8ClampedArray([1, 2]) };
    client.setImage('img', image);
    const { message, transfer } = worker.posted[0];
    expect(message).toMatchObject({ type: 'setImage', imageId: 'img', width: 2, height: 1 });
    if (message.type !== 'setImage') throw new Error('unexpected message');
    expect(message.alpha).not.toBe(image.alpha);
    expect(Array.from(message.alpha)).toEqual([1, 2]);
    expect(transfer).toEqual([message.alpha.buffer]);
  });

  it('posts dropImage', () => {
    const { worker, client } = setup();
    client.dropImage('img');
    expect(worker.posted[0].message).toEqual({ type: 'dropImage', imageId: 'img' });
  });

  it('resolves the latest job with its result', async () => {
    const { worker, client } = setup();
    const job = client.run('cutline', 'img', cutParams);
    expect(worker.posted[0].message).toEqual({ type: 'cutline', jobId: 1, imageId: 'img', params: cutParams });
    worker.respond({ type: 'result', jobId: 1, ...RESULT });
    await expect(job).resolves.toEqual(RESULT);
  });

  it('resolves superseded jobs of the same kind with null', async () => {
    const { worker, client } = setup();
    const first = client.run('cutline', 'img', cutParams);
    const second = client.run('cutline', 'img', cutParams);
    worker.respond({ type: 'result', jobId: 1, ...RESULT });
    worker.respond({ type: 'result', jobId: 2, ...RESULT });
    await expect(first).resolves.toBeNull();
    await expect(second).resolves.toEqual(RESULT);
  });

  it('does not let different kinds supersede each other', async () => {
    const { worker, client } = setup();
    const cut = client.run('cutline', 'img', cutParams);
    client.run('underprint', 'img', underParams);
    worker.respond({ type: 'result', jobId: 1, ...RESULT });
    await expect(cut).resolves.toEqual(RESULT);
  });

  it('rejects on worker errors', async () => {
    const { worker, client } = setup();
    const job = client.run('cutline', 'img', cutParams);
    worker.respond({ type: 'error', jobId: 1, message: 'boom' });
    await expect(job).rejects.toThrow('boom');
  });

  it('ignores unknown job ids', () => {
    const { worker } = setup();
    expect(() => worker.respond({ type: 'result', jobId: 99, ...RESULT })).not.toThrow();
  });

  it('resolves pending jobs with null on terminate', async () => {
    const { worker, client } = setup();
    const job = client.run('cutline', 'img', cutParams);
    client.terminate();
    expect(worker.terminated).toBe(true);
    await expect(job).resolves.toBeNull();
  });
});
