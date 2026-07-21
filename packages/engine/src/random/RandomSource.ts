/**
 * Abstraction over randomness (DIP). Everything stochastic in the engine draws
 * from a `RandomSource` in a fixed order, which is what makes a match fully
 * reproducible from its seed and trivial to unit-test with a fake source.
 */
export interface RandomSource {
  /** Uniform float in [0, 1). */
  next(): number;

  /** Integer in [0, maxExclusive). */
  int(maxExclusive: number): number;

  /** True with probability `p` (clamped to [0, 1]). */
  chance(p: number): boolean;

  /** Uniformly pick one element (throws on an empty array). */
  pick<T>(items: readonly T[]): T;

  /** Weighted pick: each entry has a non-negative weight. */
  weighted<T>(entries: ReadonlyArray<{ item: T; weight: number }>): T;
}
