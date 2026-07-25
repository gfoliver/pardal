import type { ClubKit, ClubKits } from "@fut/competition";

/**
 * Kit selection for a match, the way real fixtures work: the HOME side wears its
 * first kit, and the AWAY side wears whichever of its kits is easiest to tell
 * apart from it. Purely visual — nothing here reaches the engine.
 */

const FALLBACK_HOME: ClubKit = { primary: "#2E7D5B", secondary: "#1B4B38", detail: "#FFFFFF", pattern: "solid" };
const FALLBACK_AWAY: ClubKit = { primary: "#B23A3A", secondary: "#7A2626", detail: "#FFFFFF", pattern: "solid" };

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function rgb(hex: string): Rgb {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { r: 128, g: 128, b: 128 };
  const n = parseInt(m[1]!, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const luminance = ({ r, g, b }: Rgb) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

/**
 * How distinguishable two kit colours are, 0..1. Combines hue/RGB distance with
 * a brightness term, because on a small pitch marker brightness separates teams
 * even more than hue (a dark navy vs black clash even though the hues differ).
 */
export function kitContrast(a: string, b: string): number {
  const x = rgb(a);
  const y = rgb(b);
  const dist = Math.sqrt((x.r - y.r) ** 2 + (x.g - y.g) ** 2 + (x.b - y.b) ** 2) / 441.67;
  const bright = Math.abs(luminance(x) - luminance(y));
  return 0.55 * dist + 0.45 * bright;
}

/**
 * Home wears kit 1; away wears the kit that contrasts most with it. Ties (and
 * missing data) fall back to the away club's second kit, as a real away side
 * would default to.
 */
export function matchKits(homeKits?: ClubKits, awayKits?: ClubKits): { home: ClubKit; away: ClubKit } {
  const home = homeKits?.home ?? FALLBACK_HOME;
  if (!awayKits) return { home, away: FALLBACK_AWAY };
  const options: ClubKit[] = [awayKits.away, awayKits.home]; // second kit wins ties
  let best = options[0]!;
  let bestScore = -1;
  for (const kit of options) {
    const score = kitContrast(home.primary, kit.primary);
    if (score > bestScore) {
      bestScore = score;
      best = kit;
    }
  }
  return { home, away: best };
}

/** Legible ink for text drawn directly on a kit colour. */
export function inkOn(hex: string): string {
  return luminance(rgb(hex)) > 0.6 ? "#10151C" : "#FFFFFF";
}
