import { describe, expect, it, vi } from 'vitest';
import { createRequestHandler } from './handler';
import { cutlineParamsToPx, DEFAULT_CUTLINE_PARAMS } from './params';
import { makeAlpha, rect } from './testUtils';

vi.mock('./cutline', () => ({
  buildCutline: () => {
    throw new Error('boom');
  },
}));

describe('createRequestHandler errors', () => {
  it('turns exceptions into error responses', () => {
    const handle = createRequestHandler();
    handle({ type: 'setImage', imageId: 'a', ...makeAlpha(10, 10, rect(2, 2, 5, 5)) });
    const params = cutlineParamsToPx(DEFAULT_CUTLINE_PARAMS, 300);
    expect(handle({ type: 'cutline', jobId: 1, imageId: 'a', params })).toEqual({
      type: 'error',
      jobId: 1,
      message: 'boom',
    });
  });
});
