# 第 6 階段：設定頁與 remove.bg 去背

先讀 index 的 Global Constraints。Task 6.1–6.2 是可測試的純邏輯，Task 6.3 是 UI 與串接。

remove.bg 的已知事實（已實測或查證）：
- `POST https://api.remove.bg/v1.0/removebg` 與 `GET https://api.remove.bg/v1.0/account` 都允許瀏覽器直接呼叫（CORS 預檢回傳 `access-control-allow-origin: *`，允許 `x-api-key` header）。
- 沒有 key 時回 403，body 為 `{"errors":[{"title":"Authorization failed","code":"auth_failed","detail":"..."}]}`。
- `size` 可用 `auto`、`preview`（約 0.25 MP）、`full`；輸出 PNG 時最大 10 MP；上傳檔案上限 12 MB。
- `/account` 的回應欄位官方文件沒寫清楚，採寬鬆解析（見 index「與 spec 的差異」第 5 點）。

---

### Task 6.1：設定 schema 與儲存

**Files:**
- Create: `src/settings/schema.ts`、`src/settings/storage.ts`
- Test: `src/settings/schema.test.ts`、`src/settings/storage.test.ts`

**Interfaces:**
- Consumes：`DEFAULT_DPI`、`DPI_MIN`、`DPI_MAX` from `src/units.ts`
- Produces：
  ```ts
  // settings/schema.ts
  export const REMOVE_BG_SIZES: readonly ['auto', 'preview', 'full'];
  export type RemoveBgSize = 'auto' | 'preview' | 'full';
  export const settingsSchema: z.ZodType<Settings>;
  export interface Settings { version: 1; defaultDpi: number; exportColors: { cut: string; underprint: string }; removeBg: { apiKey: string; size: RemoveBgSize } }
  export const DEFAULT_SETTINGS: Settings;
  export function parseSettings(raw: unknown): Settings | null
  // settings/storage.ts
  export const SETTINGS_STORAGE_KEY = 'callMeDesigner.settings.v1';
  export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }
  export type SettingsLoadStatus = 'ok' | 'default' | 'reset' | 'unavailable';
  export interface SettingsLoadResult { settings: Settings; status: SettingsLoadStatus }
  export function loadSettings(storage: StorageLike | null): SettingsLoadResult
  export function saveSettings(storage: StorageLike | null, settings: Settings): boolean
  export function getBrowserStorage(): StorageLike | null
  ```

- [ ] **Step 1：安裝 zod**

```bash
npm i -E zod@4.6.1
```

- [ ] **Step 2：寫失敗的測試**

`src/settings/schema.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings } from './schema';

describe('settings schema', () => {
  it('accepts the defaults', () => {
    expect(parseSettings(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toEqual({
      version: 1,
      defaultDpi: 300,
      exportColors: { cut: '#FF0000', underprint: '#FFFFFF' },
      removeBg: { apiKey: '', size: 'auto' },
    });
  });

  it('rejects invalid values', () => {
    expect(parseSettings({ ...DEFAULT_SETTINGS, defaultDpi: 10 })).toBeNull();
    expect(parseSettings({ ...DEFAULT_SETTINGS, defaultDpi: 300.5 })).toBeNull();
    expect(parseSettings({ ...DEFAULT_SETTINGS, exportColors: { cut: 'red', underprint: '#FFFFFF' } })).toBeNull();
    expect(parseSettings({ ...DEFAULT_SETTINGS, removeBg: { apiKey: '', size: 'huge' } })).toBeNull();
    expect(parseSettings({ ...DEFAULT_SETTINGS, removeBg: { apiKey: 'x'.repeat(201), size: 'auto' } })).toBeNull();
    expect(parseSettings({ ...DEFAULT_SETTINGS, version: 2 })).toBeNull();
    expect(parseSettings(null)).toBeNull();
  });
});
```

`src/settings/storage.test.ts`：

```ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './schema';
import { getBrowserStorage, loadSettings, saveSettings, SETTINGS_STORAGE_KEY, type StorageLike } from './storage';

const memory = (initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } => {
  const data = { ...initial };
  return {
    data,
    getItem: key => data[key] ?? null,
    setItem: (key, value) => { data[key] = value; },
  };
};

const throwing: StorageLike = {
  getItem: () => { throw new Error('blocked'); },
  setItem: () => { throw new Error('blocked'); },
};

describe('loadSettings', () => {
  it('returns defaults when nothing is stored', () => {
    expect(loadSettings(memory())).toEqual({ settings: DEFAULT_SETTINGS, status: 'default' });
  });

  it('round-trips saved settings', () => {
    const store = memory();
    const custom = { ...DEFAULT_SETTINGS, defaultDpi: 600 };
    expect(saveSettings(store, custom)).toBe(true);
    expect(JSON.parse(store.data[SETTINGS_STORAGE_KEY])).toEqual(custom);
    expect(loadSettings(store)).toEqual({ settings: custom, status: 'ok' });
  });

  it('resets broken JSON and invalid shapes', () => {
    expect(loadSettings(memory({ [SETTINGS_STORAGE_KEY]: '{oops' })).status).toBe('reset');
    expect(loadSettings(memory({ [SETTINGS_STORAGE_KEY]: '{"version":1}' }))).toEqual({ settings: DEFAULT_SETTINGS, status: 'reset' });
  });

  it('reports unavailable storage', () => {
    expect(loadSettings(null)).toEqual({ settings: DEFAULT_SETTINGS, status: 'unavailable' });
    expect(loadSettings(throwing).status).toBe('unavailable');
  });
});

describe('saveSettings', () => {
  it('returns false when storage is unavailable or throws', () => {
    expect(saveSettings(null, DEFAULT_SETTINGS)).toBe(false);
    expect(saveSettings(throwing, DEFAULT_SETTINGS)).toBe(false);
  });
});

describe('getBrowserStorage', () => {
  it('returns localStorage when available', () => {
    expect(getBrowserStorage()).toBe(window.localStorage);
  });
});
```

- [ ] **Step 3：確認測試失敗**

Run: `npx vitest run src/settings`
Expected: FAIL，`Failed to resolve import`

- [ ] **Step 4：實作 `src/settings/schema.ts`**

```ts
import { z } from 'zod';
import { DEFAULT_DPI, DPI_MAX, DPI_MIN } from '../units';

export const REMOVE_BG_SIZES = ['auto', 'preview', 'full'] as const;
export type RemoveBgSize = (typeof REMOVE_BG_SIZES)[number];

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const API_KEY_MAX_LENGTH = 200;

export const settingsSchema = z.object({
  version: z.literal(1),
  defaultDpi: z.number().int().min(DPI_MIN).max(DPI_MAX),
  exportColors: z.object({ cut: hexColor, underprint: hexColor }),
  removeBg: z.object({
    apiKey: z.string().max(API_KEY_MAX_LENGTH),
    size: z.enum(REMOVE_BG_SIZES),
  }),
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  defaultDpi: DEFAULT_DPI,
  exportColors: { cut: '#FF0000', underprint: '#FFFFFF' },
  removeBg: { apiKey: '', size: 'auto' },
};

export function parseSettings(raw: unknown): Settings | null {
  const result = settingsSchema.safeParse(raw);
  return result.success ? result.data : null;
}
```

- [ ] **Step 5：實作 `src/settings/storage.ts`**

```ts
import { DEFAULT_SETTINGS, parseSettings, type Settings } from './schema';

export const SETTINGS_STORAGE_KEY = 'callMeDesigner.settings.v1';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type SettingsLoadStatus = 'ok' | 'default' | 'reset' | 'unavailable';

export interface SettingsLoadResult {
  settings: Settings;
  status: SettingsLoadStatus;
}

const readRaw = (storage: StorageLike): { raw: string | null } | null => {
  try {
    return { raw: storage.getItem(SETTINGS_STORAGE_KEY) };
  } catch {
    return null;
  }
};

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

export function loadSettings(storage: StorageLike | null): SettingsLoadResult {
  const read = storage ? readRaw(storage) : null;
  if (!read) return { settings: DEFAULT_SETTINGS, status: 'unavailable' };
  if (read.raw === null) return { settings: DEFAULT_SETTINGS, status: 'default' };
  const parsed = parseSettings(parseJson(read.raw));
  return parsed ? { settings: parsed, status: 'ok' } : { settings: DEFAULT_SETTINGS, status: 'reset' };
}

export function saveSettings(storage: StorageLike | null, settings: Settings): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

/** 無痕模式或瀏覽器封鎖時存取 localStorage 會丟例外，此時回傳 null */
export function getBrowserStorage(): StorageLike | null {
  try {
    const storage = window.localStorage;
    storage.getItem(SETTINGS_STORAGE_KEY);
    return storage;
  } catch {
    return null;
  }
}
```

- [ ] **Step 6：確認測試通過**

Run: `npx vitest run src/settings`
Expected: PASS（schema 2、storage 6）

- [ ] **Step 7：驗證並 commit**

Run: `npm run typecheck && npm test`

```bash
git add package.json package-lock.json src/settings/schema.ts src/settings/schema.test.ts src/settings/storage.ts src/settings/storage.test.ts
git commit -m "feat: add validated settings schema with localStorage persistence

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6.2：remove.bg client

**Files:**
- Create: `src/services/backgroundRemover.ts`、`src/services/removeBg.ts`
- Test: `src/services/removeBg.test.ts`

**Interfaces:**
- Consumes：`RemoveBgSize` from `settings/schema.ts`；`z` from `zod`
- Produces：
  ```ts
  // services/backgroundRemover.ts
  export interface BackgroundRemover { removeBackground(input: Blob, options?: { signal?: AbortSignal }): Promise<Blob> }
  // services/removeBg.ts
  export const REMOVE_BG_ENDPOINT: string;
  export const REMOVE_BG_ACCOUNT_ENDPOINT: string;
  export const REMOVE_BG_MAX_BYTES = 12 * 1024 * 1024;
  export const REMOVE_BG_TIMEOUT_MS = 60_000;
  export type RemoveBgErrorCode = 'no_key' | 'too_large' | 'bad_request' | 'insufficient_credits' | 'auth_failed' | 'rate_limited' | 'server_error' | 'network' | 'timeout';
  export class RemoveBgError extends Error { readonly code: RemoveBgErrorCode; readonly retryAfterSeconds?: number }
  export function mapHttpError(status: number, body: string, retryAfter: string | null): RemoveBgError
  export interface AccountInfo { creditsTotal: number | null; freeCalls: number | null }
  export function parseAccount(body: unknown): AccountInfo
  export interface RemoveBgClientOptions { apiKey: string; size: RemoveBgSize; fetchImpl?: typeof fetch; timeoutMs?: number }
  export interface RemoveBgClient extends BackgroundRemover { getAccount(options?: { signal?: AbortSignal }): Promise<AccountInfo> }
  export function createRemoveBgClient(options: RemoveBgClientOptions): RemoveBgClient
  ```
  使用者主動取消（外部 `signal` abort）時，原樣拋出 `AbortError`，不包成 `RemoveBgError`。錯誤訊息與 log 都不包含 API key。

- [ ] **Step 1：寫失敗的測試**

`src/services/removeBg.test.ts`：

```ts
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
    const fetchImpl = vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const client = createRemoveBgClient({ apiKey: 'k', size: 'auto', fetchImpl, timeoutMs: 10 });
    expect(await codeOf(client.removeBackground(png()))).toBe('timeout');
  });

  it('passes through user cancellation', async () => {
    const fetchImpl = vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => {
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
```

- [ ] **Step 2：確認測試失敗**

Run: `npx vitest run src/services`
Expected: FAIL，`Failed to resolve import "./removeBg"`

- [ ] **Step 3：實作 `src/services/backgroundRemover.ts`**

```ts
/** 去背服務的共同介面；之後新增超解析時另外定義 Upscaler，不改動這裡 */
export interface BackgroundRemover {
  removeBackground(input: Blob, options?: { signal?: AbortSignal }): Promise<Blob>;
}
```

- [ ] **Step 4：實作 `src/services/removeBg.ts`**

```ts
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
```

- [ ] **Step 5：確認測試通過**

Run: `npx vitest run src/services`
Expected: PASS（16 tests：removeBackground 10（含 `it.each` 的 4 個）、mapHttpError 3、getAccount 3）

- [ ] **Step 6：驗證並 commit**

Run: `npm run typecheck && npm test`

```bash
git add src/services/backgroundRemover.ts src/services/removeBg.ts src/services/removeBg.test.ts
git commit -m "feat: add remove.bg client with typed error mapping and timeout

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6.3：設定頁與去背流程

**Files:**
- Create: `src/settings/SettingsContext.tsx`、`src/hooks/useBackgroundRemoval.ts`
- Create: `src/components/panels/SettingsPage.tsx`、`src/components/panels/BackgroundRemovalSection.tsx`
- Modify: `src/index.tsx`（包上 `SettingsProvider`）、`src/types.ts`（`ActiveTab` 加 `'settings'`）、`src/components/panels/SourcePanel.tsx`（移除重複的警告）、`src/App.tsx`

**Interfaces:**
- Consumes：Task 6.1、6.2 的全部匯出；`useSourceImage` 的 `replaceCurrent`、`revertToOriginal`；`isValidDpi`
- Produces：
  ```ts
  // settings/SettingsContext.tsx
  export interface SettingsContextValue { settings: Settings; status: SettingsLoadStatus; saved: boolean; update(fn: (s: Settings) => Settings): void }
  export function SettingsProvider(p: { children: ReactNode }): JSX.Element
  export function useSettings(): SettingsContextValue
  // hooks/useBackgroundRemoval.ts
  export interface BackgroundRemovalApi { busy: boolean; error: string | null; remove(input: Blob): Promise<void> }
  export function useBackgroundRemoval(settings: Settings, replaceCurrent: (blob: Blob) => Promise<void>): BackgroundRemovalApi
  // src/types.ts
  export type ActiveTab = 'editor' | 'underprint' | 'imposition' | 'settings';
  ```
  testid：`tab-settings`（Sidebar 自動產生）、`settings-removebg-key`、`settings-test-connection`、`remove-bg-button`、`remove-bg-settings`、`revert-original`。

**文字唯一性：** 「此圖沒有透明背景」只能出現在 `BackgroundRemovalSection`（E2E 用 `getByText` 找它），所以要從 `SourcePanel` 的警告清單移除。

- [ ] **Step 1：`src/settings/SettingsContext.tsx`**

```tsx
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Settings } from './schema';
import { getBrowserStorage, loadSettings, saveSettings, type SettingsLoadStatus } from './storage';

export interface SettingsContextValue {
  settings: Settings;
  status: SettingsLoadStatus;
  /** 最近一次寫入 localStorage 是否成功 */
  saved: boolean;
  update: (fn: (s: Settings) => Settings) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [initial] = useState(() => {
    const storage = getBrowserStorage();
    return { storage, ...loadSettings(storage) };
  });
  const [settings, setSettings] = useState<Settings>(initial.settings);
  const [saved, setSaved] = useState(initial.storage !== null);

  useEffect(() => {
    setSaved(saveSettings(initial.storage, settings));
  }, [settings, initial.storage]);

  const update = useCallback((fn: (s: Settings) => Settings) => setSettings(fn), []);
  const value = useMemo(
    () => ({ settings, status: initial.status, saved, update }),
    [settings, initial.status, saved, update],
  );
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (!value) throw new Error('useSettings 必須在 SettingsProvider 內使用');
  return value;
}
```

`src/index.tsx` 改成：

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { SettingsProvider } from './settings/SettingsContext';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <SettingsProvider>
      <App />
    </SettingsProvider>
  </React.StrictMode>,
);
```

`src/types.ts` 的 `ActiveTab` 改成：

```ts
export type ActiveTab = 'editor' | 'underprint' | 'imposition' | 'settings';
```

- [ ] **Step 2：去背 hook `src/hooks/useBackgroundRemoval.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { createRemoveBgClient, RemoveBgError } from '../services/removeBg';
import type { Settings } from '../settings/schema';

export interface BackgroundRemovalApi {
  busy: boolean;
  error: string | null;
  remove: (input: Blob) => Promise<void>;
}

export function useBackgroundRemoval(settings: Settings, replaceCurrent: (blob: Blob) => Promise<void>): BackgroundRemovalApi {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { apiKey, size } = settings.removeBg;

  useEffect(() => () => abortRef.current?.abort(), []);

  const remove = useCallback(async (input: Blob) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError(null);
    try {
      const result = await createRemoveBgClient({ apiKey, size }).removeBackground(input, { signal: controller.signal });
      await replaceCurrent(result);
    } catch (err) {
      if (controller.signal.aborted) return;
      if (!(err instanceof RemoveBgError)) console.error('去背失敗', err);
      setError(err instanceof RemoveBgError ? err.message : '去背失敗，請再試一次。');
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setBusy(false);
      }
    }
  }, [apiKey, size, replaceCurrent]);

  return { busy, error, remove };
}
```

- [ ] **Step 3：`src/components/panels/BackgroundRemovalSection.tsx`**

```tsx
import { Eraser, RotateCcw, Settings } from 'lucide-react';
import React from 'react';
import type { RemoveBgSize } from '../../settings/schema';
import type { SourceImage } from '../../source/sourceModel';
import { ActionButton, Warnings } from './fields';

interface BackgroundRemovalSectionProps {
  source: SourceImage | null;
  hasKey: boolean;
  size: RemoveBgSize;
  busy: boolean;
  error: string | null;
  onRemove: () => void;
  onRevert: () => void;
  onOpenSettings: () => void;
}

const PREVIEW_HINT = 'preview 免費但解析度低（約 0.25 MP），實際尺寸不變，有效 DPI 會下降。';

export function BackgroundRemovalSection({ source, hasKey, size, busy, error, onRemove, onRevert, onOpenSettings }: BackgroundRemovalSectionProps) {
  if (!source) return null;
  return (
    <div className="space-y-2">
      {!source.current.transparent ? (
        <div className="p-2 rounded bg-amber-900/30 border border-amber-700 text-[11px] text-amber-200">
          此圖沒有透明背景，無法產生輪廓。
        </div>
      ) : null}
      {hasKey ? (
        <ActionButton onClick={onRemove} disabled={busy} testId="remove-bg-button">
          <Eraser className="w-3 h-3" /> {busy ? '去背中…' : '用 remove.bg 去背'}
        </ActionButton>
      ) : (
        <ActionButton onClick={onOpenSettings} testId="remove-bg-settings">
          <Settings className="w-3 h-3" /> 前往設定填寫 remove.bg API key
        </ActionButton>
      )}
      {source.original ? (
        <ActionButton onClick={onRevert} disabled={busy} testId="revert-original">
          <RotateCcw className="w-3 h-3" /> 還原原圖
        </ActionButton>
      ) : null}
      {hasKey && size === 'preview' ? <p className="text-[10px] text-neutral-500">{PREVIEW_HINT}</p> : null}
      <Warnings messages={error ? [error] : []} />
    </div>
  );
}
```

- [ ] **Step 4：`SourcePanel` 移除重複的警告**

在 `src/components/panels/SourcePanel.tsx` 的 `warnings` 陣列中刪除這一行：

```tsx
    ...(v && !v.transparent ? ['此圖沒有透明背景，無法產生輪廓。'] : []),
```

- [ ] **Step 5：設定頁 `src/components/panels/SettingsPage.tsx`**

```tsx
import { Eye, EyeOff, PlugZap, Trash2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { createRemoveBgClient, RemoveBgError } from '../../services/removeBg';
import { REMOVE_BG_SIZES, type RemoveBgSize } from '../../settings/schema';
import { useSettings } from '../../settings/SettingsContext';
import { DPI_MAX, DPI_MIN, isValidDpi } from '../../units';
import { ActionButton, Section, SelectField, Warnings } from './fields';

const SIZE_LABELS: Record<RemoveBgSize, string> = {
  auto: 'auto（依點數自動選最高解析度）',
  preview: 'preview（免費，約 0.25 MP）',
  full: 'full（原始解析度，PNG 最多 10 MP）',
};

const STATUS_NOTICE: Partial<Record<string, string>> = {
  reset: '設定資料損毀，已重設為預設值。',
  unavailable: '這個瀏覽器無法儲存設定，重新整理後會遺失。',
};

function DefaultDpiField({ value, onCommit }: { value: number; onCommit: (dpi: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = Number(draft);
    if (Number.isInteger(n) && isValidDpi(n)) onCommit(n);
    else setDraft(String(value));
  };
  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      <span className="text-neutral-400">預設 DPI（圖檔沒有資訊時使用）</span>
      <input
        type="number"
        min={DPI_MIN}
        max={DPI_MAX}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); }}
        className="w-24 px-2 py-1 rounded bg-neutral-700 border border-neutral-600 text-white text-right"
      />
    </label>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (hex: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      <span className="text-neutral-400">{label}</span>
      <span className="flex items-center gap-2">
        <span className="font-mono text-neutral-500">{value.toUpperCase()}</span>
        <input type="color" value={value} onChange={e => onChange(e.target.value.toUpperCase())} className="w-8 h-8 rounded bg-transparent border-none cursor-pointer" />
      </span>
    </label>
  );
}

function ConnectionTest({ apiKey, size }: { apiKey: string; size: RemoveBgSize }) {
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const test = async () => {
    setTesting(true);
    setResult(null);
    try {
      const account = await createRemoveBgClient({ apiKey, size }).getAccount();
      const credits = account.creditsTotal !== null ? `，剩餘點數 ${account.creditsTotal}` : '';
      const free = account.freeCalls !== null ? `，免費次數 ${account.freeCalls}` : '';
      setResult({ ok: true, text: `連線成功${credits}${free}` });
    } catch (err) {
      setResult({ ok: false, text: err instanceof RemoveBgError ? err.message : '測試失敗，請稍後再試。' });
    } finally {
      setTesting(false);
    }
  };
  return (
    <div className="space-y-2">
      <ActionButton onClick={() => void test()} disabled={testing || !apiKey.trim()} testId="settings-test-connection">
        <PlugZap className="w-3 h-3" /> {testing ? '測試中…' : '測試連線'}
      </ActionButton>
      {result ? (
        <p className={`text-[11px] ${result.ok ? 'text-emerald-300' : 'text-red-300'}`} data-testid="settings-test-result">{result.text}</p>
      ) : null}
    </div>
  );
}

export function SettingsPage() {
  const { settings, status, saved, update } = useSettings();
  const [showKey, setShowKey] = useState(false);
  const { apiKey, size } = settings.removeBg;
  const notices = [STATUS_NOTICE[status], !saved && status !== 'unavailable' ? STATUS_NOTICE.unavailable : undefined].filter(
    (n): n is string => Boolean(n),
  );
  const setRemoveBg = (patch: Partial<typeof settings.removeBg>) =>
    update(s => ({ ...s, removeBg: { ...s.removeBg, ...patch } }));

  return (
    <>
      <Warnings messages={notices} />
      <Section title="一般">
        <DefaultDpiField value={settings.defaultDpi} onCommit={dpi => update(s => ({ ...s, defaultDpi: dpi }))} />
      </Section>
      <Section title="匯出顏色">
        <ColorField label="刀模線" value={settings.exportColors.cut} onChange={c => update(s => ({ ...s, exportColors: { ...s.exportColors, cut: c } }))} />
        <ColorField label="白墨" value={settings.exportColors.underprint} onChange={c => update(s => ({ ...s, exportColors: { ...s.exportColors, underprint: c } }))} />
      </Section>
      <Section title="remove.bg 去背">
        <label className="block space-y-1 text-xs">
          <span className="text-neutral-400">API key</span>
          <span className="flex gap-2">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              maxLength={200}
              autoComplete="off"
              spellCheck={false}
              data-testid="settings-removebg-key"
              onChange={e => setRemoveBg({ apiKey: e.target.value })}
              className="flex-1 min-w-0 px-2 py-1 rounded bg-neutral-700 border border-neutral-600 text-white font-mono"
            />
            <button type="button" title={showKey ? '隱藏' : '顯示'} onClick={() => setShowKey(v => !v)} className="px-2 rounded bg-neutral-700 text-neutral-300">
              {showKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            </button>
            <button type="button" title="清除" onClick={() => setRemoveBg({ apiKey: '' })} className="px-2 rounded bg-neutral-700 text-neutral-300">
              <Trash2 className="w-3 h-3" />
            </button>
          </span>
        </label>
        <p className="text-[10px] text-neutral-500">API key 只存在這個瀏覽器，除了呼叫 remove.bg 之外不會送到任何地方。</p>
        <SelectField
          label="輸出尺寸"
          value={size}
          options={REMOVE_BG_SIZES.map(s => ({ value: s, label: SIZE_LABELS[s] }))}
          onChange={v => setRemoveBg({ size: v })}
        />
        <ConnectionTest apiKey={apiKey} size={size} />
      </Section>
    </>
  );
}
```

- [ ] **Step 6：修改 `src/App.tsx`**

以第 5 階段的 App 為基礎，依序做以下修改：

**6a.** import 區：加入下面四行，並**刪除** `import { DEFAULT_DPI } from './units';`

```tsx
import { BackgroundRemovalSection } from './components/panels/BackgroundRemovalSection';
import { SettingsPage } from './components/panels/SettingsPage';
import { useBackgroundRemoval } from './hooks/useBackgroundRemoval';
import { useSettings } from './settings/SettingsContext';
```

**6b.** 刪除這四行常數定義：

```tsx
/** 第 6 階段改為讀取設定頁的顏色 */
const EXPORT_CUT_COLOR = '#FF0000';
const EXPORT_UNDERPRINT_COLOR = '#FFFFFF';
const EXPORT_COLORS = { cut: EXPORT_CUT_COLOR, underprint: EXPORT_UNDERPRINT_COLOR };
```

並在 `TABS` 陣列最後加上 `{ id: 'settings', label: '設定' },`。

**6c.** 其餘用到舊常數的地方改成讀設定（刪除定義之後再執行）：

```bash
perl -pi -e 's/EXPORT_CUT_COLOR/exportColors.cut/g; s/EXPORT_UNDERPRINT_COLOR/exportColors.underprint/g; s/EXPORT_COLORS/exportColors/g' src/App.tsx
```

**6d.** 在 `const App: React.FC = () => {` 的下一行（`useState<ActiveTab>` 之前）加入：

```tsx
  const { settings } = useSettings();
  const exportColors = settings.exportColors;
```

並把 `useSourceImage(DEFAULT_DPI)` 改成 `useSourceImage(settings.defaultDpi)`，`useImposition(activeTab === 'imposition', DEFAULT_DPI)` 改成 `useImposition(activeTab === 'imposition', settings.defaultDpi)`。

**6e.** 在 `const guardSource = ...` 那一行之後加入：

```tsx
  const bgRemoval = useBackgroundRemoval(settings, sourceApi.replaceCurrent);
  const removeBackground = () => {
    if (!source) return;
    // 一律從原圖去背，避免對已處理過的結果再處理一次
    const input = source.original?.blob ?? source.current.blob;
    guardSource(() => void bgRemoval.remove(input));
  };
  const revertOriginal = () => guardSource(() => sourceApi.revertToOriginal());
```

**6f.** 把 `sourcePanel` 的定義換成：

```tsx
  const sourcePanel = (
    <SourcePanel
      source={source}
      loading={sourceApi.loading}
      error={sourceApi.error}
      onUpload={file => guardSource(() => void sourceApi.upload(file))}
      onDpiChange={d => guardSource(() => sourceApi.setDpi(d))}
    >
      <BackgroundRemovalSection
        source={source}
        hasKey={settings.removeBg.apiKey.trim().length > 0}
        size={settings.removeBg.size}
        busy={bgRemoval.busy || sourceApi.loading}
        error={bgRemoval.error}
        onRemove={removeBackground}
        onRevert={revertOriginal}
        onOpenSettings={() => setActiveTab('settings')}
      />
    </SourcePanel>
  );
```

**6g.** 在 `<Sidebar>` 裡、`{activeTab === 'imposition' ? (...) : null}` 之後加入：

```tsx
        {activeTab === 'settings' ? <SettingsPage /> : null}
```

**6h.** 在 `<main>` 裡、Imposition 容器之後（`<Toast>` 之前）加入：

```tsx
        <div className="absolute inset-0 flex items-center justify-center text-neutral-500 text-sm" hidden={activeTab !== 'settings'}>
          設定會自動儲存在這個瀏覽器。
        </div>
```

- [ ] **Step 7：自動驗證**

Run: `npm run typecheck && npm test && npm run build`
Expected: 全部通過。

Run: `grep -rn "EXPORT_CUT_COLOR\|EXPORT_UNDERPRINT_COLOR\|EXPORT_COLORS\|DEFAULT_DPI" src/App.tsx`
Expected: 沒有輸出。

- [ ] **Step 8：手動驗證（`npm run dev`，需要一組 remove.bg API key；沒有的話可跳過第 4、5 項）**

1. 設定頁把預設 DPI 改成 150 → 重新整理頁面後仍是 150；上傳一張沒有 DPI 資訊的 PNG → 來源圖片顯示「DPI（預設值）150」。
2. 在 DevTools 把 localStorage 的 `callMeDesigner.settings.v1` 改成 `{oops` 再重新整理 → 設定頁顯示「設定資料損毀，已重設為預設值」。
3. 沒填 key 時上傳白底 JPG → 顯示「此圖沒有透明背景」與「前往設定填寫 remove.bg API key」，點擊後切到設定頁。
4. 填入有效 key → 「測試連線」顯示「連線成功…」；填錯 key → 顯示「API key 無效，請到設定頁檢查。」
5. 回到 Editor 按「用 remove.bg 去背」→ 出現「去背中…」，完成後刀模出現、「還原原圖」可用；size 設為 preview 時，來源圖片的 mm 尺寸與去背前相同，DPI 變低。
6. 在刀模上拖曳節點後按去背或還原原圖 → 先跳出覆蓋確認。
7. 設定頁把刀模顏色改成藍色 → 匯出的刀模 SVG 與 Imposition 分層 SVG 都使用新顏色。
8. DevTools 的 Network 面板中，除了 `api.remove.bg` 之外，沒有任何請求帶有 `X-Api-Key`。

- [ ] **Step 9：Commit**

```bash
git add src/index.tsx src/types.ts src/App.tsx src/settings/SettingsContext.tsx src/hooks/useBackgroundRemoval.ts src/components/panels/SettingsPage.tsx src/components/panels/BackgroundRemovalSection.tsx src/components/panels/SourcePanel.tsx
git commit -m "feat: add settings page and remove.bg background removal

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
