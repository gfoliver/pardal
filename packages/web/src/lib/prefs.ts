import { UI_LOCALES, type UILocale } from "../i18n/strings";
import { CURRENCIES, type CurrencyCode } from "../lib/currency";

/**
 * Where the app's settings come from before the user has chosen any.
 *
 * Pure and separately importable so the rules can be tested with a stubbed navigator, rather
 * than only through a rendered provider.
 */

export type Theme = "dark" | "light";
export interface Prefs {
  readonly theme: Theme;
  readonly locale: UILocale;
  readonly currency: CurrencyCode;
}

/** The languages we ship, by primary subtag. */
const LANGUAGE_LOCALE: Record<string, UILocale> = { pt: "pt-BR", en: "en" };

/** Regions that spend euros — a language tag names a country, not a currency. */
const EURO_REGIONS = new Set([
  "AD", "AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR", "IE", "IT",
  "LT", "LU", "LV", "MC", "ME", "MT", "NL", "PT", "SI", "SK", "SM", "VA", "XK",
]);

/**
 * The browser's language preferences, most wanted first.
 *
 * Reads the whole `languages` list rather than `language` alone, which is what lets a
 * second choice win when the first is a language we do not have.
 */
export function preferredTags(nav: { languages?: readonly string[]; language?: string } | undefined = globalThis.navigator): readonly string[] {
  if (!nav) return [];
  return nav.languages?.length ? nav.languages : [nav.language].filter((t): t is string => Boolean(t));
}

export function browserLocale(tags: readonly string[] = preferredTags()): UILocale {
  for (const tag of tags) {
    const hit = LANGUAGE_LOCALE[tag.toLowerCase().split("-")[0] ?? ""];
    if (hit) return hit;
  }
  return "en";
}

/** The country a language tag names, if it names one. */
export function regionOf(tag: string): string | undefined {
  try {
    const region = new Intl.Locale(tag).region;
    if (region) return region.toUpperCase();
  } catch {
    /* malformed tag — fall through to the crude read */
  }
  return tag.toUpperCase().split("-").find((p, i) => i > 0 && p.length === 2);
}

/**
 * A display currency from where the browser says it is.
 *
 * Falls back to BRL rather than to a "neutral" USD: our datasets are BRL-denominated, so BRL
 * is the one currency shown without passing through an approximate static rate. If we cannot
 * tell where someone is, showing them the untouched numbers is the honest default.
 *
 * Decided by the FIRST tag that carries a region. A browser asking for `["en", "pt-BR"]` has
 * told us nothing about where it is until the second tag, so that is the one that counts.
 */
export function browserCurrency(tags: readonly string[] = preferredTags()): CurrencyCode {
  for (const tag of tags) {
    const region = regionOf(tag);
    if (!region) continue;
    if (region === "BR") return "BRL";
    if (EURO_REGIONS.has(region)) return "EUR";
    return "USD";
  }
  return "BRL";
}

export function defaultPrefs(tags: readonly string[] = preferredTags()): Prefs {
  return { theme: "dark", locale: browserLocale(tags), currency: browserCurrency(tags) };
}

/**
 * Stored preferences, or the browser's own settings on a first run.
 *
 * Every field is CHECKED against what this build supports rather than spread in. The old
 * `{ ...fallback, ...JSON.parse(raw) }` accepted anything: a stored `locale` we no longer
 * ship — from a hand-edited value, or simply from a locale being renamed in a later version
 * — left `UI_STRINGS[locale]` undefined and made every single `t.*` read throw, on a screen
 * with no way back. One unknown field should cost that field, not the app.
 */
export function readPrefs(raw: string | null, fallback: Prefs = defaultPrefs()): Prefs {
  if (!raw) return fallback;
  try {
    const saved = JSON.parse(raw) as Partial<Record<keyof Prefs, unknown>>;
    return {
      theme: saved.theme === "light" || saved.theme === "dark" ? saved.theme : fallback.theme,
      locale: UI_LOCALES.some((l) => l.id === saved.locale) ? (saved.locale as UILocale) : fallback.locale,
      currency: CURRENCIES.some((c) => c.id === saved.currency) ? (saved.currency as CurrencyCode) : fallback.currency,
    };
  } catch {
    return fallback;
  }
}
