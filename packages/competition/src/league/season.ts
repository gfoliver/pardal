import { computeStandings, type FixtureResult, type StandingRow } from "./Standings.js";
import { computeSeasonStats, type SeasonStats } from "./SeasonStats.js";
import { type SeasonResult } from "./League.js";

/**
 * The minimal, serializable state of a season: the seed, the teams and every
 * played fixture. The table is always derivable from the fixtures, so it isn't
 * stored (avoids drift). This is what a save file / IndexedDB record holds.
 */
export interface SeasonSnapshot {
  readonly seed: number;
  readonly teamIds: readonly string[];
  readonly fixtures: readonly FixtureResult[];
}

export function toSnapshot(result: SeasonResult): SeasonSnapshot {
  return { seed: result.seed, teamIds: result.teamIds, fixtures: result.fixtures };
}

export function serializeSeason(result: SeasonResult): string {
  return JSON.stringify(toSnapshot(result));
}

export function deserializeSeason(json: string): SeasonSnapshot {
  const parsed = JSON.parse(json) as SeasonSnapshot;
  if (
    typeof parsed?.seed !== "number" ||
    !Array.isArray(parsed?.teamIds) ||
    !Array.isArray(parsed?.fixtures)
  ) {
    throw new Error("Invalid season snapshot");
  }
  return parsed;
}

/** Recompute the table from a snapshot. */
export function tableFromSnapshot(snapshot: SeasonSnapshot): StandingRow[] {
  return computeStandings(snapshot.teamIds, snapshot.fixtures);
}

/** Recompute the league stats from a snapshot. */
export function statsFromSnapshot(snapshot: SeasonSnapshot): SeasonStats {
  return computeSeasonStats(snapshot.teamIds, snapshot.fixtures);
}

/**
 * Storage-agnostic persistence for seasons. A browser (IndexedDB) or Node (fs)
 * implementation plugs in later; the in-memory one below serves tests and demos.
 */
export interface SeasonStore {
  save(key: string, snapshot: SeasonSnapshot): Promise<void>;
  load(key: string): Promise<SeasonSnapshot | null>;
}

export class InMemorySeasonStore implements SeasonStore {
  private readonly data = new Map<string, string>();

  async save(key: string, snapshot: SeasonSnapshot): Promise<void> {
    this.data.set(key, JSON.stringify(snapshot));
  }

  async load(key: string): Promise<SeasonSnapshot | null> {
    const raw = this.data.get(key);
    return raw ? (JSON.parse(raw) as SeasonSnapshot) : null;
  }
}
