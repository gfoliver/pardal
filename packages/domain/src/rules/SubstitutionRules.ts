/**
 * Competition-defined substitution rules, injected into the match. Models the
 * two DISTINCT limits — number of substitutions and number of windows
 * (stoppages) — plus whether half-time counts as a window.
 */
export class SubstitutionRules {
  constructor(
    public readonly maxSubstitutions: number,
    public readonly maxWindows: number,
    public readonly halftimeCountsAsWindow: boolean,
  ) {}

  /** Brazilian Série A: 5 substitutions across 3 windows; half-time free. */
  static brasileirao(): SubstitutionRules {
    return new SubstitutionRules(5, 3, false);
  }

  /** A permissive default (5 subs, 5 windows) for casual matches. */
  static permissive(): SubstitutionRules {
    return new SubstitutionRules(5, 5, false);
  }
}
