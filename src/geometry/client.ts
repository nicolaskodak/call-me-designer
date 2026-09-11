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
  addEventListener(type: 'error' | 'messageerror', listener: (event: Event) => void): void;
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

const WORKER_CRASHED_MESSAGE = '幾何運算中斷，已重新啟動背景程序，請再試一次。';

export class GeometryClient {
  private nextJobId = 1;
  private readonly latest: Record<GeometryJobKind, number> = { cutline: 0, underprint: 0 };
  private readonly pending = new Map<number, PendingJob>();
  /** 已送進 worker 的圖片（保留原本的參照）；worker 重啟時要重送 */
  private readonly images = new Map<string, AlphaImage>();
  private worker: WorkerLike;

  constructor(private readonly createWorker: () => WorkerLike) {
    this.worker = this.startWorker();
  }

  setImage(imageId: string, image: AlphaImage): void {
    this.images.set(imageId, image);
    this.postImage(imageId, image);
  }

  dropImage(imageId: string): void {
    this.images.delete(imageId);
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

  private startWorker(): WorkerLike {
    const worker = this.createWorker();
    const onCrash = () => this.handleCrash(worker);
    worker.addEventListener('message', event => this.handleResponse(event.data));
    worker.addEventListener('error', onCrash);
    worker.addEventListener('messageerror', onCrash);
    return worker;
  }

  /** alpha 會被 transfer 掉，每次都送一份複本 */
  private postImage(imageId: string, image: AlphaImage): void {
    const alpha = image.alpha.slice();
    this.worker.postMessage(
      { type: 'setImage', imageId, width: image.width, height: image.height, alpha },
      [alpha.buffer],
    );
  }

  /** worker 掛掉（例如大圖記憶體不足）：等待中的工作全部失敗，重開 worker 並重送圖片 */
  private handleCrash(crashed: WorkerLike): void {
    if (crashed !== this.worker) return;
    this.pending.forEach(job => job.reject(new Error(WORKER_CRASHED_MESSAGE)));
    this.pending.clear();
    crashed.terminate();
    this.worker = this.startWorker();
    this.images.forEach((image, imageId) => this.postImage(imageId, image));
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
  return new GeometryClient(() => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }));
}
