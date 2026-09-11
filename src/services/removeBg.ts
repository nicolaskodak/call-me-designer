import { z } from 'zod';
import type { RemoveBgSize } from '../settings/schema';
import type { BackgroundRemover } from './backgroundRemover';

export const REMOVE_BG_ENDPOINT = 'https://api.remove.bg/v1.0/removebg';
export const REMOVE_BG_ACCOUNT_ENDPOINT = 'https://api.remove.bg/v1.0/account';
export const REMOVE_BG_MAX_BYTES = 12 * 1024 * 1024;
export const REMOVE_BG_TIMEOUT_MS = 60_000;

export type RemoveBgErrorCode =
  | 'no_key'
  | 'too_large'
  | 'bad_request'
  | 'insufficient_credits'
  | 'auth_failed'
  | 'rate_limited'
  | 'server_error'
  | 'network'
  | 'timeout';

export class RemoveBgError extends Error {
  readonly code: RemoveBgErrorCode;
  readonly retryAfterSeconds?: number;

  constructor(code: RemoveBgErrorCode, message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = 'RemoveBgError';
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const errorBodySchema = z.object({ errors: z.array(z.object({ title: z.string() })).min(1) });

const firstErrorTitle = (body: string): string | null => {
  try {
    const parsed = errorBodySchema.safeParse(JSON.parse(body));
    return parsed.success ? parsed.data.errors[0].title : null;
  } catch {
    return null;
  }
};

export function mapHttpError(status: number, body: string, retryAfter: string | null): RemoveBgError {
  if (status === 400) {
    return new RemoveBgError('bad_request', `remove.bg 無法處理這張圖：${firstErrorTitle(body) ?? '請求格式錯誤'}`);
  }
  if (status === 402) return new RemoveBgError('insufficient_credits', '點數不足，請到 remove.bg 儲值。');
  if (status === 403) return new RemoveBgError('auth_failed', 'API key 無效，請到設定頁檢查。');
  if (status === 429) {
    const seconds = retryAfter ? Number.parseInt(retryAfter, 10) : Number.NaN;
    return Number.isFinite(seconds)
      ? new RemoveBgError('rate_limited', `請求太頻繁，請 ${seconds} 秒後再試。`, seconds)
      : new RemoveBgError('rate_limited', '請求太頻繁，請稍後再試。');
  }
  return new RemoveBgError('server_error', 'remove.bg 服務暫時有問題，請稍後再試。');
}

const accountSchema = z.object({
  data: z.object({
    attributes: z.object({
      credits: z.object({ total: z.number() }).partial().optional(),
      api: z.object({ free_calls: z.number() }).partial().optional(),
    }),
  }),
});

export interface AccountInfo {
  creditsTotal: number | null;
  freeCalls: number | null;
}

export function parseAccount(body: unknown): AccountInfo {
  const parsed = accountSchema.safeParse(body);
  if (!parsed.success) return { creditsTotal: null, freeCalls: null };
  const { credits, api } = parsed.data.data.attributes;
  return { creditsTotal: credits?.total ?? null, freeCalls: api?.free_calls ?? null };
}

async function request(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const forwardAbort = () => controller.abort();
  signal?.addEventListener('abort', forwardAbort);

  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    if (!response.ok) throw mapHttpError(response.status, await response.text(), response.headers.get('Retry-After'));
    return response;
  } catch (err) {
    if (err instanceof RemoveBgError) throw err;
    if (timedOut) throw new RemoveBgError('timeout', '連線 remove.bg 逾時，請稍後再試。');
    if (signal?.aborted) throw err;
    console.error('remove.bg 請求失敗', err);
    throw new RemoveBgError('network', '無法連線到 remove.bg。');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }
}

export interface RemoveBgClientOptions {
  apiKey: string;
  size: RemoveBgSize;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface RemoveBgClient extends BackgroundRemover {
  getAccount(options?: { signal?: AbortSignal }): Promise<AccountInfo>;
}

export function createRemoveBgClient(options: RemoveBgClientOptions): RemoveBgClient {
  const fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? REMOVE_BG_TIMEOUT_MS;
  const apiKey = options.apiKey.trim();
  const requireKey = () => {
    if (!apiKey) throw new RemoveBgError('no_key', '尚未設定 remove.bg API key。');
  };

  return {
    async removeBackground(input, opts) {
      requireKey();
      if (input.size > REMOVE_BG_MAX_BYTES) throw new RemoveBgError('too_large', '檔案超過 remove.bg 的 12 MB 上限。');
      const form = new FormData();
      form.append('image_file', input, 'upload');
      form.append('size', options.size);
      form.append('format', 'png');
      const response = await request(
        fetchImpl,
        REMOVE_BG_ENDPOINT,
        { method: 'POST', headers: { 'X-Api-Key': apiKey }, body: form },
        timeoutMs,
        opts?.signal,
      );
      return response.blob();
    },

    async getAccount(opts) {
      requireKey();
      const response = await request(
        fetchImpl,
        REMOVE_BG_ACCOUNT_ENDPOINT,
        { method: 'GET', headers: { 'X-Api-Key': apiKey, Accept: 'application/json' } },
        timeoutMs,
        opts?.signal,
      );
      return parseAccount(await response.json());
    },
  };
}
