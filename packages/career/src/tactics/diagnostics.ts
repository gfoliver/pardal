import { Position } from "@fut/domain";

/**
 * What is wrong with the side as it stands, computed from the side and nothing else.
 *
 * This was a `Career` method, which made "is my team set up properly" a question only a career could
 * answer — and a multiplayer friendly picks a shape and an eleven exactly like a career does. It lives
 * here for the same reason `edit.ts` does: two copies of "an unavailable starter is a problem" would
 * drift, and the day they drifted the two modes would disagree about a board that looked identical.
 *
 * Reads a VIEW, not a state. The whole computation only ever touched `tacticsView()`'s output, so
 * nothing had to be threaded through — which is also why the board can call it directly rather than
 * being handed the answer by whoever owns the tactic.
 */

/** How badly the manager wants to know. */
export type TacticsDiagnosticSeverity = "error" | "warn" | "info";
export type TacticsDiagnosticKind =
  | "starterUnavailable"
  | "outOfPosition"
  | "noBenchGk"
  | "overlappingSlots"
  | "benchShort";

/** One thing worth flagging about the active tactic. */
export interface TacticsDiagnostic {
  readonly severity: TacticsDiagnosticSeverity;
  readonly kind: TacticsDiagnosticKind;
  /** The slot the problem is about, so the board can point at it. Absent for a squad-wide one. */
  readonly slot?: number;
  readonly playerId?: string;
  readonly playerName?: string;
}

/** The little a diagnostic needs to know about a player — every mode's view carries at least this. */
export interface DiagnosablePlayer {
  readonly playerId: string;
  readonly name: string;
  readonly position: string;
  readonly available: boolean;
  readonly injured: boolean;
}

export interface DiagnosableSlot {
  readonly slot: number;
  readonly depth: number;
  readonly width: number;
  readonly player?: DiagnosablePlayer;
  /**
   * 0..1, or undefined where the caller cannot measure it — a friendly has no scouting knowledge.
   * Undefined raises NO out-of-position warning, because an unknown fit is not a bad one.
   */
  readonly fit?: number;
}

/** Structurally what `TacticsView` already is, narrowed to the parts a diagnosis reads. */
export interface DiagnosableSide {
  readonly slots: readonly DiagnosableSlot[];
  readonly bench: readonly DiagnosablePlayer[];
}

/**
 * Worst first, which is the order a manager triages in.
 *
 * Here rather than in the panel that sorts by it, because the same order answers a second question the
 * board asks: which single severity a whole list reduces to.
 */
export const SEVERITY_RANK: Record<TacticsDiagnosticSeverity, number> = { error: 0, warn: 1, info: 2 };

/**
 * The one severity a list of problems reduces to — the worst present, or undefined for a clean side.
 *
 * What the board's diagnostics icon is coloured by: green when this is undefined, and otherwise the
 * colour the worst ROW is drawn in, so the icon can never promise a milder problem than the list holds.
 * A fact about a list of diagnostics rather than about a button, and both modes that draw the list want
 * it — which is why it sits beside `tacticsDiagnostics` and not in the screen.
 */
export function worstSeverity(
  diagnostics: readonly TacticsDiagnostic[],
): TacticsDiagnosticSeverity | undefined {
  let worst: TacticsDiagnosticSeverity | undefined;
  for (const d of diagnostics) {
    if (worst === undefined || SEVERITY_RANK[d.severity] < SEVERITY_RANK[worst]) worst = d.severity;
  }
  return worst;
}

/** Below this the slot's occupant is being asked to do a job he is not built for. */
export const OUT_OF_POSITION_FIT_THRESHOLD = 0.85;
/** Two slots this close (in depth/width units, both 0..1) occupy the same patch of grass. */
export const OVERLAP_DISTANCE = 0.07;
/** Fewer available substitutes than this and one injury leaves the manager with nothing to do. */
export const BENCH_SHORT_THRESHOLD = 5;

/**
 * Problems with the side, most severe first: an unavailable starter is an ERROR (the team builder will
 * silently replace them at kick-off); a badly out-of-position starter, no fit goalkeeper on the bench,
 * or two slots dragged on top of each other are WARNings; a thin bench is just an INFO.
 */
export function tacticsDiagnostics(view: DiagnosableSide): TacticsDiagnostic[] {
  const out: TacticsDiagnostic[] = [];

  for (const slot of view.slots) {
    const p = slot.player;
    if (!p) continue;
    if (!p.available || p.injured) {
      out.push({ severity: "error", kind: "starterUnavailable", slot: slot.slot, playerId: p.playerId, playerName: p.name });
      continue; // an unavailable starter's fit% isn't the interesting problem
    }
    if (slot.fit !== undefined && slot.fit < OUT_OF_POSITION_FIT_THRESHOLD) {
      out.push({ severity: "warn", kind: "outOfPosition", slot: slot.slot, playerId: p.playerId, playerName: p.name });
    }
  }

  const fitBenchGk = view.bench.some((p) => p.position === Position.Goalkeeper && p.available && !p.injured);
  if (!fitBenchGk) out.push({ severity: "warn", kind: "noBenchGk" });

  for (let i = 0; i < view.slots.length; i++) {
    for (let j = i + 1; j < view.slots.length; j++) {
      const a = view.slots[i]!;
      const b = view.slots[j]!;
      if (Math.hypot(a.depth - b.depth, a.width - b.width) < OVERLAP_DISTANCE) {
        out.push({ severity: "warn", kind: "overlappingSlots", slot: i });
      }
    }
  }

  const availableBench = view.bench.filter((p) => p.available && !p.injured).length;
  if (availableBench < BENCH_SHORT_THRESHOLD) out.push({ severity: "info", kind: "benchShort" });

  return out;
}
