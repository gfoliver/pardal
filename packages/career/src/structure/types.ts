/** A single league division within the competition pyramid. */
export interface Division {
  readonly id: string;
  readonly name: string;
  /** 1 = top flight; higher = lower down the pyramid. */
  readonly tier: number;
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
