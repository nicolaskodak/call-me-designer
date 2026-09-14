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
  /** 結構性防護：即使呼叫端傳入不合法的值，也不寫入 localStorage，避免下次載入時被整包重設。 */
  if (!parseSettings(settings)) return false;
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
