/** A single league division within the competition pyramid. */
export interface Division {
  readonly id: string;
  readonly name: string;
  /** 1 = top flight; higher = lower down the pyramid. */
  readonly tier: number;
  /**
   * The dataset competition this division came from ("BRA1"), when it came from one.
   *
   * The division's own id is positional (`d1`, `d2`) because promotion and relegation are about
   * TIERS, not about which real competition a tier happens to be. Keeping the source id lets the UI
   * find the division's own badge in the dataset — without it the league screen showed Série A's
   * crest above the words "Série B". Absent for a procedurally-generated league, and for any save
   * written before this existed.
   */
  readonly sourceCompetitionId?: string;
  readonly teamIds: readonly string[];
  readonly promotionSlots: number;
  readonly relegationSlots: number;
}

/** A knockout cup (uses MatchRules.knockout + TieContext for two-legged ties). */
export interface CupConfig {
  readonly id: string;
  readonly name: string;
  readonly entrantTeamIds: readonly string[];
  readonly twoLegged: boolean;
}

/** The full competition structure of a career world. */
export interface CompetitionStructure {
  readonly divisions: readonly Division[];
  readonly cups: readonly CupConfig[];
}
