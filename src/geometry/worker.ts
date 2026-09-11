import { createRequestHandler } from './handler';
import type { WorkerRequest, WorkerResponse } from './types';

interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse): void;
}

const scope = self as unknown as WorkerScope;
const handle = createRequestHandler();

scope.onmessage = event => {
  const response = handle(event.data);
  if (response) scope.postMessage(response);
};
