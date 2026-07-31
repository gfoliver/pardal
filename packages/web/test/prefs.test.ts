import { describe, expect, it } from "vitest";
import { browserCurrency, browserLocale, defaultPrefs, preferredTags, readPrefs, regionOf } from "../src/lib/prefs";

/**
 * Where the app's language and currency come from before anyone has chosen.
 *
 * Every helper takes its tags as an argument, so these are ordinary function tests — no
 * navigator stubbing, no module re-import games, and the same code paths the provider uses.
 */

describe("browserLocale", () => {
  it("takes Portuguese from a Brazilian browser and English from a US one", () => {
    expect(browserLocale(["pt-BR", "pt", "en-US"])).toBe("pt-BR");
    expect(browserLocale(["en-US", "en"])).toBe("en");
  });

  /** The reason the whole list is walked instead of just `navigator.language`. */
  it("falls through a language we do not ship to the next one asked for", () => {
    expect(browserLocale(["de-DE", "pt-BR", "en"])).toBe("pt-BR");
    expect(browserLocale(["ja-JP", "en-GB"])).toBe("en");
  });

  it("ends up in English when nothing on the list is ours", () => {
    expect(browserLocale(["ja-JP", "ko-KR"])).toBe("en");
    expect(browserLocale([])).toBe("en");
  });

  it("does not care about case or a missing region", () => {
    expect(browserLocale(["PT"])).toBe("pt-BR");
    expect(browserLocale(["EN-gb"])).toBe("en");
  });
});

describe("regionOf", () => {
  it("reads the country, not the language", () => {
    expect(regionOf("pt-BR")).toBe("BR");
    expect(regionOf("pt-PT")).toBe("PT");
    expect(regionOf("en-US")).toBe("US");
  });

  it("copes with a script subtag in the middle", () => {
    expect(regionOf("zh-Hant-TW")).toBe("TW");
  });

  it("has nothing to say about a bare language, and does not throw on nonsense", () => {
    expect(regionOf("en")).toBeUndefined();
    expect(() => regionOf("!!!")).not.toThrow();
  });
});

describe("browserCurrency", () => {
  it("gives Brazil reais, the eurozone euros, and everyone else dollars", () => {
    expect(browserCurrency(["pt-BR"])).toBe("BRL");
    expect(browserCurrency(["pt-PT"])).toBe("EUR");
    expect(browserCurrency(["de-DE"])).toBe("EUR");
    expect(browserCurrency(["en-US"])).toBe("USD");
    expect(browserCurrency(["ja-JP"])).toBe("USD");
  });

  /** Portuguese is spoken in two places that do not share a currency. */
  it("separates language from money", () => {
    expect(browserLocale(["pt-PT"])).toBe("pt-BR"); // the only Portuguese we ship
    expect(browserCurrency(["pt-PT"])).toBe("EUR"); // but Portugal spends euros
  });

  it("skips tags that name no country and decides on the first that does", () => {
    expect(browserCurrency(["en", "pt-BR"])).toBe("BRL");
    expect(browserCurrency(["en", "de-DE"])).toBe("EUR");
  });

  /**
   * BRL, not a "neutral" USD: the datasets are BRL-denominated, so it is the one currency
   * shown without going through an approximate static rate.
   */
  it("shows the untouched numbers when it cannot tell where we are", () => {
    expect(browserCurrency([])).toBe("BRL");
    expect(browserCurrency(["en"])).toBe("BRL");
  });
});

describe("readPrefs", () => {
  const browser = defaultPrefs(["pt-BR"]);

  it("uses the browser's settings on a first run", () => {
    expect(readPrefs(null, browser)).toEqual(browser);
    expect(browser.locale).toBe("pt-BR");
    expect(browser.currency).toBe("BRL");
  });

  it("prefers what the user chose over what the browser says", () => {
    const stored = JSON.stringify({ theme: "light", mode: "advanced", locale: "en", currency: "EUR" });
    expect(readPrefs(stored, browser)).toEqual({ theme: "light", mode: "advanced", locale: "en", currency: "EUR" });
  });

  /**
   * The bug this guards. `{ ...fallback, ...JSON.parse(raw) }` accepted anything, so a
   * locale we no longer ship left `UI_STRINGS[locale]` undefined and made every `t.*` read
   * throw — on a screen with no way back to change it.
   */
  it("drops a value this build does not support, and keeps the rest", () => {
    const stored = JSON.stringify({ theme: "light", locale: "de", currency: "JPY", mode: "wat" });
    expect(readPrefs(stored, browser)).toEqual({
      theme: "light", // still honoured
      mode: browser.mode,
      locale: browser.locale,
      currency: browser.currency,
    });
  });

  it("survives junk in storage", () => {
    expect(readPrefs("not json", browser)).toEqual(browser);
    expect(readPrefs("null", browser)).toEqual(browser);
    expect(readPrefs("[]", browser)).toEqual(browser);
  });
});

describe("preferredTags", () => {
  it("prefers the list, falls back to the single language, and tolerates neither", () => {
    expect(preferredTags({ languages: ["pt-BR", "en"], language: "en" })).toEqual(["pt-BR", "en"]);
    expect(preferredTags({ languages: [], language: "en-GB" })).toEqual(["en-GB"]);
    expect(preferredTags({})).toEqual([]);
  });

  /**
   * Omitting the argument reads the ambient navigator, and there may not be one — the
   * module is imported by code that also runs under Node in tests.
   */
  it("does not throw when there is no navigator to read", () => {
    expect(() => preferredTags()).not.toThrow();
    expect(Array.isArray(preferredTags())).toBe(true);
  });
});
