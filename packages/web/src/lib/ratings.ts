// Shared rating/attribute colour logic so overalls and attribute cells read as
// one consistent scale across the app (Football-Manager-style shading).
//
// The colours themselves live in `styles/globals.css` as `--tier-*`, because the
// scale has to be themeable: the bright dark-theme values used as text on a light
// card measured 1.5–2.6:1, i.e. unreadable. Each tier is two tokens — the bare
// name is the INK, `-fill` is the hue used for tints — and light theme darkens
// only the ink, so the colour coding survives the theme switch.

export type Tier = "elite" | "good" | "solid" | "weak" | "poor";

export function tierOf(v: number): Tier {
  if (v >= 85) return "elite";
  if (v >= 78) return "good";
  if (v >= 70) return "solid";
  if (v >= 60) return "weak";
  return "poor";
}

/** The ink for a value — readable on the surface, and on its own tint. */
export function tierColor(v: number): string {
  return `var(--tier-${tierOf(v)})`;
}

/** Faint background tint for an attribute cell (cohesive, not glaring). */
export function tierTint(v: number, pct = 15): string {
  return `color-mix(in srgb, var(--tier-${tierOf(v)}-fill) ${pct}%, transparent)`;
}
