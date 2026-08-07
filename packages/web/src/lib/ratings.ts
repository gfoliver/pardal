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

/**
 * The ink for a value drawn on a DARK plate, whatever the theme.
 *
 * `tierColor` is the ink for the page: light theme darkens it to #006b50…#a92039 so it can be read on
 * a white card. On the near-black plates the pitch uses — a shirt marker over grass — that same ink
 * measures under 2:1 and the rating was effectively invisible in light mode. The `-fill` half of each
 * tier is the bright hue itself, which is identical in both themes and is what a dark plate needs.
 */
export function tierFill(v: number): string {
  return `var(--tier-${tierOf(v)}-fill)`;
}

/** Faint background tint for an attribute cell (cohesive, not glaring). */
export function tierTint(v: number, pct = 15): string {
  return `color-mix(in srgb, var(--tier-${tierOf(v)}-fill) ${pct}%, transparent)`;
}
