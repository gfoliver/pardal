import type { SeasonDate } from "../time.js";

/**
 * The scouting department: a budget of attention, what it is currently spending
 * it on, and what it has learned.
 *
 * Modelled as abstract CAPACITY rather than named scouts — the decision the
 * manager actually makes is "who is worth watching, given I can only watch a
 * few", and that survives without a staff subsystem behind it.
 */
export interface ScoutingState {
  /** How many players can be under observation at once. */
  capacity: number;
  assignments: ScoutAssignment[];
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

export function emptyScouting(capacity: number): ScoutingState {
  return { capacity, assignments: [], knowledge: {} };
}
