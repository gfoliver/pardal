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

export type Theme = "dark" | "light";
export type Mode = "simple" | "advanced";

interface AppState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  mode: Mode;
  setMode: (m: Mode) => void;
  locale: UILocale;
  setLocale: (l: UILocale) => void;
  t: UIStrings;
}

const AppCtx = createContext<AppState | null>(null);

const STORE_KEY = "onze.prefs";

function loadPrefs(): { theme: Theme; mode: Mode; locale: UILocale } {
  const fallback = { theme: "dark" as Theme, mode: "simple" as Mode, locale: "en" as UILocale };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

export function AppProviders({ children }: { children: ReactNode }) {
  const initial = loadPrefs();
  const [theme, setTheme] = useState<Theme>(initial.theme);
  const [mode, setMode] = useState<Mode>(initial.mode);
  const [locale, setLocale] = useState<UILocale>(initial.locale);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = locale;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ theme, mode, locale }));
    } catch {
      /* ignore */
    }
  }, [theme, mode, locale]);

  const value = useMemo<AppState>(
    () => ({ theme, setTheme, mode, setMode, locale, setLocale, t: UI_STRINGS[locale] }),
    [theme, mode, locale],
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
