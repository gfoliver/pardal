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
 * The observation ladder: the confidence reached by a given day of CONTINUOUS watching.
 *
 * `byDay` is cumulative from the day the scout went out, not the cost of one rung. That is
 * the whole point of the shape: a report landing no longer restarts the clock, so watching
 * a player to 90% is one 45-day job instead of three separate ones the manager has to
 * remember to re-issue (10 + 21 + 35 = 66 days of slot time, plus however long it took him
 * to notice each report had come in).
 *
 * Each rung still costs more than the last — 10, then 14, then 21 — because a first look
 * should be cheap and being nearly sure should not be. If every step cost the same,
 * "scout everyone a bit" would dominate and there would be no choice to make. Ending at 90
 * is deliberate: see {@link MAX_RIVAL_CONFIDENCE}.
 */
export const OBSERVATION_STEPS: readonly { readonly to: number; readonly byDay: number }[] = [
  { to: 30, byDay: 10 },
  { to: 60, byDay: 24 },
  { to: 90, byDay: 45 },
];

/** Scouting capacity a club of this reputation can field (2-4 simultaneous). */
export function capacityFor(reputation: number): number {
  return 2 + Math.min(2, Math.floor(reputation / 40));
}

/** The next rung above `confidence`, or undefined when there is nothing left to learn. */
export function nextStep(confidence: number): { to: number; byDay: number } | undefined {
  return OBSERVATION_STEPS.find((s) => s.to > confidence);
}

/**
 * Days of watching still owed to reach the next rung from `confidence`.
 *
 * The GAP between rungs, not the cumulative figure — which is what makes continuing an
 * observation cheaper than starting one over. It also means a manager who cancelled at 30%
 * and comes back later pays only the 14 days he still owes, rather than the 24 the ladder
 * says 60% sits at: the first ten days are already spent and the knowledge is banked.
 */
export function daysToNextStep(confidence: number): number | undefined {
  const i = OBSERVATION_STEPS.findIndex((s) => s.to > confidence);
  if (i < 0) return undefined;
  return OBSERVATION_STEPS[i]!.byDay - (i === 0 ? 0 : OBSERVATION_STEPS[i - 1]!.byDay);
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
  const known = confidenceOf(scouting, opts.playerId, false);
  const step = nextStep(known);
  const owed = daysToNextStep(known);
  if (!step || owed === undefined) return undefined;
  return {
    id: opts.id,
    playerId: opts.playerId,
    startedOn: { ...opts.today },
    dueDay: opts.todayAbsolute + owed,
    gain: step.to - known,
  };
}

export interface DeliveredReport {
  readonly playerId: string;
  readonly confidence: number;
  /** True when this report took the player as far as observation can go. */
  readonly complete: boolean;
  /** What the scout will reach next, when he is staying on him. */
  readonly nextConfidence?: number;
}

/**
 * Land every report that has come due, raising confidence — and KEEP the scout on him if
 * there is a rung left.
 *
 * A landed report used to end the assignment and free the slot, which made the ladder a
 * chore: the manager had to spot the report, find the player again and re-issue, three
 * times per player, and every day he took to notice was a day of observation lost. Now an
 * observation runs until it reaches 90% or the manager cancels it — and the next report is
 * due `daysToNextStep` after this one, measured from THIS report's due day, so a clock that
 * jumps several days at once neither loses progress nor hands out free days.
 *
 * Looped because one tick can cross more than one rung: the calendar moves fixture to
 * fixture, and delivering only the first would silently stall the observation until the
 * next tick. Ordered by assignment id so a replay delivers in the same sequence — two
 * reports landing on the same day must not depend on array order.
 */
export function deliverDueReports(scouting: ScoutingState, todayAbsolute: number, on: SeasonDate): DeliveredReport[] {
  const delivered: DeliveredReport[] = [];

  for (let pass = 0; pass <= OBSERVATION_STEPS.length; pass++) {
    const due = scouting.assignments
      .filter((a) => a.dueDay <= todayAbsolute)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    if (due.length === 0) break;

    const continuing = new Map<string, ScoutAssignment>();
    for (const a of due) {
      const prev: PlayerKnowledge = scouting.knowledge[a.playerId] ?? { confidence: 0, reports: 0 };
      const confidence = Math.min(MAX_RIVAL_CONFIDENCE, prev.confidence + a.gain);
      scouting.knowledge[a.playerId] = { confidence, reports: prev.reports + 1, lastReportOn: { ...on } };
      const next = nextStep(confidence);
      const owed = daysToNextStep(confidence);
      delivered.push({ playerId: a.playerId, confidence, complete: !next, nextConfidence: next?.to });
      if (next && owed !== undefined) {
        continuing.set(a.id, { ...a, dueDay: a.dueDay + owed, gain: next.to - confidence });
      }
    }

    const finished = new Set(due.filter((a) => !continuing.has(a.id)).map((a) => a.id));
    scouting.assignments = scouting.assignments
      .filter((a) => !finished.has(a.id))
      .map((a) => continuing.get(a.id) ?? a);
  }

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
