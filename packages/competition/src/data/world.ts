/**
 * Competition structure + entity metadata that accompanies a `LeagueData`
 * dataset. `LeagueData` carries squads/attributes (what the engine consumes);
 * `DatasetWorld` carries the surrounding world — which competitions exist
 * (league + cups) and richer club info — that a career maps into its
 * `CompetitionStructure` and `Club` fields. Kept here so both the dataset
 * pipeline (which emits it) and the career (which consumes it) can share the
 * types without depending on each other.
 */

export interface CompetitionInfo {
  readonly id: string;
  readonly name: string;
  readonly type: "league" | "cup";
  readonly country?: string;
  readonly tier?: number;
  readonly format?: { readonly twoLegged?: boolean; readonly groups?: number };
  /** Competition badge as a data URI (offline-embedded). */
  readonly logo?: string;
  readonly entrantClubIds: readonly string[];
}

/** One kit's colours + shirt pattern (rendered by the UI's TeamShirt). */
export interface ClubKit {
  readonly primary: string;
  readonly secondary: string;
  readonly detail: string;
  readonly pattern: "solid" | "stripes" | "hoops" | "sash";
}

/** A club's kit 1 (home) and kit 2 (away). */
export interface ClubKits {
  readonly home: ClubKit;
  readonly away: ClubKit;
}

export interface ClubMeta {
  readonly id: string;
  /** Common display name ("Vasco"), as opposed to the legal name. */
  readonly nickname?: string;
  readonly country?: string;
  readonly city?: string;
  readonly stadium?: string;
  readonly capacity?: number;
  readonly founded?: number;
  readonly colours?: readonly string[];
  /** Club crest as a data URI (offline-embedded). */
  readonly crest?: string;
  /** Kit 1 / kit 2 colours. */
  readonly kits?: ClubKits;
  /** 1–100 reputation, derived from the club's market-value standing. */
  readonly reputation: number;
}

export interface DatasetWorld {
  readonly competitions: readonly CompetitionInfo[];
  readonly clubs: readonly ClubMeta[];
}
