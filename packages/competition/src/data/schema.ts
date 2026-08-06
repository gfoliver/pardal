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
  /**
   * Portrait as a REMOTE URL, never embedded bytes — a league's worth of photos
   * is megabytes and this file ships with the app. Absent for most players; the
   * UI falls back to a single shared silhouette.
   */
  readonly photo?: string;
  /**
   * Squad number as registered with the competition, when the dataset has one.
   * Absent for a player the club hasn't numbered; a career can assign its own.
   */
  readonly shirtNumber?: number;
}

export interface CoachData {
  readonly id: string;
  /**
   * The head coach's IDENTITY, when a source publishes it — and none of ours does.
   *
   * All three were required, and the emitter filled them in: `${club.name} Coach` for the name, 50 for
   * the age, and the string "Brazil" for the nationality. That is three fabrications presented as
   * facts, and the last one becomes an outright error the moment a league outside Brazil is loaded.
   *
   * Checked before giving up on them: TheSportsDB's team record carries 64 fields and not one of them
   * is manager-related (`strManager` is gone from the v1 API); FMInside's `/staff` is a shell with none
   * of the filter-and-table machinery its player database uses, and its club pages name no manager. The
   * community Transfermarkt API might have one on `/clubs/{id}/profile` — that is untested here,
   * because it is a self-hosted service and it was not running.
   *
   * So they are optional, and absent means absent. `attributes` stays required: those are GENERATED on
   * purpose (see `inferCoach` — there is no coach statistic to derive them from) and the game needs
   * them to decide how the AI reacts during a match. A generated ability is a game mechanic; a
   * generated name is a lie about a person.
   */
  readonly name?: string;
  readonly age?: number;
  readonly nationality?: string;
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
