/**
 * The RAW layer — a source-shaped, immutable snapshot of what the extractors
 * pulled from community sources (Transfermarkt-first). It is written ONCE by
 * the on-demand assemble command and NEVER edited afterwards; every downstream
 * layer (normalize → infer → validate → emit) is a pure function of it, so the
 * same snapshot always reproduces the same dataset.
 *
 * Fields are intentionally optional/loose: real sources have gaps, and missing
 * inputs lower an inferred attribute's confidence rather than break the build.
 */

export type CompetitionType = "league" | "cup";

export interface RawCompetition {
  readonly id: string; // source competition code, e.g. "BRA1"
  readonly name: string;
  readonly type: CompetitionType;
  readonly country?: string;
  readonly tier?: number;
  readonly seasonId?: string;
  readonly format?: { readonly twoLegged?: boolean; readonly groups?: number };
  /** Competition badge as a data URI (embedded at assemble time; offline). */
  readonly logo?: string;
  /** Clubs that take part (may be a subset when the snapshot is sampled). */
  readonly entrantClubIds: readonly string[];
}

export interface RawClub {
  readonly id: string;
  readonly name: string;
  readonly shortName?: string;
  readonly country?: string;
  readonly city?: string;
  readonly stadium?: string;
  readonly capacity?: number;
  readonly foundedYear?: number;
  readonly colours?: readonly string[];
  readonly marketValueEur?: number;
  /** Club crest as a data URI (embedded at assemble time; offline). */
  readonly crest?: string;
  /** Remote badge URL, when a source publishes one instead of bytes we embed. */
  readonly badgeUrl?: string;
  /** This club's id in other sources, keyed by source id — for future joins. */
  readonly externalIds?: Readonly<Record<string, string>>;
  /** Competitions this club appears in within the snapshot. */
  readonly competitionIds: readonly string[];
}

/** One line of BASIC per-competition/season stats (all that free sources give). */
export interface RawStatLine {
  readonly source: string;
  readonly competitionId: string;
  readonly seasonId?: string;
  readonly appearances?: number;
  readonly minutes?: number;
  readonly goals?: number;
  readonly assists?: number;
  readonly yellow?: number;
  readonly red?: number;
}

/** Optional advanced-stat block — absent by default (no free source today). */
export interface RawAdvancedStats {
  readonly source: string;
  readonly per90?: Readonly<Record<string, number>>;
  readonly totals?: Readonly<Record<string, number>>;
}

export interface RawMarketValuePoint {
  readonly date?: string;
  readonly age?: number;
  readonly clubId?: string;
  readonly marketValueEur?: number;
}

export interface RawPlayer {
  readonly id: string;
  readonly name: string;
  readonly clubId: string;
  /** Source position label (mapped to a domain Position during Emit). */
  readonly position: string;
  readonly secondaryPositions?: readonly string[];
  readonly dob?: string;
  readonly age?: number;
  readonly nationality?: readonly string[];
  readonly foot?: string;
  readonly heightCm?: number;
  readonly weightKg?: number;
  readonly marketValueEur?: number;
  readonly marketValueHistory?: readonly RawMarketValuePoint[];
  readonly contractExpires?: string;
  readonly stats?: readonly RawStatLine[];
  readonly advanced?: RawAdvancedStats;
  /**
   * Portrait as a REMOTE URL, not embedded bytes: a squad's worth of photos is
   * megabytes, and the artifact is bundled into the app. The UI falls back to a
   * single silhouette when this is absent or the fetch fails.
   */
  readonly photo?: string;
  /** Transparent cut-out portrait (preferred for the player-detail hero). */
  readonly photoCutout?: string;
  readonly shirtNumber?: number;
  readonly birthPlace?: string;
  /** This player's id in other sources, keyed by source id — for future joins. */
  readonly externalIds?: Readonly<Record<string, string>>;
}

export interface RawCoach {
  readonly id: string;
  readonly name: string;
  readonly clubId: string;
  readonly age?: number;
  readonly nationality?: string;
}

export interface RawSnapshot {
  /** The competition the assemble command was pointed at (the league). */
  readonly primaryCompetitionId: string;
  readonly competitions: readonly RawCompetition[];
  readonly clubs: readonly RawClub[];
  readonly players: readonly RawPlayer[];
  readonly coaches?: readonly RawCoach[];
}
