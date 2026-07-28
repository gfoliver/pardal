import { MAX_RIVAL_CONFIDENCE, OWN_PLAYER_CONFIDENCE } from "./knowledge.js";
import type { PlayerKnowledge, ScoutAssignment, ScoutingState } from "./types.js";
import type { SeasonDate } from "../time.js";

/**
 * Turning attention into knowledge, over time.
 *
 * Everything here is pure over the scouting slice — the resume logic that makes
 * a season-long observation survive a save/load is testable on fixtures rather
 * than trusted.
 */

/**
 * The observation ladder: each rung costs more and gives less.
 *
 * A first look is cheap and tells you roughly what kind of player he is; being
 * nearly sure takes most of a season. That shape is the whole point — if every
 * step cost the same, "scout everyone a bit" would dominate and the manager
 * would never have to choose. Ending at 90 is deliberate: see
 * {@link MAX_RIVAL_CONFIDENCE}.
 */
export const OBSERVATION_STEPS: readonly { readonly to: number; readonly days: number }[] = [
  { to: 30, days: 10 },
  { to: 60, days: 21 },
  { to: 90, days: 35 },
];

/** Scouting capacity a club of this reputation can field (2-4 simultaneous). */
export function capacityFor(reputation: number): number {
  return 2 + Math.min(2, Math.floor(reputation / 40));
}

/** The next rung above `confidence`, or undefined when there is nothing left to learn. */
export function nextStep(confidence: number): { to: number; days: number } | undefined {
  return OBSERVATION_STEPS.find((s) => s.to > confidence);
}

/** What we currently know. Our own players need no observation at all. */
export function confidenceOf(scouting: ScoutingState, playerId: string, isMine: boolean): number {
  if (isMine) return OWN_PLAYER_CONFIDENCE;
  return Math.min(MAX_RIVAL_CONFIDENCE, scouting.knowledge[playerId]?.confidence ?? 0);
}

export type AssignRefusal = "atCapacity" | "alreadyWatching" | "nothingLeftToLearn" | "ownPlayer";

/**
 * Why we can't start watching this player — or `null` when we can.
 *
 * Returning the REASON rather than a bare boolean is what lets the UI disable a
 * button with an explanation instead of silently doing nothing.
 */
export function refuseAssignment(scouting: ScoutingState, playerId: string, isMine: boolean): AssignRefusal | null {
  if (isMine) return "ownPlayer";
  if (scouting.assignments.some((a) => a.playerId === playerId)) return "alreadyWatching";
  if (scouting.assignments.length >= scouting.capacity) return "atCapacity";
  if (!nextStep(confidenceOf(scouting, playerId, false))) return "nothingLeftToLearn";
  return null;
}

/** Begin observing a player. The caller has already checked `refuseAssignment`. */
export function beginAssignment(
  scouting: ScoutingState,
  opts: { id: string; playerId: string; today: SeasonDate; todayAbsolute: number },
): ScoutAssignment | undefined {
  const step = nextStep(confidenceOf(scouting, opts.playerId, false));
  if (!step) return undefined;
  return {
    id: opts.id,
    playerId: opts.playerId,
    startedOn: { ...opts.today },
    dueDay: opts.todayAbsolute + step.days,
    gain: step.to - confidenceOf(scouting, opts.playerId, false),
  };
}

export interface DeliveredReport {
  readonly playerId: string;
  readonly confidence: number;
  /** True when this report took the player as far as observation can go. */
  readonly complete: boolean;
}

/**
 * Land every report that has come due, raising confidence and freeing the slot.
 *
 * Ordered by assignment id so a replay delivers them in the same sequence — two
 * reports landing on the same day must not depend on array order.
 */
export function deliverDueReports(scouting: ScoutingState, todayAbsolute: number, on: SeasonDate): DeliveredReport[] {
  const due = scouting.assignments
    .filter((a) => a.dueDay <= todayAbsolute)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (due.length === 0) return [];

  const delivered: DeliveredReport[] = [];
  for (const a of due) {
    const prev: PlayerKnowledge = scouting.knowledge[a.playerId] ?? { confidence: 0, reports: 0 };
    const confidence = Math.min(MAX_RIVAL_CONFIDENCE, prev.confidence + a.gain);
    scouting.knowledge[a.playerId] = { confidence, reports: prev.reports + 1, lastReportOn: { ...on } };
    delivered.push({ playerId: a.playerId, confidence, complete: !nextStep(confidence) });
  }
  const done = new Set(due.map((a) => a.id));
  scouting.assignments = scouting.assignments.filter((a) => !done.has(a.id));
  return delivered;
}

/**
 * Stop watching players we have since signed. Their confidence is moot — an own
 * player is known outright — so leaving the assignment running would burn a slot
 * on nothing.
 */
export function releaseSignedPlayers(scouting: ScoutingState, isMine: (playerId: string) => boolean): void {
  scouting.assignments = scouting.assignments.filter((a) => !isMine(a.playerId));
}
