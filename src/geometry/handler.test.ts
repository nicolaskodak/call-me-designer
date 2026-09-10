import { describe, expect, it } from 'vitest';
import { createRequestHandler } from './handler';
import { cutlineParamsToPx, DEFAULT_CUTLINE_PARAMS, DEFAULT_UNDERPRINT_PARAMS, underprintParamsToPx } from './params';
import { makeAlpha, rect } from './testUtils';

const img = makeAlpha(100, 100, rect(20, 20, 60, 60));
const cutParams = cutlineParamsToPx(DEFAULT_CUTLINE_PARAMS, 300);
const underParams = underprintParamsToPx(DEFAULT_UNDERPRINT_PARAMS, 300);

describe('createRequestHandler', () => {
  it('stores images without responding', () => {
    const handle = createRequestHandler();
    expect(handle({ type: 'setImage', imageId: 'a', ...img })).toBeNull();
    expect(handle({ type: 'dropImage', imageId: 'a' })).toBeNull();
  });

  it('runs cutline and underprint jobs on a stored image', () => {
    const handle = createRequestHandler();
    handle({ type: 'setImage', imageId: 'a', ...img });

    const cut = handle({ type: 'cutline', jobId: 1, imageId: 'a', params: cutParams });
    expect(cut).toMatchObject({ type: 'result', jobId: 1, stats: { islandCount: 1 } });

    const under = handle({ type: 'underprint', jobId: 2, imageId: 'a', params: underParams });
    expect(under).toMatchObject({ type: 'result', jobId: 2, stats: { islandCount: 1 } });
  });

  it('reports a missing image', () => {
    const handle = createRequestHandler();
    handle({ type: 'setImage', imageId: 'a', ...img });
    handle({ type: 'dropImage', imageId: 'a' });
    expect(handle({ type: 'cutline', jobId: 3, imageId: 'a', params: cutParams })).toEqual({
      type: 'error',
      jobId: 3,
      message: '找不到圖片 a',
    });
  });
});
