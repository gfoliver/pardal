import type { SeasonDate } from "../time.js";

/**
 * The scouting department: what it is currently watching, what it has been asked to watch next, and
 * what it has learned.
 *
 * Modelled as abstract CAPACITY rather than named scouts — the decision the
 * manager actually makes is "who is worth watching, given I can only watch a
 * few", and that survives without a staff subsystem behind it.
 */
export interface ScoutingState {
  assignments: ScoutAssignment[];
  /**
   * Players asked for while every scout was out, in the order they were asked for.
   *
   * The capacity is NOT stored beside them, and used to be. It is derived from the club's reputation,
   * so a stored copy is a second answer to a question that already has one — and one that a career in
   * progress would keep giving after the rule behind it changed.
   */
  queue: string[];
  /** playerId → what we have learned about him. */
  knowledge: Record<string, PlayerKnowledge>;
}

/** One player under observation. */
export interface ScoutAssignment {
  readonly id: string;
  readonly playerId: string;
  readonly startedOn: SeasonDate;
  /** Absolute day (see `time/tickDay`) the report is due to land. */
  readonly dueDay: number;
  /** Confidence the report will add when it does. */
  readonly gain: number;
}

export interface PlayerKnowledge {
  /** 0-100. Drives every estimate's width — see `scouting/knowledge.ts`. */
  confidence: number;
  /** How many reports have been filed on him. */
  reports: number;
  lastReportOn?: SeasonDate;
}

export function emptyScouting(): ScoutingState {
  return { assignments: [], queue: [], knowledge: {} };
}
