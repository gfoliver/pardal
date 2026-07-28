import { type RandomSource } from "../random/RandomSource.js";
import { type MatchEvent } from "../result/MatchEvent.js";
import { clamp } from "./probability.js";

/** How a spot kick ended. `post` is the woodwork, `wide` is anywhere else off. */
export type PenaltyOutcome = "goal" | "saved" | "post" | "wide";

/**
 * A penalty as a PICTURE: where the ball finished and which way the keeper went.
 *
 * Both are in one frame — the goal seen from behind the taker, which is the view
 * the UI draws. So `x = -1` is the left post ON SCREEN (the taker's left, the
 * keeper's own right) and `dive = -1` means the keeper went that same way. Using
 * a single frame for both is what lets the drawing be literal: the ball goes
 * where `x`/`y` say, the keeper goes where `dive` says, and whether he got
 * anywhere near it is something you can see rather than something we assert.
 */
export interface PenaltyKick {
  /** −1 left post … +1 right post. Beyond ±1 the ball missed the frame. */
  readonly x: number;
  /** 0 on the ground … 1 on the crossbar. Above 1 it went over. */
  readonly y: number;
  /** −1 screen-left, +1 screen-right, 0 he stood up. */
  readonly dive: -1 | 0 | 1;
  /** How low he went: 0 along the ground … 1 up high. */
  readonly diveHeight: number;
  readonly outcome: PenaltyOutcome;
}

/**
 * Of the penalties NOT scored, how they end. Real top-flight penalties break
 * roughly two-thirds keeper, one-third the taker's own fault (and about a tenth
 * of the total off the frame itself).
 */
const MISS_SAVED = 0.62;
const MISS_POST = 0.11;

const between = (rng: RandomSource, a: number, b: number): number => a + rng.next() * (b - a);
const side = (rng: RandomSource): 1 | -1 => (rng.chance(0.5) ? -1 : 1);

/**
 * Take a penalty, given the probability it's scored.
 *
 * The outcome is drawn FIRST, from `goalProbability` — the calibrated number the
 * engines already used — and the geometry is then drawn to be consistent with
 * it. That order is deliberate: it adds the picture without moving the
 * conversion rate a single point, so nothing about the balance of a match
 * changes here. Making the geometry the CAUSE of the outcome (aim, error,
 * reach) is a bigger job: it would shift conversion and the taker/keeper
 * sensitivity, and would need measuring before it were trusted.
 */
export function takePenalty(rng: RandomSource, goalProbability: number): PenaltyKick {
  // The keeper commits blind, which is why he is wrong about as often as right.
  // Standing up is rare enough to be a surprise when it happens.
  const dive: -1 | 0 | 1 = rng.chance(0.08) ? 0 : side(rng);
  const diveHeight = dive === 0 ? between(rng, 0.1, 0.45) : between(rng, 0.05, 0.65);
  const place = (p: { x: number; y: number }, outcome: PenaltyOutcome): PenaltyKick => ({ ...p, dive, diveHeight, outcome });

  if (rng.chance(goalProbability)) return place(beaten(rng, dive, diveHeight), "goal");
  const r = rng.next();
  if (r < MISS_SAVED) return place(reached(rng, dive, diveHeight), "saved");
  if (r < MISS_SAVED + MISS_POST) return place(woodwork(rng), "post");
  return place(offTarget(rng), "wide");
}

/** Scored: the ball has to be somewhere the keeper demonstrably wasn't. */
function beaten(rng: RandomSource, dive: -1 | 0 | 1, diveHeight: number): { x: number; y: number } {
  // He stood up, so it simply went past him to one side.
  if (dive === 0) return { x: side(rng) * between(rng, 0.45, 0.94), y: between(rng, 0.05, 0.8) };
  // Sent the wrong way: the whole goal was open, and the taker didn't need a corner.
  if (rng.chance(0.62)) return { x: -dive * between(rng, 0.3, 0.94), y: between(rng, 0.05, 0.8) };
  // Right way, but placed where his dive couldn't follow — inside the post along
  // the ground if he went high, lifted over him if he went low.
  const overHim = diveHeight < 0.4;
  return { x: dive * between(rng, 0.7, 0.95), y: overHim ? between(rng, 0.55, 0.92) : between(rng, 0.02, 0.2) };
}

/** Saved: on the side he chose and inside the arc his dive actually covers. */
function reached(rng: RandomSource, dive: -1 | 0 | 1, diveHeight: number): { x: number; y: number } {
  if (dive === 0) return { x: between(rng, -0.28, 0.28), y: between(rng, 0.02, 0.5) };
  return { x: dive * between(rng, 0.12, 0.72), y: clamp(diveHeight + between(rng, -0.22, 0.22), 0.02, 0.9) };
}

/** Off the frame itself: the crossbar, or the outside of a post. */
function woodwork(rng: RandomSource): { x: number; y: number } {
  if (rng.chance(0.28)) return { x: between(rng, -0.85, 0.85), y: between(rng, 0.99, 1.01) };
  return { x: side(rng) * between(rng, 0.98, 1.02), y: between(rng, 0.05, 0.85) };
}

/** Over the bar or wide of the post — nowhere near saved. */
function offTarget(rng: RandomSource): { x: number; y: number } {
  if (rng.chance(0.42)) return { x: between(rng, -0.7, 0.7), y: between(rng, 1.06, 1.4) };
  return { x: side(rng) * between(rng, 1.06, 1.4), y: between(rng, 0.05, 0.9) };
}

const r3 = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * Flatten the picture onto a `MatchEvent`'s params (they only hold primitives).
 * Also carries `penalty: true`, the flag the career and the narration read.
 */
export function penaltyParams(k: PenaltyKick): Record<string, string | number | boolean> {
  return {
    penalty: true,
    placeX: r3(k.x),
    placeY: r3(k.y),
    keeperDive: k.dive,
    keeperDiveHeight: r3(k.diveHeight),
    pkOutcome: k.outcome,
  };
}

/** Read the picture back off an event — null if that event isn't a spot kick. */
export function penaltyKickOf(e: MatchEvent): PenaltyKick | null {
  const p = e.params;
  if (!p || typeof p.placeX !== "number" || typeof p.pkOutcome !== "string") return null;
  return {
    x: p.placeX,
    y: Number(p.placeY ?? 0),
    dive: (p.keeperDive === -1 || p.keeperDive === 1 ? p.keeperDive : 0) as -1 | 0 | 1,
    diveHeight: Number(p.keeperDiveHeight ?? 0),
    outcome: p.pkOutcome as PenaltyOutcome,
  };
}
