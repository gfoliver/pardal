import { type MatchRules } from "@fut/domain";
import { Period } from "../state/MatchState.js";

export interface TimeSegment {
  readonly period: Period;
  /** First minute of the segment (inclusive). */
  readonly from: number;
  /** Last minute of the segment (inclusive). */
  readonly to: number;
}

/**
 * Segments match time into halves (and extra-time halves). Keeps the minute
 * bookkeeping — including extra time — out of the simulator loop.
 */
export class MatchClock {
  constructor(private readonly rules: MatchRules) {}

  regulationSegments(): TimeSegment[] {
    const half = Math.round(this.rules.regulationMinutes / 2);
    return [
      { period: Period.FirstHalf, from: 1, to: half },
      { period: Period.SecondHalf, from: half + 1, to: this.rules.regulationMinutes },
    ];
  }

  extraTimeSegments(): TimeSegment[] {
    if (!this.rules.hasExtraTime) return [];
    const base = this.rules.regulationMinutes;
    const half = Math.round(this.rules.extraTimeMinutes / 2);
    return [
      { period: Period.ExtraFirst, from: base + 1, to: base + half },
      {
        period: Period.ExtraSecond,
        from: base + half + 1,
        to: base + this.rules.extraTimeMinutes,
      },
    ];
  }
}
