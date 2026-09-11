import { describe, expect, it } from 'vitest';
import { GeometryClient, type WorkerLike } from './client';
import { cutlineParamsToPx, DEFAULT_CUTLINE_PARAMS, DEFAULT_UNDERPRINT_PARAMS, underprintParamsToPx } from './params';
import type { WorkerRequest, WorkerResponse } from './types';

// error／messageerror 的 listener 收 Event，也能接受 MessageEvent，所以統一用這個型別存
type Listener = (event: MessageEvent<WorkerResponse>) => void;

class FakeWorker implements WorkerLike {
  posted: { message: WorkerRequest; transfer?: Transferable[] }[] = [];
  terminated = false;
  private readonly listeners = new Map<string, Listener>();

  postMessage(message: WorkerRequest, transfer?: Transferable[]): void {
    this.posted.push({ message, transfer });
  }
  addEventListener(type: 'message' | 'error' | 'messageerror', listener: Listener): void {
    this.listeners.set(type, listener);
  }
  terminate(): void {
    this.terminated = true;
  }
  respond(response: WorkerResponse): void {
    this.listeners.get('message')?.({ data: response } as MessageEvent<WorkerResponse>);
  }
  emitError(type: 'error' | 'messageerror' = 'error'): void {
    this.listeners.get(type)?.(new MessageEvent(type));
  }
}

const RESULT = { polygons: [], warnings: [], stats: { islandCount: 0 } };
const CRASH_MESSAGE = '幾何運算中斷，已重新啟動背景程序，請再試一次。';
const cutParams = cutlineParamsToPx(DEFAULT_CUTLINE_PARAMS, 300);
const underParams = underprintParamsToPx(DEFAULT_UNDERPRINT_PARAMS, 300);

const setup = () => {
  const workers: FakeWorker[] = [];
  const client = new GeometryClient(() => {
    const created = new FakeWorker();
    workers.push(created);
    return created;
  });
  return { worker: workers[0], workers, client };
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

describe('GeometryClient worker crashes', () => {
  it.each(['error', 'messageerror'] as const)('rejects every pending job on a worker %s event', async type => {
    const { worker, client } = setup();
    const cut = client.run('cutline', 'img', cutParams);
    const under = client.run('underprint', 'img', underParams);
    worker.emitError(type);
    await expect(cut).rejects.toThrow(CRASH_MESSAGE);
    await expect(under).rejects.toThrow(CRASH_MESSAGE);
  });

  it('starts a new worker and re-sends tracked images but not dropped ones', () => {
    const { workers, client } = setup();
    const kept = { width: 2, height: 1, alpha: new Uint8ClampedArray([1, 2]) };
    client.setImage('kept', kept);
    client.setImage('dropped', { width: 1, height: 1, alpha: new Uint8ClampedArray([9]) });
    client.dropImage('dropped');
    workers[0].emitError();

    expect(workers[0].terminated).toBe(true);
    expect(workers).toHaveLength(2);
    expect(workers[1].posted).toHaveLength(1);
    const { message, transfer } = workers[1].posted[0];
    expect(message).toMatchObject({ type: 'setImage', imageId: 'kept', width: 2, height: 1 });
    if (message.type !== 'setImage') throw new Error('unexpected message');
    expect(message.alpha).not.toBe(kept.alpha);
    expect(Array.from(message.alpha)).toEqual([1, 2]);
    expect(transfer).toEqual([message.alpha.buffer]);
  });

  it('runs jobs on the new worker after a restart', async () => {
    const { workers, client } = setup();
    const before = client.run('cutline', 'img', cutParams);
    workers[0].emitError();
    await expect(before).rejects.toThrow(CRASH_MESSAGE);

    const after = client.run('cutline', 'img', cutParams);
    const posted = workers[1].posted.at(-1)?.message;
    if (!posted || posted.type !== 'cutline') throw new Error('job was not sent to the new worker');
    workers[1].respond({ type: 'result', jobId: posted.jobId, ...RESULT });
    await expect(after).resolves.toEqual(RESULT);

    client.terminate();
    expect(workers[1].terminated).toBe(true);
  });
});
