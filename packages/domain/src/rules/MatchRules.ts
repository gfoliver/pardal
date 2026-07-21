/**
 * Competition-defined match format, injected into the match. Decides the
 * regulation length and whether extra time / a penalty shootout can happen.
 */
export class MatchRules {
  constructor(
    public readonly regulationMinutes: number,
    public readonly hasExtraTime: boolean,
    public readonly extraTimeMinutes: number,
    public readonly hasPenaltyShootout: boolean,
  ) {}

  /** League match: 90', no extra time, no shootout (a draw stands). */
  static league(): MatchRules {
    return new MatchRules(90, false, 0, false);
  }

  /** Single-legged knockout: 90' + 30' extra time + shootout if still level. */
  static knockout(): MatchRules {
    return new MatchRules(90, true, 30, true);
  }
}
