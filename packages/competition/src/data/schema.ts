import {
  type CoachAttributes,
  type GoalkeepingAttributes,
  type Mentality,
  type MentalAttributes,
  type PhysicalAttributes,
  type TechnicalAttributes,
} from "@fut/domain";

/**
 * Plain, JSON-serializable data shapes for teams/players/coaches. These are the
 * on-disk (or over-the-wire) format; the loader maps them to domain objects.
 */

export interface PlayerData {
  readonly id: string;
  readonly name: string;
  readonly age: number;
  readonly nationality: string;
  /** Detailed position string (must match a `Position` value). */
  readonly position: string;
  /** Positions the player knows; defaults to just `position`. */
  readonly naturalPositions?: readonly string[];
  readonly physical: PhysicalAttributes;
  readonly mental: MentalAttributes;
  readonly technical: TechnicalAttributes;
  /** Required only for goalkeepers. */
  readonly goalkeeping?: GoalkeepingAttributes;
  /**
   * REAL market value from the dataset, in the dataset's currency (integer).
   * When present the career anchors valuation/wages to it instead of deriving a
   * value from attributes — so a €8M player is worth €8M, not a guess.
   */
  readonly marketValue?: number;
}

export interface CoachData {
  readonly id: string;
  readonly name: string;
  readonly age: number;
  readonly nationality: string;
  readonly attributes: CoachAttributes;
}

export interface TeamData {
  readonly id: string;
  readonly name: string;
  readonly shortName: string;
  /** Optional team mentality (defaults to balanced). */
  readonly mentality?: Mentality;
  readonly coach: CoachData;
  /** Squad; the first 11 are the starting XI, the rest are the bench. */
  readonly players: readonly PlayerData[];
}

export interface LeagueData {
  readonly id: string;
  readonly name: string;
  readonly teams: readonly TeamData[];
}
