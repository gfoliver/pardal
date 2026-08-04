import type { DatasetWorld, LeagueData } from "@fut/competition";
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

/**
 * A league you can be hired into, within a dataset.
 *
 * A dataset is on its way to being a WORLD — several leagues and cups with promotion, relegation
 * and shared entrants — so a career starts by choosing the competition and only then the club. There
 * is one league today, which makes this a list of one rather than a reason to skip the step: the
 * club list is filtered by `clubIds` either way, so nothing has to change here when the second
 * league lands.
 */
export interface LeagueChoice {
  readonly id: string;
  readonly name: string;
  readonly country?: string;
  /** 1 = top flight. Sorts the list, so a second tier arrives below the first. */
  readonly tier?: number;
  readonly logo?: string;
  /** Who plays in it — the club list for this league is exactly these. */
  readonly clubIds: readonly string[];
}

/** A selectable dataset a career can be created on. */
export interface DatasetOption {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  league(): LeagueData;
  world(): DatasetWorld | undefined;
  /** The leagues within it, top flight first. */
  leagues(): LeagueChoice[];
  /** Competition badge (data URI), when the dataset supplies one. */
  logo(): string | undefined;
}

/** The dataset's league competitions, in tier order. Cups are not places you get hired. */
function leaguesOf(world?: DatasetWorld): LeagueChoice[] {
  return (world?.competitions ?? [])
    .filter((c) => c.type === "league")
    .map((c) => ({ id: c.id, name: c.name, country: c.country, tier: c.tier, logo: c.logo, clubIds: c.entrantClubIds }))
    .sort((a, b) => (a.tier ?? 99) - (b.tier ?? 99) || (a.name < b.name ? -1 : 1));
}

const BRASILEIRAO: DatasetOption = {
  id: (braManifest as { id: string }).id,
  name: (braManifest as { name: string }).name,
  version: (braManifest as { datasetVersion: string }).datasetVersion,
  league: () => braLeague as unknown as LeagueData,
  world: () => braWorld as unknown as DatasetWorld,
  leagues: () => leaguesOf(braWorld as unknown as DatasetWorld),
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
