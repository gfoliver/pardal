import { useMemo } from "react";
import { useApp } from "../app/AppProviders";
import type { UILocale } from "../i18n/strings";
import { convert, currencySymbol, type CurrencyCode } from "./currency";

/**
 * The canonical currency money is STORED in (dataset + save). Our datasets are
 * BRL-denominated (Transfermarkt EUR values are converted at assemble time), and
 * the wage/fee scales are calibrated in BRL. The UI converts this base into the
 * user's chosen display currency — the engine never sees a converted number.
 */
export const BASE_CURRENCY: CurrencyCode = "BRL";

/** Replace `{name}` tokens in a template with params (numbers/strings). */
export function interpolate(template: string, params: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in params ? String(params[k]) : `{${k}}`));
}

/** Pick a plural form via Intl.PluralRules (EN/PT-BR need one/other). */
export function plural(locale: UILocale, n: number, forms: { one: string; other: string }): string {
  const rule = new Intl.PluralRules(locale).select(n);
  return interpolate(rule === "one" ? forms.one : forms.other, { n });
}

export interface Formatter {
  /** Format a BASE-currency amount in the user's display currency. */
  money: (v: number, opts?: { compact?: boolean }) => string;
  /** Base → display units (for editable money inputs). */
  toDisplay: (base: number) => number;
  /** Display → base units (what gets stored). */
  toBase: (display: number) => number;
  /** Symbol of the display currency. */
  currencySymbol: string;
  number: (v: number) => string;
  ordinal: (n: number) => string;
  /** Render an integer season/day date as a readable label. */
  seasonDate: (d: { season: number; dayOfSeason: number }) => string;
  /**
   * A real Gregorian date, in one of three widths.
   *
   * `short` (the default) is "08 de ago. de 2026" — readable, and about 103px. `long` adds the weekday,
   * for a page header where the date is the subject. `numeric` is "08/08/2026" and exists because a
   * DENSE LIST cannot afford the other two: in the mailbox the spelled-out month took a third of a
   * 341px row, and the container's `overflow-y-auto` had silently forced `overflow-x` to `auto`, so
   * instead of truncating, the list scrolled sideways.
   *
   * The field ORDER is the locale's, via `Intl` — pt-BR yields dd/mm/yyyy, and hard-coding that would
   * be wrong for the English build rather than more correct.
   */
  civil: (c: { year: number; month: number; day: number }, opts?: { style?: "numeric" | "short" | "long" }) => string;
  t: (template: string, params?: Record<string, string | number>) => string;
  plural: (n: number, forms: { one: string; other: string }) => string;
  /**
   * A span of days as years and months — "2a 3m", "8m", "12d".
   *
   * Nobody reads a contract as "266 days left". Days survive only under a month, where
   * they are the unit that actually carries meaning (and where a deal is about to lapse,
   * so precision is the point).
   *
   * `daysPerYear` is the CALLER's year, because the game's is not the Gregorian one: a season
   * runs `state.totalDays` days (280 in the Brasileirão) and contracts, ageing and expiry are
   * all counted in seasons. Dividing by 365 made every deal read about a quarter shorter than
   * the one that was agreed — a three-year signing showed up as "2a 3m", which looks exactly
   * like the duration you chose having been ignored.
   */
  duration: (days: number, daysPerYear?: number) => string;
}

/** Only a fallback: callers who know the game's season length pass it instead. */
const DAYS_PER_YEAR = 365;

/**
 * Split a span of days into whole years, months and days.
 *
 * `perYear` is the caller's year, and getting it wrong is the whole reason this is a named,
 * separately-tested function: contracts run in SEASONS (280 days in the Brasileirão) and dividing
 * them by a Gregorian 365 made every deal read about a quarter shorter than it was agreed for — a
 * four-year signing came out as "3a 0m", which is indistinguishable from the term being ignored.
 *
 * A month is a twelfth of that same year rather than a flat 30 days, so the parts add back up.
 */
export function splitDuration(days: number, perYear: number = DAYS_PER_YEAR): { years: number; months: number; days: number } {
  const total = Math.max(0, Math.round(days));
  const year = perYear > 0 ? perYear : DAYS_PER_YEAR;
  const month = year / 12;
  if (total < month) return { years: 0, months: 0, days: total };
  const years = Math.floor(total / year);
  const months = Math.round((total - years * year) / month);
  // Twelve months rounded up is a year, not "1a 12m".
  return months >= 12 ? { years: years + 1, months: 0, days: 0 } : { years, months, days: 0 };
}

/** Locale-aware formatting bound to the app's locale + display currency. */
export function useFormat(): Formatter {
  const { locale, currency, t } = useApp();
  return useMemo(() => {
    const toDisplay = (base: number) => convert(base, BASE_CURRENCY, currency);
    const toBase = (display: number) => Math.round(convert(display, currency, BASE_CURRENCY));
    const money = (v: number, opts?: { compact?: boolean }) => {
      const shown = toDisplay(v);
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        notation: opts?.compact ?? Math.abs(shown) >= 100_000 ? "compact" : "standard",
        maximumFractionDigits: opts?.compact ?? Math.abs(shown) >= 100_000 ? 1 : 0,
      }).format(shown);
    };
    const number = (v: number) => new Intl.NumberFormat(locale).format(v);
    const ordinal = (n: number) => {
      if (locale === "pt-BR") return `${n}º`;
      const s = ["th", "st", "nd", "rd"];
      const v = n % 100;
      return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
    };
    const seasonDate = (d: { season: number; dayOfSeason: number }) =>
      locale === "pt-BR" ? `T${d.season + 1} · dia ${d.dayOfSeason + 1}` : `S${d.season + 1} · day ${d.dayOfSeason + 1}`;
    const civil = (
      c: { year: number; month: number; day: number },
      opts?: { style?: "numeric" | "short" | "long" },
    ) => {
      const style = opts?.style ?? "short";
      return new Intl.DateTimeFormat(locale, {
        weekday: style === "long" ? "long" : undefined,
        day: "2-digit",
        month: style === "long" ? "long" : style === "numeric" ? "2-digit" : "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(Date.UTC(c.year, c.month - 1, c.day)));
    };
    const duration = (days: number, daysPerYear = DAYS_PER_YEAR) => {
      const { years: y, months: m, days: d } = splitDuration(days, daysPerYear);
      if (y === 0 && m === 0) return interpolate(t.daysShort, { n: d });
      if (y === 0) return interpolate(t.monthsShort, { n: m });
      return m === 0 ? interpolate(t.yearsShort, { n: y }) : `${interpolate(t.yearsShort, { n: y })} ${interpolate(t.monthsShort, { n: m })}`;
    };
    return {
      money,
      toDisplay,
      toBase,
      currencySymbol: currencySymbol(currency),
      number,
      ordinal,
      seasonDate,
      civil,
      t: (template, params) => interpolate(template, params),
      plural: (n, forms) => plural(locale, n, forms),
      duration,
    };
  }, [locale, currency, t]);
}
