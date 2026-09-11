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
