/**
 * Bringing a foreign rating scale onto ours.
 *
 * The source's numbers live higher and tighter than ours (measured: their
 * summary rating is 62–85 with sd 3.7 where our attributes span 42–75 with sd
 * 7.2). Two ways to reconcile that, and only one keeps the game intact: move the
 * game onto their scale — which invalidates every save and every balance
 * constant in the engine — or move their numbers onto ours. We do the latter.
 *
 * The transform is a single AFFINE map applied to every attribute alike. That
 * matters: a weighted mean of linearly-transformed attributes is the same linear
 * transform of the weighted mean, so calibrating on the OVERALL automatically
 * calibrates every attribute, and — because one transform is shared — a player's
 * internal shape (quick but can't pass) survives untouched. Per-attribute
 * matching would have flattened exactly the detail we imported the source for.
 */

export interface Distribution {
  readonly mean: number;
  readonly sd: number;
}

/** Mean and (population) standard deviation of a sample. */
export function distributionOf(values: readonly number[]): Distribution {
  if (values.length === 0) return { mean: 0, sd: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return { mean, sd: Math.sqrt(variance) };
}

/** `y = value * scale + offset`. */
export interface AffineTransform {
  readonly scale: number;
  readonly offset: number;
}

export const IDENTITY: AffineTransform = { scale: 1, offset: 0 };

/**
 * The transform that lands `from` on `to`.
 *
 * A degenerate source (every player identical) can't be stretched — spreading it
 * would be inventing differences the source doesn't claim — so it is shifted to
 * the target mean and left flat.
 */
export function calibrate(from: Distribution, to: Distribution): AffineTransform {
  if (!(from.sd > 0.001)) return { scale: 1, offset: to.mean - from.mean };
  const scale = to.sd / from.sd;
  return { scale, offset: to.mean - from.mean * scale };
}

export function applyTransform(value: number, t: AffineTransform, lo = 1, hi = 99): number {
  return Math.max(lo, Math.min(hi, Math.round(value * t.scale + t.offset)));
}

/**
 * Where the players the source DOESN'T cover should sit.
 *
 * They are overwhelmingly the young squad fillers a ratings database hasn't got
 * round to — genuinely the back end of a squad, but not a different species. So
 * they take the enriched population's own spread, centred a touch below it:
 * enough that an unrated player isn't quietly the best in the side, not so much
 * that the squad splits visibly into two castes.
 */
export const UNRATED_MEAN_PENALTY = 2;

/**
 * And a TIGHTER spread than the rated players have.
 *
 * Two reasons, one honest and one practical. Honest: not being in the database
 * is itself the absence of information, so claiming these players vary as widely
 * in quality as the ones we actually measured would be asserting detail we
 * haven't got. Practical: matching the rated spread let the top of this group
 * reach the very top of the league — a squad filler nobody has rated came out at
 * 85, level with Thiago Silva.
 */
export const UNRATED_SD_SHRINK = 0.55;

export function unratedTarget(enriched: Distribution): Distribution {
  return { mean: enriched.mean - UNRATED_MEAN_PENALTY, sd: enriched.sd * UNRATED_SD_SHRINK };
}
