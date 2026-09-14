import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings } from './schema';
import { DEFAULT_SHEET_SIZES } from '../imposition/sheetSizes';

describe('settings schema', () => {
  it('accepts the defaults', () => {
    expect(parseSettings(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toEqual({
      version: 1,
      defaultDpi: 300,
      exportColors: { cut: '#FF0000', underprint: '#FFFFFF' },
      removeBg: { apiKey: '', size: 'auto' },
      sheetSizes: [...DEFAULT_SHEET_SIZES],
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

describe('sheetSizes', () => {
  const base = {
    version: 1,
    defaultDpi: 300,
    exportColors: { cut: '#FF0000', underprint: '#FFFFFF' },
    removeBg: { apiKey: '', size: 'auto' },
  };

  it('舊資料沒有 sheetSizes 時補上預設清單，其他設定不受影響', () => {
    const parsed = parseSettings({ ...base, defaultDpi: 150 });
    expect(parsed?.sheetSizes).toEqual([...DEFAULT_SHEET_SIZES]);
    expect(parsed?.defaultDpi).toBe(150);
  });

  it('保留使用者自訂的清單', () => {
    const custom = [{ name: '自訂', widthMm: 500, heightMm: 400 }];
    expect(parseSettings({ ...base, sheetSizes: custom })?.sheetSizes).toEqual(custom);
  });

  it('尺寸不合法時整包視為損毀', () => {
    expect(parseSettings({ ...base, sheetSizes: [{ name: 'X', widthMm: 0, heightMm: 100 }] })).toBeNull();
    expect(parseSettings({ ...base, sheetSizes: [{ name: '', widthMm: 10, heightMm: 10 }] })).toBeNull();
  });

  it('預設設定包含預設清單', () => {
    expect(DEFAULT_SETTINGS.sheetSizes).toEqual([...DEFAULT_SHEET_SIZES]);
  });
});
