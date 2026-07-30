import { type RandomSource } from "./RandomSource.js";

/**
 * Deterministic PRNG (mulberry32). Same seed → same sequence, on any JS
 * runtime (browser or Cloudflare Worker), which underpins reproducibility and
 * the "client simulates, server audits by seed" multiplayer model.
 */
export class SeededRandom implements RandomSource {
  private state: number;

  constructor(seed: number) {
    // Normalise to a 32-bit unsigned integer.
    this.state = seed >>> 0;
  }

  /**
   * The generator's whole state, as a uint32.
   *
   * Exposed for the cross-runtime conformance harness: when two runtimes disagree
   * about a match, the FIRST thing to establish is whether they have drawn a
   * different NUMBER of values or the same number differently, and that is
   * unanswerable from the outside. It also means a state hash can include the
   * generator, so a divergence is caught at the step it happens rather than
   * whenever it first reaches the scoreline.
   */
  getState(): number {
    return this.state;
  }

  /** Resume a generator mid-stream. See {@link getState}. */
  static fromState(state: number): SeededRandom {
    const rng = new SeededRandom(0);
    rng.state = state >>> 0;
    return rng;
  }

  next(): number {
    // mulberry32
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(maxExclusive: number): number {
    if (maxExclusive <= 0) return 0;
    return Math.floor(this.next() * maxExclusive);
  }

  chance(p: number): boolean {
    if (p <= 0) return false;
    if (p >= 1) return true;
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("Cannot pick from an empty array");
    return items[this.int(items.length)]!;
  }

  weighted<T>(entries: ReadonlyArray<{ item: T; weight: number }>): T {
    if (entries.length === 0) {
      throw new Error("Cannot pick from empty weighted entries");
    }
    let total = 0;
    for (const e of entries) total += Math.max(0, e.weight);
    if (total <= 0) {
      // All weights zero → fall back to a uniform pick for robustness.
      return entries[this.int(entries.length)]!.item;
    }
    let roll = this.next() * total;
    for (const e of entries) {
      roll -= Math.max(0, e.weight);
      if (roll < 0) return e.item;
    }
    return entries[entries.length - 1]!.item;
  }
}
