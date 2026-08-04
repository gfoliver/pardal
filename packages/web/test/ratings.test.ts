import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tierColor, tierOf, tierTint, type Tier } from "../src/lib/ratings";

/**
 * The rating scale has to survive a theme switch.
 *
 * These colours are the most repeated thing in the app — every overall badge, attribute cell,
 * positional fit and match rating reads from them — and they used to be five hex literals in this
 * module, used in both themes. Measured as TEXT on their own tint over a light card, the five came
 * out at 1.49–2.64:1: the badges were decorative rather than readable, and no theme could fix it
 * because the values lived in TypeScript.
 *
 * The fix splits each tier in two — a vivid `-fill` for the tint that carries the hue, and a darker
 * ink for the digits drawn on it — so light theme can darken the ink alone and keep the colour
 * coding. That split is the invariant worth pinning: swapping the two, or reverting either to a
 * literal, silently restores the unreadable version.
 */

const TIERS: Tier[] = ["elite", "good", "solid", "weak", "poor"];

describe("the rating tier scale", () => {
  it("puts each boundary exactly where the label changes", () => {
    expect(tierOf(85)).toBe("elite");
    expect(tierOf(84)).toBe("good");
    expect(tierOf(78)).toBe("good");
    expect(tierOf(77)).toBe("solid");
    expect(tierOf(70)).toBe("solid");
    expect(tierOf(69)).toBe("weak");
    expect(tierOf(60)).toBe("weak");
    expect(tierOf(59)).toBe("poor");
    // The domain is 1-99, but a fit or a match rating can be scaled into range oddly.
    expect(tierOf(0)).toBe("poor");
    expect(tierOf(99)).toBe("elite");
  });

  it("resolves colours through tokens, never a literal", () => {
    for (const t of TIERS) {
      const mid = { elite: 90, good: 80, solid: 74, weak: 64, poor: 40 }[t];
      expect(tierColor(mid)).toBe(`var(--tier-${t})`);
      expect(tierColor(mid)).not.toMatch(/#|rgb/);
    }
  });

  it("tints from the vivid fill and inks from the dark token", () => {
    // The whole point of two tokens: if the tint reached for the ink instead, light theme would be
    // a dark smear behind dark digits.
    expect(tierTint(90)).toContain("var(--tier-elite-fill)");
    expect(tierTint(90)).not.toContain("var(--tier-elite)");
    expect(tierColor(90)).toBe("var(--tier-elite)");
    expect(tierTint(40, 55)).toBe("color-mix(in srgb, var(--tier-poor-fill) 55%, transparent)");
  });
});

describe("the tokens those functions name", () => {
  const css = readFileSync(new URL("../src/styles/globals.css", import.meta.url), "utf8");

  it("declares an ink and a fill for every tier, in both themes", () => {
    for (const t of TIERS) {
      // Two declarations each: one in the dark block, one in the light block.
      expect(css.match(new RegExp(`--tier-${t}:`, "g")), t).toHaveLength(2);
      expect(css.match(new RegExp(`--tier-${t}-fill:`, "g")), t).toHaveLength(2);
    }
  });

  it("keeps light theme's ink darker than the fill it sits on", () => {
    // A cheap stand-in for the contrast measurement: the light-theme ink of every tier must be a
    // darker colour than the dark-theme value it replaced, or we are back where we started.
    const light = css.slice(css.indexOf('[data-theme="light"]'));
    for (const t of TIERS) {
      const ink = light.match(new RegExp(`--tier-${t}: (#[0-9a-f]{6});`))?.[1];
      const fill = light.match(new RegExp(`--tier-${t}-fill: (#[0-9a-f]{6});`))?.[1];
      expect(ink, `${t} ink`).toBeDefined();
      expect(fill, `${t} fill`).toBeDefined();
      expect(sum(ink!), `${t} ink is darker than its fill`).toBeLessThan(sum(fill!));
    }
  });
});

/** Channel sum — enough to order two shades of one hue by lightness. */
function sum(hex: string): number {
  return [1, 3, 5].reduce((n, i) => n + parseInt(hex.slice(i, i + 2), 16), 0);
}
