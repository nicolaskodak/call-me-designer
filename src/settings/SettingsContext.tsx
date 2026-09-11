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
