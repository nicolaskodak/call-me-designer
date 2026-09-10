import type {
  AlphaImage,
  CutlineParamsPx,
  GeometryJobKind,
  GeometryResult,
  UnderprintParamsPx,
  WorkerRequest,
  WorkerResponse,
} from './types';

export interface WorkerLike {
  postMessage(message: WorkerRequest, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<WorkerResponse>) => void): void;
  terminate(): void;
}

export interface JobParams {
  cutline: CutlineParamsPx;
  underprint: UnderprintParamsPx;
}

interface PendingJob {
  kind: GeometryJobKind;
  resolve: (result: GeometryResult | null) => void;
  reject: (error: Error) => void;
}

export class GeometryClient {
  private nextJobId = 1;
  private readonly latest: Record<GeometryJobKind, number> = { cutline: 0, underprint: 0 };
  private readonly pending = new Map<number, PendingJob>();

  constructor(private readonly worker: WorkerLike) {
    worker.addEventListener('message', event => this.handleResponse(event.data));
  }

  setImage(imageId: string, image: AlphaImage): void {
    const alpha = image.alpha.slice();
    this.worker.postMessage(
      { type: 'setImage', imageId, width: image.width, height: image.height, alpha },
      [alpha.buffer],
    );
  }

  dropImage(imageId: string): void {
    this.worker.postMessage({ type: 'dropImage', imageId });
  }

  run<K extends GeometryJobKind>(kind: K, imageId: string, params: JobParams[K]): Promise<GeometryResult | null> {
    const jobId = this.nextJobId++;
    this.latest[kind] = jobId;
    return new Promise((resolve, reject) => {
      this.pending.set(jobId, { kind, resolve, reject });
      this.worker.postMessage({ type: kind, jobId, imageId, params } as WorkerRequest);
    });
  }

  terminate(): void {
    this.worker.terminate();
    this.pending.forEach(job => job.resolve(null));
    this.pending.clear();
  }

  private handleResponse(response: WorkerResponse): void {
    const job = this.pending.get(response.jobId);
    if (!job) return;
    this.pending.delete(response.jobId);

    if (response.jobId !== this.latest[job.kind]) {
      job.resolve(null);
      return;
    }
    if (response.type === 'error') {
      job.reject(new Error(response.message));
      return;
    }
    const { polygons, warnings, stats } = response;
    job.resolve({ polygons, warnings, stats });
  }
}

export function createGeometryClient(): GeometryClient {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  return new GeometryClient(worker);
}
