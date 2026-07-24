import type { CoachData } from "@fut/competition";
import type { Formation, Mentality } from "@fut/domain";
import type { BoardObjectives } from "./BoardObjectives.js";
import type { Finance } from "./Finance.js";

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
  divisionId: string;
  squad: Squad;
  finance: Finance;
  /** Default tactical setup (mentality + formation); per-match overrides allowed. */
  formation: Formation;
  mentality: Mentality;
  objectives: BoardObjectives;
  /** 1..100 — drives transfer AI interest and market value. */
  reputation: number;
}
