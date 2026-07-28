import {
  type MentalAttributes,
  type PhysicalAttributes,
  type TechnicalAttributes,
} from "./attributes.js";
import { positionOverall } from "./overall.js";
import { Person } from "./Person.js";
import { Position } from "./types.js";

/** Attribute multiplier applied when a player is fielded out of position. */
export const OUT_OF_POSITION_FACTOR = 0.85;

export interface PlayerInit {
  readonly id: string;
  readonly name: string;
  readonly age: number;
  readonly nationality: string;
  readonly position: Position;
  /** Positions the player knows (defaults to just the primary position). */
  readonly naturalPositions?: readonly Position[];
  readonly physical: PhysicalAttributes;
  readonly mental: MentalAttributes;
  readonly technical: TechnicalAttributes;
  /**
   * Squad number. Presentation only — no resolver reads it — but it belongs to
   * the player rather than to the screen, because the alternative (numbering the
   * XI 1..11 by position at render time) puts a different number on a man's back
   * every time the lineup changes.
   */
  readonly shirtNumber?: number;
}

/**
 * An outfield player. Carries base attributes that the engine reads; the
 * dynamic per-match state (fatigue, booking status) lives in `MatchState`.
 * A player may be versatile (know several positions); playing outside those
 * incurs a small attribute debuff (see `familiarity`).
 */
export class Player extends Person {
  public readonly position: Position;
  public readonly naturalPositions: readonly Position[];
  public readonly physical: PhysicalAttributes;
  public readonly mental: MentalAttributes;
  public readonly technical: TechnicalAttributes;
  public readonly shirtNumber?: number;

  constructor(init: PlayerInit) {
    super(init.id, init.name, init.age, init.nationality);
    this.position = init.position;
    this.naturalPositions = init.naturalPositions ?? [init.position];
    this.physical = init.physical;
    this.mental = init.mental;
    this.technical = init.technical;
    this.shirtNumber = init.shirtNumber;
  }

  /** Whether the player knows how to play a position (no debuff). */
  canPlay(position: Position): boolean {
    return this.naturalPositions.includes(position);
  }

  /** Attribute multiplier at a position: 1 if natural, debuffed otherwise. */
  familiarity(position: Position): number {
    return this.canPlay(position) ? 1 : OUT_OF_POSITION_FACTOR;
  }

  /**
   * Position-weighted overall. Defaults to the primary position; pass a
   * position to evaluate the player there (with the out-of-position debuff).
   */
  overall(position: Position = this.position): number {
    return positionOverall(this, position) * this.familiarity(position);
  }

  isGoalkeeper(): boolean {
    return this.position === Position.Goalkeeper;
  }
}
