import { describe, expect, it, vi } from 'vitest';
import {
  createRemoveBgClient,
  mapHttpError,
  parseAccount,
  REMOVE_BG_ACCOUNT_ENDPOINT,
  REMOVE_BG_ENDPOINT,
  REMOVE_BG_MAX_BYTES,
  RemoveBgError,
} from './removeBg';

const png = () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
const okImage = () => new Response(new Uint8Array([9, 9]), { status: 200, headers: { 'content-type': 'image/png' } });
const failWith = (status: number, body = '', headers: Record<string, string> = {}) =>
  vi.fn<typeof fetch>(async () => new Response(body, { status, headers }));

const rejection = async (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(() => { throw new Error('expected rejection'); }, (err: unknown) => err);

const codeOf = async (promise: Promise<unknown>) => ((await rejection(promise)) as RemoveBgError).code;

describe('removeBackground', () => {
  it('posts the image as multipart with the api key and returns the PNG', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => okImage());
    const client = createRemoveBgClient({ apiKey: ' k ', size: 'preview', fetchImpl });

    const result = await client.removeBackground(png());

    expect(result.size).toBe(2);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(REMOVE_BG_ENDPOINT);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'X-Api-Key': 'k' });
    const form = init?.body as FormData;
    expect(form.get('size')).toBe('preview');
    expect(form.get('format')).toBe('png');
    expect(form.get('image_file')).toBeInstanceOf(Blob);
  });

  it('requires an api key without calling fetch', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const client = createRemoveBgClient({ apiKey: '  ', size: 'auto', fetchImpl });
    expect(await codeOf(client.removeBackground(png()))).toBe('no_key');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects files over 12 MB', async () => {
    const client = createRemoveBgClient({ apiKey: 'k', size: 'auto', fetchImpl: vi.fn<typeof fetch>() });
    const big = new Blob([new Uint8Array(REMOVE_BG_MAX_BYTES + 1)]);
    expect(await codeOf(client.removeBackground(big))).toBe('too_large');
  });

  it.each([
    [402, 'insufficient_credits'],
    [403, 'auth_failed'],
    [500, 'server_error'],
    [503, 'server_error'],
  ] as const)('maps HTTP %i to %s', async (status, code) => {
    const client = createRemoveBgClient({ apiKey: 'k', size: 'auto', fetchImpl: failWith(status) });
    expect(await codeOf(client.removeBackground(png()))).toBe(code);
  });

  it('maps network failures', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => { throw new TypeError('Failed to fetch'); });
    const client = createRemoveBgClient({ apiKey: 'k', size: 'auto', fetchImpl });
    expect(await codeOf(client.removeBackground(png()))).toBe('network');
  });

  it('times out', async () => {
    const fetchImpl = vi.fn<typeof fetch>((_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const client = createRemoveBgClient({ apiKey: 'k', size: 'auto', fetchImpl, timeoutMs: 10 });
    expect(await codeOf(client.removeBackground(png()))).toBe('timeout');
  });

  it('passes through user cancellation', async () => {
    const fetchImpl = vi.fn<typeof fetch>((_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const client = createRemoveBgClient({ apiKey: 'k', size: 'auto', fetchImpl });
    const controller = new AbortController();
    const pending = client.removeBackground(png(), { signal: controller.signal });
    controller.abort();
    const err = await rejection(pending);
    expect(err).not.toBeInstanceOf(RemoveBgError);
    expect((err as Error).name).toBe('AbortError');
  });
});

describe('mapHttpError', () => {
  it('uses the remove.bg error title for 400', () => {
    const err = mapHttpError(400, JSON.stringify({ errors: [{ title: 'Could not identify foreground' }] }), null);
    expect(err.code).toBe('bad_request');
    expect(err.message).toBe('remove.bg 無法處理這張圖：Could not identify foreground');
  });

  it('falls back when the 400 body is not JSON', () => {
    expect(mapHttpError(400, 'nope', null).message).toBe('remove.bg 無法處理這張圖：請求格式錯誤');
  });

  it('reads Retry-After for 429', () => {
    const err = mapHttpError(429, '', '30');
    expect(err.code).toBe('rate_limited');
    expect(err.retryAfterSeconds).toBe(30);
    expect(err.message).toBe('請求太頻繁，請 30 秒後再試。');
    expect(mapHttpError(429, '', null).retryAfterSeconds).toBeUndefined();
  });
});

describe('getAccount', () => {
  it('reads credits and free calls when present', async () => {
    const body = { data: { attributes: { credits: { total: 42 }, api: { free_calls: 7 } } } };
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status: 200 }));
    const client = createRemoveBgClient({ apiKey: 'k', size: 'auto', fetchImpl });
    await expect(client.getAccount()).resolves.toEqual({ creditsTotal: 42, freeCalls: 7 });
    expect(fetchImpl.mock.calls[0][0]).toBe(REMOVE_BG_ACCOUNT_ENDPOINT);
    expect(fetchImpl.mock.calls[0][1]?.method).toBe('GET');
  });

  it('tolerates unknown response shapes', () => {
    expect(parseAccount({})).toEqual({ creditsTotal: null, freeCalls: null });
    expect(parseAccount({ data: { attributes: {} } })).toEqual({ creditsTotal: null, freeCalls: null });
  });

  it('maps an invalid key', async () => {
    const client = createRemoveBgClient({ apiKey: 'bad', size: 'auto', fetchImpl: failWith(403) });
    expect(await codeOf(client.getAccount())).toBe('auth_failed');
  });
});
