import { useMemo } from "react";
import { useApp } from "../app/AppProviders";
import type { UILocale } from "../i18n/strings";

const CURRENCY_BY_LOCALE: Record<UILocale, string> = { en: "USD", "pt-BR": "BRL" };

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
  money: (v: number, opts?: { compact?: boolean; currency?: string }) => string;
  number: (v: number) => string;
  ordinal: (n: number) => string;
  /** Render an integer season/day date as a readable label. */
  seasonDate: (d: { season: number; dayOfSeason: number }) => string;
  /** Real Gregorian date, e.g. "8 Aug 2026". */
  civil: (c: { year: number; month: number; day: number }, opts?: { long?: boolean }) => string;
  t: (template: string, params?: Record<string, string | number>) => string;
  plural: (n: number, forms: { one: string; other: string }) => string;
}

/** Locale-aware formatting bound to the app's current locale. */
export function useFormat(): Formatter {
  const { locale } = useApp();
  return useMemo(() => {
    const money = (v: number, opts?: { compact?: boolean; currency?: string }) =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: opts?.currency ?? CURRENCY_BY_LOCALE[locale],
        notation: opts?.compact ?? Math.abs(v) >= 100_000 ? "compact" : "standard",
        maximumFractionDigits: opts?.compact ?? Math.abs(v) >= 100_000 ? 1 : 0,
      }).format(v);
    const number = (v: number) => new Intl.NumberFormat(locale).format(v);
    const ordinal = (n: number) => {
      if (locale === "pt-BR") return `${n}º`;
      const s = ["th", "st", "nd", "rd"];
      const v = n % 100;
      return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
    };
    const seasonDate = (d: { season: number; dayOfSeason: number }) =>
      locale === "pt-BR" ? `T${d.season + 1} · dia ${d.dayOfSeason + 1}` : `S${d.season + 1} · day ${d.dayOfSeason + 1}`;
    const civil = (c: { year: number; month: number; day: number }, opts?: { long?: boolean }) =>
      new Intl.DateTimeFormat(locale, {
        weekday: opts?.long ? "long" : undefined,
        day: "2-digit",
        month: opts?.long ? "long" : "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(Date.UTC(c.year, c.month - 1, c.day)));
    return {
      money,
      number,
      ordinal,
      seasonDate,
      civil,
      t: (template, params) => interpolate(template, params),
      plural: (n, forms) => plural(locale, n, forms),
    };
  }, [locale]);
}
