import type {
  CoachAttributes,
  GoalkeepingAttributes,
  MentalAttributes,
  PhysicalAttributes,
  Position,
  TechnicalAttributes,
} from "@fut/domain";
import { digest, HashDomain } from "./hash.js";

/**
 * The squad data a match record's ids resolve against — a PROJECTION of the dataset,
 * containing what the simulation and its report read and nothing else.
 *
 * The projection is the point. The dataset's player record also carries a portrait
 * URL, a market value and a squad number, and none of the three changes a match. Had
 * the roster hash covered them, moving portraits to a different CDN would invalidate
 * every stored replay in the game, and renumbering a squad would look like tampering.
 * Presentation data travels alongside a match and is never hashed.
 *
 * Names ARE included, and not for display: match events carry `playerName`, so a name
 * is part of the report that attesters compare.
 */
export interface RosterPlayer {
  readonly id: string;
  readonly name: string;
  readonly age: number;
  readonly nationality: string;
  readonly position: Position;
  /** Positions the player knows. Absent means only their primary one. */
  readonly naturalPositions?: readonly Position[];
  readonly physical: PhysicalAttributes;
  readonly mental: MentalAttributes;
  readonly technical: TechnicalAttributes;
  /** Present exactly when `position` is goalkeeper. */
  readonly goalkeeping?: GoalkeepingAttributes;
}

export interface RosterCoach {
  readonly id: string;
  readonly name: string;
  readonly age: number;
  readonly nationality: string;
  readonly attributes: CoachAttributes;
}

/** One club's squad as a match will read it. */
export interface RosterClub {
  readonly clubId: string;
  readonly name: string;
  readonly shortName: string;
  readonly coach: RosterCoach;
  readonly players: readonly RosterPlayer[];
}

/** The squads a fixture is played with. */
export interface RosterSnapshot {
  readonly home: RosterClub;
  readonly away: RosterClub;
}

/**
 * Hash of the squads, so a record cannot be replayed against different players.
 *
 * Without this a transfer, a development point or an attribute correction landing
 * between a match and a later replay changes the result with nothing to point at. The
 * players are hashed in the order they appear, because that order is itself an input:
 * a squad list is not a set.
 */
export function rosterSnapshotHash(snapshot: RosterSnapshot): Promise<string> {
  return digest(HashDomain.RosterSnapshot, snapshot as unknown);
}
