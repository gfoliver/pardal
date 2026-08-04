import { Position, positionOverall } from "@fut/domain";
import { attr, type Attribute } from "../infer/Attribute.js";
import type { InferredPlayer } from "../infer/InferAttributes.js";
import { calibrate, distributionOf, unratedTarget, type AffineTransform } from "./calibration.js";
import { toAttributes, type MappedAttributes, type SourceAttributes } from "./attributes.js";

/**
 * The stage where real ratings replace inferred ones.
 *
 * It sits between Infer and Emit rather than inside either, because the two jobs are genuinely
 * different: inference GUESSES a player from market value and appearances, this stage OVERWRITES
 * that guess with a source that measured him. Keeping it separate means the guess is still there
 * to fall back on for the players the source doesn't cover — and that fallback is the delicate
 * part.
 *
 * The whole population ends up on ONE scale — ours, see `SCALE_ANCHORS` — and the source's own
 * judgement decides who sits where on it. The inference never gets a vote on the scale: it is the
 * weaker data, so it is the side that moves.
 */

/** What the source knows about one player, keyed by OUR id. */
export interface RatedPlayer {
  /** The source's own labels on its own scale; mapped here. */
  readonly attributes: SourceAttributes;
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
  /** Where the sourced attributes landed on OUR scale — comparable across competitions. */
  readonly sourceAttributeMean: number;
  readonly sourceAttributeSd: number;
}

const CONFIDENCE = 0.95;
const SOURCE = "community" as const;

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
      // Confidence is NOT raised: rescaling a guess onto a better scale makes it comparable,
      // not better founded. The UI leans on that honesty.
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

/**
 * Apply the source's attributes to one player.
 *
 * No overall-alignment step, unlike the source this replaced. That correction existed to undo
 * the bias of blending several source stats into one attribute; the mapping is now one-to-one,
 * so there is no blend and no bias, and our position weights over these attributes ARE the
 * player's quality.
 */
function rate(p: InferredPlayer, r: RatedPlayer): InferredPlayer {
  const { attributes: m } = toAttributes(r.attributes);
  const physical = toGroup(p.physical, m.physical as unknown as Record<string, number>);
  const mental = toGroup(p.mental, m.mental as unknown as Record<string, number>);
  const technical = toGroup(p.technical, m.technical as unknown as Record<string, number>);
  // Only a keeper's goalkeeping numbers are real; an outfield page carries no such labels at all,
  // so `toAttributes` leaves them absent and his inferred ones stand.
  const goalkeeping = p.position === Position.Goalkeeper
    ? toGroup(p.goalkeeping, m.goalkeeping as unknown as Record<string, number>)
    : p.goalkeeping;
  return { ...p, physical, mental, technical, goalkeeping, overall: overallOf(p.position, { physical, mental, technical, goalkeeping }) };
}

/**
 * Replace inferred attributes with the source's, then bring everyone else onto the same scale.
 *
 * Two passes on purpose: the rated players define what "normal" looks like, and only once that
 * is known can the unrated ones be placed relative to it. A single pass would have had to assume
 * the target distribution in advance.
 */
export function applyRatings(
  players: readonly InferredPlayer[],
  ratingsById: ReadonlyMap<string, RatedPlayer>,
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

  // Nothing rated → nothing to calibrate against, so leave the inference alone rather than
  // moving it towards a scale we have no evidence for.
  if (rated.length === 0) {
    return {
      players: [...players],
      report: {
        rated: 0, backfilled: 0, backfillTransform: { scale: 1, offset: 0 },
        ratedMean: 0, ratedSd: 0, sourceAttributeMean: 0, sourceAttributeSd: 0,
      },
    };
  }

  /*
   * The rated players are NOT rescaled here, and that is a decision worth stating.
   *
   * `SCALE_ANCHORS` already placed them, with a fixed curve off the source's global 1–20. Fitting
   * this league's own mean onto a target instead would force every competition to the same centre —
   * the Brasileirão and the Premier League would come out equally strong and moving between them
   * would mean nothing. So the source's absolute judgement stands, and the only thing calibrated
   * below is the BACKFILL, which has no absolute judgement behind it to respect.
   *
   * Measured on the attributes that actually came from the source, for the report only.
   */
  const sourceDist = distributionOf(
    rated.flatMap((p) =>
      [p.physical, p.mental, p.technical, p.goalkeeping].flatMap((g) =>
        Object.values(g as Readonly<Record<string, Attribute>>).filter((a) => a.source === SOURCE).map((a) => a.value),
      ),
    ),
  );

  /*
   * Calibrate on the OVERALL, not on the flat pool of attributes.
   *
   * `positionOverall` is a position-WEIGHTED mean, so a player whose strengths happen to be the
   * ones his position rewards rates above his own attribute average. Fitting the attribute pool
   * therefore says nothing about where the overalls land — measured, it pushed the strongest
   * inferred players to 96–98 while the best rated player in the league is 85, so unrated
   * teenagers came out better than internationals.
   *
   * Fitting the overalls and then holding them inside the rated population's own observed range
   * fixes both: the shape of the distribution matches, and nobody the source never rated can
   * outrank everybody it did.
   */
  const ratedOveralls = rated.map((p) => p.overall);
  const ratedDist = distributionOf(ratedOveralls);
  const ratedMin = Math.min(...ratedOveralls);
  const unratedDist = distributionOf(unrated.map((p) => p.overall));
  const transform = unrated.length > 0 ? calibrate(unratedDist, unratedTarget(ratedDist)) : { scale: 1, offset: 0 };
  // A player the source never rated must never come out at the top of the league: being absent
  // from a ratings database is not a claim to be elite. The ceiling is the rated population's
  // own MEAN, so the best of this group is an average top-flight player and no better.
  const ceiling = ratedDist.mean;
  for (const p of unrated) {
    const wanted = Math.max(ratedMin, Math.min(ceiling, p.overall * transform.scale + transform.offset));
    // Same uniform shift the rated players get: it moves the overall by exactly the delta and
    // leaves the player's internal shape alone.
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
      sourceAttributeMean: sourceDist.mean,
      sourceAttributeSd: sourceDist.sd,
    },
  };
}

export type { MappedAttributes };
