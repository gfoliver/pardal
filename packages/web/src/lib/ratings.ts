// Shared rating/attribute colour logic so overalls and attribute cells read as
// one consistent scale across the app (Football-Manager-style shading).

export type Tier = "elite" | "good" | "solid" | "weak" | "poor";

export function tierOf(v: number): Tier {
  if (v >= 85) return "elite";
  if (v >= 78) return "good";
  if (v >= 70) return "solid";
  if (v >= 60) return "weak";
  return "poor";
}

const COLOR: Record<Tier, string> = {
  elite: "#16d497",
  good: "#8fd14f",
  solid: "#f6c445",
  weak: "#f0934e",
  poor: "#e5677a",
};

export function tierColor(v: number): string {
  return COLOR[tierOf(v)];
}

/** Faint background tint for an attribute cell (cohesive, not glaring). */
export function tierTint(v: number, pct = 15): string {
  return `color-mix(in srgb, ${tierColor(v)} ${pct}%, transparent)`;
}
