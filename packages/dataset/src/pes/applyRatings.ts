import { Position, positionOverall } from "@fut/domain";
import { attr, type Attribute } from "../infer/Attribute.js";
import type { InferredPlayer } from "../infer/InferAttributes.js";
import { calibrate, distributionOf, unratedTarget, type AffineTransform } from "./calibration.js";
import { alignToStatedOverall, toAttributes, type MappedAttributes, type PesRatings } from "./ratings.js";

/**
 * The stage where real ratings replace inferred ones.
 *
 * It sits between Infer and Emit rather than inside either, because the two jobs
 * are genuinely different: inference GUESSES a player from market value and
 * appearances, this stage OVERWRITES that guess with a source that measured him.
 * Keeping it separate means the guess is still there to fall back on for the
 * players the source doesn't cover — and that fallback is the delicate part.
 *
 * The whole population ends up on the SOURCE's scale, including the players it
 * has never heard of. Doing it the other way round — dragging the source down to
 * the inferred scale — was tried and rejected: the inference is the weaker data,
 * so it is the one that moves.
 */

/** What the source knows about one player, keyed by OUR id. */
export interface PesRatedPlayer {
  readonly ratings: PesRatings;
  /** The source's own summary rating, which gets the last word on quality. */
  readonly overall?: number;
  /** The source's position code, kept as a second opinion (never overrides ours). */
  readonly position?: string;
}

export interface ApplyReport {
  /** Players whose attributes came from the source. */
  readonly rated: number;
  /** Players left on inference, rescaled onto the rated population. */
  readonly backfilled: number;
  /** The transform applied to the inferred players. */
  readonly backfillTransform: AffineTransform;
  /** Mean/sd of the rated population's overall, for the record. */
  readonly ratedMean: number;
  readonly ratedSd: number;
}

const CONFIDENCE = 0.95;
const SOURCE = "community" as const;

/** Every value of a group, as plain numbers. */
const values = (g: Readonly<Record<string, Attribute>>): number[] => Object.values(g).map((a) => a.value);

/** Rebuild a group of Attributes from a mapped plain-number group. */
function toGroup<K extends string>(
  current: Readonly<Record<K, Attribute>>,
  mapped: Readonly<Record<string, number>>,
): Record<K, Attribute> {
  const out = {} as Record<K, Attribute>;
  for (const key of Object.keys(current) as K[]) {
    const v = mapped[key];
    out[key] = v === undefined ? current[key] : attr(v, CONFIDENCE, SOURCE);
  }
  return out;
}

/** Shift every attribute of an inferred player by the same amount. */
function shiftPlayer(p: InferredPlayer, t: AffineTransform): InferredPlayer {
  const move = <K extends string>(g: Readonly<Record<K, Attribute>>): Record<K, Attribute> => {
    const out = {} as Record<K, Attribute>;
    for (const key of Object.keys(g) as K[]) {
      const a = g[key];
      // Confidence is NOT raised: rescaling a guess onto a better scale makes it
      // comparable, not better founded. The UI leans on that honesty.
      out[key] = { ...a, value: Math.max(1, Math.min(99, Math.round(a.value * t.scale + t.offset))) };
    }
    return out;
  };
  const physical = move(p.physical);
  const mental = move(p.mental);
  const technical = move(p.technical);
  const goalkeeping = move(p.goalkeeping);
  return { ...p, physical, mental, technical, goalkeeping, overall: overallOf(p.position, { physical, mental, technical, goalkeeping }) };
}

/** Our own position-weighted overall for a set of attributes. */
function overallOf(
  position: Position,
  groups: {
    physical: Readonly<Record<string, Attribute>>;
    mental: Readonly<Record<string, Attribute>>;
    technical: Readonly<Record<string, Attribute>>;
    goalkeeping: Readonly<Record<string, Attribute>>;
  },
): number {
  const plain = (g: Readonly<Record<string, Attribute>>) => Object.fromEntries(Object.entries(g).map(([k, a]) => [k, a.value]));
  // `positionOverall` reads a Player-shaped object; only the attribute bags matter.
  const shim = {
    position,
    naturalPositions: [position],
    physical: plain(groups.physical),
    mental: plain(groups.mental),
    technical: plain(groups.technical),
    goalkeeping: plain(groups.goalkeeping),
    canPlay: () => true,
    familiarity: () => 1,
  };
  return Math.round(positionOverall(shim as never, position));
}

/** Apply the source's attributes to one player, with its overall respected. */
function rate(p: InferredPlayer, r: PesRatedPlayer): InferredPlayer {
  const mapped = toAttributes(r.ratings);
  const computed = overallFromMapped(p.position, mapped);
  const aligned = alignToStatedOverall(mapped, r.overall, computed);
  const physical = toGroup(p.physical, aligned.physical as unknown as Record<string, number>);
  const mental = toGroup(p.mental, aligned.mental as unknown as Record<string, number>);
  const technical = toGroup(p.technical, aligned.technical as unknown as Record<string, number>);
  const goalkeeping = toGroup(p.goalkeeping, aligned.goalkeeping as unknown as Record<string, number>);
  return { ...p, physical, mental, technical, goalkeeping, overall: overallOf(p.position, { physical, mental, technical, goalkeeping }) };
}

function overallFromMapped(position: Position, m: MappedAttributes): number {
  const shim = {
    position,
    naturalPositions: [position],
    physical: m.physical,
    mental: m.mental,
    technical: m.technical,
    goalkeeping: m.goalkeeping,
    canPlay: () => true,
    familiarity: () => 1,
  };
  return positionOverall(shim as never, position);
}

/**
 * Replace inferred attributes with the source's, then bring everyone else onto
 * the same scale.
 *
 * Two passes on purpose: the rated players define what "normal" looks like, and
 * only once that is known can the unrated ones be placed relative to it. A
 * single pass would have had to assume the target distribution in advance.
 */
export function applyPesRatings(
  players: readonly InferredPlayer[],
  ratingsById: ReadonlyMap<string, PesRatedPlayer>,
): { players: InferredPlayer[]; report: ApplyReport } {
  const rated: InferredPlayer[] = [];
  const unrated: InferredPlayer[] = [];
  const out = new Map<string, InferredPlayer>();

  for (const p of players) {
    const r = ratingsById.get(p.id);
    if (r) {
      const done = rate(p, r);
      rated.push(done);
      out.set(p.id, done);
    } else {
      unrated.push(p);
    }
  }

  // Nothing rated → nothing to calibrate against, so leave the inference alone
  // rather than moving it towards a scale we have no evidence for.
  if (rated.length === 0) {
    return {
      players: [...players],
      report: { rated: 0, backfilled: 0, backfillTransform: { scale: 1, offset: 0 }, ratedMean: 0, ratedSd: 0 },
    };
  }

  /*
   * Calibrate on the OVERALL, not on the flat pool of attributes.
   *
   * `positionOverall` is a position-WEIGHTED mean, so a player whose strengths
   * happen to be the ones his position rewards rates above his own attribute
   * average. Fitting the attribute pool therefore says nothing about where the
   * overalls land — measured, it pushed the strongest inferred players to 96–98
   * while the best rated player in the league is 85, so unrated teenagers came
   * out better than internationals.
   *
   * Fitting the overalls and then holding them inside the rated population's own
   * observed range fixes both: the shape of the distribution matches, and nobody
   * the source never rated can outrank everybody it did.
   */
  const ratedOveralls = rated.map((p) => p.overall);
  const ratedDist = distributionOf(ratedOveralls);
  const ratedMin = Math.min(...ratedOveralls);
  const unratedDist = distributionOf(unrated.map((p) => p.overall));
  const transform = unrated.length > 0 ? calibrate(unratedDist, unratedTarget(ratedDist)) : { scale: 1, offset: 0 };
  // A player the source never rated must never come out at the top of the
  // league: being absent from a ratings database is not a claim to be elite. The
  // ceiling is the rated population's own MEAN, so the best of this group is an
  // average top-flight player and no better.
  const ceiling = ratedDist.mean;
  for (const p of unrated) {
    const wanted = Math.max(ratedMin, Math.min(ceiling, p.overall * transform.scale + transform.offset));
    // Same uniform shift the rated players get: it moves the overall by exactly
    // the delta and leaves the player's internal shape alone.
    out.set(p.id, shiftPlayer(p, { scale: 1, offset: wanted - p.overall }));
  }

  return {
    // Original order preserved: the pipeline downstream indexes by club order.
    players: players.map((p) => out.get(p.id)!),
    report: {
      rated: rated.length,
      backfilled: unrated.length,
      backfillTransform: transform,
      ratedMean: ratedDist.mean,
      ratedSd: ratedDist.sd,
    },
  };
}

/** Outfield attributes, plus goalkeeping only for a keeper. */
function attributesOf(p: InferredPlayer): number[] {
  const out = [...values(p.physical), ...values(p.mental), ...values(p.technical)];
  if (p.position === Position.Goalkeeper) out.push(...values(p.goalkeeping));
  return out;
}
