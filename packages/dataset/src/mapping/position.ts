import { Position } from "@fut/domain";

/**
 * Map a source position label (Transfermarkt-style, e.g. "Left-Back",
 * "Defensive Midfield", "Centre-Forward") to a domain `Position`. Tolerant:
 * lower-cases, strips side prefixes (left/right/centre), and falls back to a
 * sensible default per family so an unexpected label never breaks a build.
 */
export function toDomainPosition(raw: string): Position {
  const s = raw.trim().toLowerCase();
  if (s.includes("keeper") || s === "gk") return Position.Goalkeeper;

  // Forwards
  if (s.includes("winger")) return Position.Winger;
  if (s.includes("striker") || s.includes("forward") || s === "cf" || s === "st") return Position.Striker;

  // Midfield
  if (s.includes("attacking mid") || s === "am") return Position.AttackingMidfielder;
  if (s.includes("defensive mid") || s === "dm") return Position.DefensiveMidfielder;
  if (s.includes("midfield") || s === "cm" || s === "mid") return Position.CentralMidfielder;

  // Defence
  if (s.includes("wing-back") || s.includes("wing back") || s === "wb") return Position.WingBack;
  if (s.includes("full-back") || s.includes("full back") || s.includes("left-back") || s.includes("right-back") || s === "lb" || s === "rb" || s === "fb")
    return Position.FullBack;
  if (s.includes("back") || s.includes("defen") || s === "cb") return Position.CentreBack;

  return Position.CentralMidfielder;
}
