import type { DatasetWorld, LeagueData } from "@fut/competition";
import { positionOverall } from "@fut/domain";
import { loadLeagueTeams } from "@fut/competition";
import braLeague from "./datasets/brasileirao-serie-a/league.json";
import braWorld from "./datasets/brasileirao-serie-a/world.json";
import braManifest from "./datasets/brasileirao-serie-a/manifest.json";

/**
 * The datasets a career can be started on.
 *
 * There used to be a procedural "Série Brasil (Fictícia)" here — twelve invented clubs with
 * generated squads — which existed to have something to play before a real dataset was
 * assembled. The Brasileirão one supersedes it entirely (real squads, market values, crests,
 * a cup), so it is gone rather than left as a second thing to keep working.
 */

// --- dataset registry -------------------------------------------------------

export interface ClubChoice {
  readonly id: string;
  readonly name: string;
  readonly short: string;
  readonly rating: number;
  readonly crest?: string;
}

/** A selectable dataset a career can be created on. */
export interface DatasetOption {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  league(): LeagueData;
  world(): DatasetWorld | undefined;
  clubChoices(): ClubChoice[];
  /** Competition badge (data URI), when the dataset supplies one. */
  logo(): string | undefined;
}

/** Club picks derived from an assembled league's squads (rating = best XI overall). */
function derivedClubChoices(league: LeagueData, world?: DatasetWorld): ClubChoice[] {
  const teams = loadLeagueTeams(league);
  const crestById = new Map((world?.clubs ?? []).map((c) => [c.id, c.crest]));
  return league.teams
    .map((t, i) => {
      const team = teams[i]!;
      const xi = team.startingXi;
      const rating = Math.round(xi.reduce((s, p) => s + positionOverall(p, p.position), 0) / Math.max(1, xi.length));
      return { id: t.id, name: t.name, short: t.shortName, rating, crest: crestById.get(t.id) };
    })
    .sort((a, b) => b.rating - a.rating);
}

const BRASILEIRAO: DatasetOption = {
  id: (braManifest as { id: string }).id,
  name: (braManifest as { name: string }).name,
  version: (braManifest as { datasetVersion: string }).datasetVersion,
  league: () => braLeague as unknown as LeagueData,
  world: () => braWorld as unknown as DatasetWorld,
  clubChoices: () => derivedClubChoices(braLeague as unknown as LeagueData, braWorld as unknown as DatasetWorld),
  logo: () => (braWorld as unknown as DatasetWorld).competitions.find((c) => c.type === "league")?.logo,
};

/** All datasets a new career can start from. */
export function datasets(): DatasetOption[] {
  return [BRASILEIRAO];
}

/** The one a new career starts on when nobody picked. */
export const DEFAULT_DATASET_ID = BRASILEIRAO.id;

/**
 * The dataset a save names, or `undefined` when we no longer ship it.
 *
 * Undefined rather than a fallback, deliberately. This used to fall back to whichever
 * dataset happened to be first, which is the sort of default that looks harmless and
 * silently destroys data: `migrateState` reconciles a save against the dataset it is handed
 * and drops every player missing from it, so rehydrating a Série Brasil save against
 * Brasileirão squads would not fail — it would quietly return a career with no players in
 * it. A save we cannot load must say so.
 */
export function getDataset(id: string): DatasetOption | undefined {
  return datasets().find((d) => d.id === id);
}
