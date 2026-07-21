import { type Catalog, type Locale } from "./Catalog.js";
import { enCatalog } from "./catalogs/en.js";
import { ptBrCatalog } from "./catalogs/ptBR.js";

export {
  type Catalog,
  type Locale,
  type RenderContext,
  type StatKey,
} from "./Catalog.js";

const CATALOGS: Record<Locale, Catalog> = {
  en: enCatalog,
  "pt-BR": ptBrCatalog,
};

/** All supported locales. */
export const SUPPORTED_LOCALES: readonly Locale[] = ["en", "pt-BR"];

export function isLocale(value: string): value is Locale {
  return value === "en" || value === "pt-BR";
}

/** Get the catalog for a locale (falls back to English). */
export function getCatalog(locale: Locale): Catalog {
  return CATALOGS[locale] ?? enCatalog;
}
