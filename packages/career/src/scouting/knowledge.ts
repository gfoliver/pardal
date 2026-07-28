import { type AttrName, type Formation, Position, WEIGHTS, assignToFormation, type AssignablePlayer } from "@fut/domain";
import { scoutSeed } from "../rng/seeds.js";

/**
 * What the manager KNOWS about a player, as opposed to what is true.
 *
 * The career has always handed the UI exact numbers for all 552 players in the
 * league, so scouting was decoration. This module is the fog: everything about
 * someone else's player is an estimate whose width depends on how long you have
 * watched him, and it never fully closes.
 *
 * Pure and seeded — no clock, no `Math.random`. That is not just house style:
 * an estimate re-rolled per render would flicker, and one re-rolled per report
 * would wander instead of converge.
 */

// --- knowledge tiers ---------------------------------------------------------

export type ChartFidelity = "hidden" | "coarse" | "close" | "exact";
export type OverallFidelity = "hidden" | "grade" | "exact";

export interface KnowledgeTier {
  /** Lowest confidence (0-100) that reaches this tier. */
  readonly at: number;
  /** Half-width of every attribute estimate, in rating points. Null = hidden. */
  readonly attrMargin: number | null;
  /** Half-width of a money estimate, as a FRACTION of the true figure. */
  readonly moneyMargin: number;
  /** Half-width of the potential estimate, on the 0-200 ability scale. */
  readonly potentialMargin: number;
  readonly chart: ChartFidelity;
  readonly overall: OverallFidelity;
}

/**
 * The ladder. A scout who has barely seen a player offers a shape and a hunch;
 * one who has watched him all season is nearly right but still not certain.
 *
 * 100 is reserved for players at YOUR club — the only people whose numbers you
 * see outright. A rival's player tops out at 90, by design.
 */
export const KNOWLEDGE_TIERS: readonly KnowledgeTier[] = [
  { at: 0, attrMargin: null, moneyMargin: 1, potentialMargin: 100, chart: "hidden", overall: "hidden" },
  { at: 30, attrMargin: 20, moneyMargin: 0.4, potentialMargin: 50, chart: "coarse", overall: "grade" },
  { at: 60, attrMargin: 10, moneyMargin: 0.2, potentialMargin: 25, chart: "close", overall: "exact" },
  { at: 90, attrMargin: 5, moneyMargin: 0.1, potentialMargin: 12, chart: "exact", overall: "exact" },
  { at: 100, attrMargin: 0, moneyMargin: 0, potentialMargin: 0, chart: "exact", overall: "exact" },
];

/** Highest confidence a player at ANOTHER club can ever reach. */
export const MAX_RIVAL_CONFIDENCE = 90;
/** Players at your own club: nothing to observe, you simply know. */
export const OWN_PLAYER_CONFIDENCE = 100;

export function tierFor(confidence: number): KnowledgeTier {
  let tier = KNOWLEDGE_TIERS[0]!;
  for (const t of KNOWLEDGE_TIERS) if (confidence >= t.at) tier = t;
  return tier;
}

// --- estimates ---------------------------------------------------------------

export interface Estimate {
  readonly low: number;
  /** The scout's best guess. Equals the truth only at full confidence. */
  readonly mid: number;
  readonly high: number;
  /** True when there is no uncertainty left — render a number, not a band. */
  readonly exact: boolean;
}

/** A stable offset in [-1, 1] for one (player, fact) pair. */
function unitOffset(seed: number): number {
  return (seed / 0xffffffff) * 2 - 1;
}

/**
 * A band around the truth, `margin` wide either side.
 *
 * The centre is `truth + u × margin` where `u` is a STABLE unit offset for this
 * player and fact. Two consequences, both wanted:
 *
 *  - the band always contains the truth, so the UI can promise "somewhere in
 *    here" and mean it;
 *  - halving the margin halves the error, so watching a player longer moves the
 *    guess toward the real value rather than re-rolling it somewhere else.
 *
 * `lo`/`hi` clamp the scale (0-99 for attributes). Clamping can only widen the
 * band on the clamped side, never exclude the truth.
 */
export function estimateOf(truth: number, margin: number, seed: number, lo = 0, hi = 99): Estimate {
  if (margin <= 0) return { low: truth, mid: truth, high: truth, exact: true };
  const mid = clamp(truth + unitOffset(seed) * margin, lo, hi);
  return {
    low: clamp(Math.min(mid - margin, truth), lo, hi),
    mid,
    high: clamp(Math.max(mid + margin, truth), lo, hi),
    exact: false,
  };
}

/** The same band, as a fraction of the figure — for money, which spans decades. */
export function estimateMoney(truth: number, fraction: number, seed: number): Estimate {
  if (fraction <= 0) return { low: truth, mid: truth, high: truth, exact: true };
  const e = estimateOf(truth, truth * fraction, seed, 0, Number.MAX_SAFE_INTEGER);
  return { low: Math.round(e.low), mid: Math.round(e.mid), high: Math.round(e.high), exact: false };
}

// --- the full attribute picture ---------------------------------------------

export type AttrGroup = "physical" | "mental" | "technical" | "goalkeeping";

export const ATTR_GROUPS: Readonly<Record<AttrGroup, readonly AttrName[]>> = {
  physical: ["pace", "stamina", "strength", "agility"],
  mental: ["decisions", "composure", "workRate", "teamwork", "aggression", "anticipation", "positioning", "vision"],
  technical: ["passing", "technique", "dribbling", "finishing", "shotPower", "tackling", "marking", "crossing"],
  goalkeeping: ["reflexes", "handling", "gkPositioning", "oneOnOnes"],
};

export interface AttrKnowledge {
  readonly name: AttrName;
  readonly group: AttrGroup;
  readonly estimate: Estimate;
  /**
   * 0-1: how much this attribute actually drives the player's rating in his own
   * position. Taken from the engine's own `WEIGHTS`, not invented for display —
   * finishing really is what makes a striker, and pace really is worth nothing
   * to a goalkeeper. This is what lets a screen show every attribute without
   * every attribute looking equally decisive.
   */
  readonly relevance: number;
}

/**
 * How much each attribute matters at `position`, normalised so the position's
 * most important attribute is 1. Attributes the position does not weight at all
 * come back 0 — true, and worth saying plainly.
 */
export function relevanceAt(position: Position): Readonly<Partial<Record<AttrName, number>>> {
  const weights = WEIGHTS[position] ?? {};
  const max = Math.max(1, ...Object.values(weights).filter((w): w is number => typeof w === "number"));
  const out: Partial<Record<AttrName, number>> = {};
  for (const [name, w] of Object.entries(weights)) out[name as AttrName] = (w ?? 0) / max;
  return out;
}

/**
 * Every attribute the player has, as the manager currently understands it.
 *
 * Goalkeeping attributes are included only for keepers — an outfielder's
 * `reflexes` is a placeholder the domain fills with 1, and showing it would be
 * noise dressed as data.
 */
export function attributeKnowledge(
  truth: Readonly<Partial<Record<AttrName, number>>>,
  position: Position,
  confidence: number,
  careerSeed: number,
  playerId: string,
): readonly AttrKnowledge[] {
  const { attrMargin } = tierFor(confidence);
  if (attrMargin === null) return [];
  const relevance = relevanceAt(position);
  const groups: AttrGroup[] = position === Position.Goalkeeper
    ? ["goalkeeping", "physical", "mental", "technical"]
    : ["physical", "mental", "technical"];

  const out: AttrKnowledge[] = [];
  for (const group of groups) {
    for (const name of ATTR_GROUPS[group]) {
      const value = truth[name];
      if (value === undefined) continue;
      out.push({
        name,
        group,
        estimate: estimateOf(value, attrMargin, scoutSeed(careerSeed, playerId, name)),
        relevance: relevance[name] ?? 0,
      });
    }
  }
  return out;
}

// --- headline figures --------------------------------------------------------

/** Letter grade for an overall a scout can only ballpark (the 30-confidence tier). */
export function overallGrade(overall: number): string {
  if (overall >= 85) return "A";
  if (overall >= 78) return "B";
  if (overall >= 70) return "C";
  if (overall >= 62) return "D";
  return "E";
}

/** Potential as a star band (1-5), from the hidden 0-200 ability ceiling. */
export function potentialStars(potentialAbility: number, confidence: number, careerSeed: number, playerId: string): Estimate {
  const { potentialMargin } = tierFor(confidence);
  const ability = estimateOf(potentialAbility, potentialMargin, scoutSeed(careerSeed, playerId, "potential"), 0, 200);
  const stars = (v: number) => Math.max(1, Math.min(5, Math.round(v / 40)));
  return { low: stars(ability.low), mid: stars(ability.mid), high: stars(ability.high), exact: ability.exact };
}

// --- fit in OUR squad --------------------------------------------------------

export interface SquadFit {
  /** How many of ours already play his position. */
  readonly depthAtPosition: number;
  /** Our best rating in that position today (0 when we have nobody). */
  readonly bestAtPosition: number;
  /** Rating points the best XI gains by signing him. Zero when he wouldn't improve it. */
  readonly xiGain: number;
  /** Would he walk into the side? */
  readonly wouldStart: boolean;
}

/** Quality of an already-solved eleven: Σ(rating − what the fill cost). */
function xiRating(assignment: ReturnType<typeof assignToFormation>, pool: readonly AssignablePlayer[]): number {
  const byId = new Map(pool.map((p) => [p.id, p]));
  let sum = 0;
  for (const slot of assignment.slots) {
    if (!slot) continue;
    sum += (byId.get(slot.playerId)?.rating ?? 0) - slot.penalty;
  }
  return sum;
}

/**
 * What signing this player would actually do for us — the question a scouting
 * report exists to answer, and the one the old boolean `scouted` flag never did.
 *
 * Measured by solving the best XI twice, with and without him, using the same
 * Hungarian assignment the squad auto-pick uses. So "he improves the team by 4
 * points" means the same thing here as it does on the tactics board, rather than
 * being a separate heuristic that can disagree with it.
 */
export function squadFit(
  squad: readonly AssignablePlayer[],
  target: AssignablePlayer,
  formation: Formation,
): SquadFit {
  const samePosition = squad.filter((p) => p.position === target.position);
  const withHim = [...squad, target];
  const before = assignToFormation(squad, formation);
  const after = assignToFormation(withHim, formation);

  return {
    depthAtPosition: samePosition.length,
    bestAtPosition: samePosition.reduce((best, p) => Math.max(best, p.rating), 0),
    xiGain: Math.max(0, Math.round(xiRating(after, withHim) - xiRating(before, squad))),
    wouldStart: after.slots.some((s) => s?.playerId === target.id),
  };
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}
