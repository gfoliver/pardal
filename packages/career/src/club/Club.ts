import type { PositionGroup } from "@fut/domain";
import type { ClubKits, CoachData } from "@fut/competition";
import type { BoardObjectives } from "./BoardObjectives.js";
import type { Finance } from "./Finance.js";
import type { SavedTactic } from "../tactics/StoredTactics.js";

/**
 * A club's squad: the full pool of contracted players (by id) plus its coach.
 * Match-day XI selection is derived on demand, not stored here.
 */
export interface Squad {
  readonly clubId: string;
  playerIds: string[];
  readonly coach: CoachData;
}

/**
 * A persistent club — the career-world entity a `domain.Team` is BUILT FROM per
 * match (squad + selected XI + PlayerDev deltas). Distinct from the per-match
 * `Team`, which the domain intentionally keeps thin.
 */
export interface Club {
  readonly id: string;
  readonly name: string;
  readonly shortName: string;
  /** Common display name ("Vasco") — preferred over `name` in lists/headers. */
  readonly nickname?: string;
  divisionId: string;
  squad: Squad;
  finance: Finance;
  /**
   * The club's saved tactical setups (formation, mentality, XI, roles,
   * instructions each) — a manager can keep several and switch between them.
   * Always non-empty once migrated in; see `activeTactic`.
   */
  tacticSlots: SavedTactic[];
  /** Which of `tacticSlots` the club actually plays with. */
  activeTacticId: string;
  objectives: BoardObjectives;
  /** 1..100 — drives transfer AI interest and market value. */
  reputation: number;
  // Optional real-world metadata (populated from a dataset's world.json).
  readonly country?: string;
  readonly city?: string;
  readonly stadium?: string;
  readonly capacity?: number;
  readonly founded?: number;
  readonly colours?: readonly string[];
  /** Club crest as a data URI (from the dataset world). */
  readonly crest?: string;
  /** Kit 1 / kit 2 colours (from the dataset world). */
  readonly kits?: ClubKits;
  /**
   * Lines this club is trying to REPLACE, oldest first, because it lost someone who mattered there.
   *
   * The AI market had no memory. It picked the line it was thinnest or weakest in and shopped there,
   * so a club that had just sold its starting striker was no likelier to buy a striker than anyone
   * else — it simply became a club whose worst attacker was now slightly better, and the squad quietly
   * hollowed out one sale at a time. This is the memory: a departure that costs real quality writes the
   * line down, and the next window spends on that before it goes bargain-hunting.
   *
   * Optional, so a save written before this loads with no pending replacements — which is the truth
   * about it, not a default standing in for one.
   */
  replacing?: PositionGroup[];
}

/** The tactic a club actually plays with. Falls back to the first slot if `activeTacticId` ever dangles. */
export function activeTactic(club: Club): SavedTactic {
  return club.tacticSlots.find((t) => t.id === club.activeTacticId) ?? club.tacticSlots[0]!;
}
