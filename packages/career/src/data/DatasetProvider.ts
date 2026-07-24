import type { DatasetWorld, LeagueData } from "@fut/competition";

/**
 * Supplies the REFERENCE DATA (clubs/players/leagues) a career is built from,
 * decoupled from where it lives. A save stores only a `datasetId`+`version` and
 * rehydrates base data through this interface — so community datasets/patches
 * (a future phase) plug in without touching `@fut/career`.
 *
 * `@fut/career` never does file/network I/O itself; the concrete provider
 * (reads league.json, fetches a patch, …) lives in the app layer.
 */
export interface DatasetProvider {
  readonly id: string;
  readonly version: string;
  getLeague(leagueId: string): LeagueData;
  /** All league ids available in this dataset. */
  leagueIds(): string[];
  /** Competition structure + club metadata, when the dataset supplies it. */
  getWorld?(leagueId: string): DatasetWorld | null;
}

/** A trivial provider over already-loaded LeagueData (tests, bundled data).
 *  Optionally carries the matching `DatasetWorld` per league. */
export class InMemoryDatasetProvider implements DatasetProvider {
  private readonly leagues: Map<string, LeagueData>;
  private readonly worlds: Map<string, DatasetWorld>;

  constructor(
    readonly id: string,
    readonly version: string,
    leagues: readonly LeagueData[],
    worlds: Readonly<Record<string, DatasetWorld>> = {},
  ) {
    this.leagues = new Map(leagues.map((l) => [l.id, l]));
    this.worlds = new Map(Object.entries(worlds));
  }

  getLeague(leagueId: string): LeagueData {
    const l = this.leagues.get(leagueId);
    if (!l) throw new Error(`League not found in dataset: ${leagueId}`);
    return l;
  }

  leagueIds(): string[] {
    return [...this.leagues.keys()].sort();
  }

  getWorld(leagueId: string): DatasetWorld | null {
    return this.worlds.get(leagueId) ?? null;
  }
}
