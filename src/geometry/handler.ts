import { buildCutline } from './cutline';
import { buildUnderprint } from './underprint';
import type { AlphaImage, GeometryResult, WorkerRequest, WorkerResponse } from './types';

export type RequestHandler = (req: WorkerRequest) => WorkerResponse | null;

export function createRequestHandler(): RequestHandler {
  const images = new Map<string, AlphaImage>();

  const run = (jobId: number, imageId: string, build: (img: AlphaImage) => GeometryResult): WorkerResponse => {
    const img = images.get(imageId);
    if (!img) return { type: 'error', jobId, message: `找不到圖片 ${imageId}` };
    try {
      return { type: 'result', jobId, ...build(img) };
    } catch (err) {
      return { type: 'error', jobId, message: err instanceof Error ? err.message : String(err) };
    }
  };

  return req => {
    switch (req.type) {
      case 'setImage':
        images.set(req.imageId, { width: req.width, height: req.height, alpha: req.alpha });
        return null;
      case 'dropImage':
        images.delete(req.imageId);
        return null;
      case 'cutline':
        return run(req.jobId, req.imageId, img => buildCutline(img, req.params));
      case 'underprint':
        return run(req.jobId, req.imageId, img => buildUnderprint(img, req.params));
    }
  };
}
