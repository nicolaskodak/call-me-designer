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
