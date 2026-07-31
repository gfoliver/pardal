import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { UI_STRINGS, type UILocale, type UIStrings } from "../i18n/strings";
import type { CurrencyCode } from "../lib/currency";
import { defaultPrefs, readPrefs, type Mode, type Prefs, type Theme } from "../lib/prefs";

export type { Mode, Theme };

interface AppState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  mode: Mode;
  setMode: (m: Mode) => void;
  locale: UILocale;
  setLocale: (l: UILocale) => void;
  /** Display currency — chosen independently of the language. */
  currency: CurrencyCode;
  setCurrency: (c: CurrencyCode) => void;
  t: UIStrings;
}

const AppCtx = createContext<AppState | null>(null);

/** Kept from before the rename to Pardal — see the note on DB_NAME in
 *  lib/career/storage.ts. A new key would silently reset everyone's settings. */
const STORE_KEY = "onze.prefs";

function loadPrefs(): Prefs {
  try {
    return readPrefs(localStorage.getItem(STORE_KEY));
  } catch {
    return defaultPrefs(); // localStorage can throw outright (private mode, blocked storage)
  }
}

export function AppProviders({ children }: { children: ReactNode }) {
  const initial = loadPrefs();
  const [theme, setTheme] = useState<Theme>(initial.theme);
  const [mode, setMode] = useState<Mode>(initial.mode);
  const [locale, setLocale] = useState<UILocale>(initial.locale);
  const [currency, setCurrency] = useState<CurrencyCode>(initial.currency);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = locale;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ theme, mode, locale, currency }));
    } catch {
      /* ignore */
    }
  }, [theme, mode, locale, currency]);

  const value = useMemo<AppState>(
    () => ({ theme, setTheme, mode, setMode, locale, setLocale, currency, setCurrency, t: UI_STRINGS[locale] }),
    [theme, mode, locale, currency],
  );

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp must be used within AppProviders");
  return ctx;
}

/** Convenience: render children only in the given mode (progressive disclosure). */
export function useIsAdvanced(): boolean {
  return useApp().mode === "advanced";
}

export function useToggleTheme(): () => void {
  const { theme, setTheme } = useApp();
  return useCallback(() => setTheme(theme === "dark" ? "light" : "dark"), [theme, setTheme]);
}
