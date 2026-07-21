import { type Zone, zone } from "./Zone.js";

/** The side a team plays from, which sets its attacking direction. */
export type TeamSide = "home" | "away";

/**
 * Geometry helper for the zone grid. Encapsulates directions and key areas so
 * the rest of the engine reasons in terms of "own third" / "attacking third" /
 * "central lane" regardless of the grid's resolution — the grid can be made
 * finer without touching decision/positioning logic.
 *
 * Default resolution: 5 vertical bands × 5 horizontal lanes (25 zones), with a
 * true central band and lane. Lanes: 0 = left touchline … 4 = right touchline;
 * 1 and 3 are the half-spaces; 2 is central.
 */
export class PitchGrid {
  readonly thirds: number;
  readonly lanes: number;

  constructor(thirds = 5, lanes = 5) {
    this.thirds = thirds;
    this.lanes = lanes;
  }

  /** The central lane index. */
  get centerLane(): number {
    return Math.floor(this.lanes / 2);
  }

  /** The central band index. */
  get centerThird(): number {
    return Math.floor(this.thirds / 2);
  }

  /** Absolute band the given side attacks towards. */
  attackingThird(side: TeamSide): number {
    return side === "home" ? this.thirds - 1 : 0;
  }

  /** Absolute band of the given side's own goal. */
  ownThird(side: TeamSide): number {
    return side === "home" ? 0 : this.thirds - 1;
  }

  /** +1 for home (advances toward higher bands), -1 for away. */
  direction(side: TeamSide): number {
    return side === "home" ? 1 : -1;
  }

  clampThird(third: number): number {
    return Math.min(this.thirds - 1, Math.max(0, third));
  }

  clampLane(lane: number): number {
    return Math.min(this.lanes - 1, Math.max(0, lane));
  }

  /** How far advanced (0..1) a zone is from a side's perspective. */
  advancement(side: TeamSide, z: Zone): number {
    const own = this.ownThird(side);
    return Math.abs(z.third - own) / (this.thirds - 1);
  }

  /** The final-third-ish attacking area (advancement ≥ 0.6). */
  isFinalThird(side: TeamSide, z: Zone): boolean {
    return this.advancement(side, z) >= 0.6;
  }

  /** The penalty area: the deepest attacking band, central lane only. */
  isPenaltyArea(side: TeamSide, z: Zone): boolean {
    return z.third === this.attackingThird(side) && z.lane === this.centerLane;
  }

  center(): Zone {
    return zone(this.centerThird, this.centerLane);
  }
}
