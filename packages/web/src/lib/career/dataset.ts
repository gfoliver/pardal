import type { DatasetWorld, LeagueData } from "@fut/competition";
import braManifest from "./datasets/brasileirao/manifest.json";

/**
 * The datasets a career can be started on.
 *
 * There used to be a procedural "Série Brasil (Fictícia)" here — twelve invented clubs with
 * generated squads — which existed to have something to play before a real dataset was
 * assembled. The Brasileirão one supersedes it entirely (real squads, market values, crests,
 * a cup), so it is gone rather than left as a second thing to keep working.
 *
 * SPLIT IN TWO, and this is the point of the module: what a dataset SAYS about itself is cheap,
 * what it CONTAINS is not. `league.json` and `world.json` are 1.7 MB together — they were static
 * imports, so they landed in the entry chunk and made up 67% of it. Nothing could paint until the
 * browser had downloaded and parsed all of it, and shipping a one-line UI fix invalidated the whole
 * bundle, dataset included. (855 kB when that was measured, on one division; the second one doubled
 * it, which is the argument holding rather than weakening.)
 *
 * So the registry below holds only the manifest (1 kB, still static, so a save list can name its
 * dataset instantly) plus a `fetch` that dynamic-imports the heavy pair on demand. Everything that
 * needs real squads is already behind an await — booting a save, starting one — and everything that
 * runs INSIDE a career reads `loadedDataset`, because by then it is in memory.
 */

// --- dataset registry -------------------------------------------------------

/**
 * A league you can be hired into, within a dataset.
 *
 * A dataset IS a world — several leagues and cups with promotion, relegation and shared entrants —
 * so a career starts by choosing the competition and only then the club. Two leagues today, Série A
 * and Série B, and the flow did not have to change when the second arrived: the club list is
 * filtered by `clubIds`, and `leaguesOf` sorts by tier so the second tier lands below the first.
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

/** What we know about a dataset without loading it. Comes from the manifest alone. */
export interface DatasetInfo {
  readonly id: string;
  readonly name: string;
  readonly version: string;
}

/** A dataset with its reference data in memory. */
export interface Dataset extends DatasetInfo {
  league(): LeagueData;
  world(): DatasetWorld | undefined;
  /** The leagues within it, top flight first. */
  leagues(): LeagueChoice[];
  /** Competition badge (data URI), when the dataset supplies one. */
  logo(): string | undefined;
}

/** A dataset we ship: its manifest, and how to go and get the rest. */
interface Shipped extends DatasetInfo {
  fetch(): Promise<{ league: LeagueData; world: DatasetWorld }>;
}

const BRASILEIRAO: Shipped = {
  id: (braManifest as { id: string }).id,
  name: (braManifest as { name: string }).name,
  version: (braManifest as { datasetVersion: string }).datasetVersion,
  // Both at once: a career needs the world for club metadata the moment it needs the league, so
  // fetching them in series would just add a round trip.
  fetch: async () => {
    const [league, world] = await Promise.all([
      import("./datasets/brasileirao/league.json"),
      import("./datasets/brasileirao/world.json"),
    ]);
    return {
      league: league.default as unknown as LeagueData,
      world: world.default as unknown as DatasetWorld,
    };
  },
};

const SHIPPED: readonly Shipped[] = [BRASILEIRAO];

/** The dataset's league competitions, in tier order. Cups are not places you get hired. */
function leaguesOf(world?: DatasetWorld): LeagueChoice[] {
  return (world?.competitions ?? [])
    .filter((c) => c.type === "league")
    .map((c) => ({ id: c.id, name: c.name, country: c.country, tier: c.tier, logo: c.logo, clubIds: c.entrantClubIds }))
    .sort((a, b) => (a.tier ?? 99) - (b.tier ?? 99) || (a.name < b.name ? -1 : 1));
}

/** Every dataset a new career can start from, by name — without downloading any of them. */
export function datasetInfos(): readonly DatasetInfo[] {
  return SHIPPED;
}

/** The one a new career starts on when nobody picked. */
export const DEFAULT_DATASET_ID = BRASILEIRAO.id;

/**
 * Do we still ship the dataset a save names?
 *
 * Answered from the manifest, so the save list can mark a slot unplayable without fetching 855 kB
 * to find out.
 */
export function isShipped(id: string): boolean {
  return SHIPPED.some((d) => d.id === id);
}

const loaded = new Map<string, Dataset>();
const loading = new Map<string, Promise<Dataset | undefined>>();

/**
 * The dataset, already in memory.
 *
 * For code that runs inside a career, where the dataset was loaded before the career existed. Never
 * a fallback for "not loaded yet" — it returns undefined, and a caller that would rather wait wants
 * `loadDataset`.
 */
export function loadedDataset(id: string): Dataset | undefined {
  return loaded.get(id);
}

/**
 * Fetch a dataset's reference data, once.
 *
 * `undefined` rather than a fallback when we no longer ship it, deliberately. This used to fall back
 * to whichever dataset happened to be first, which is the sort of default that looks harmless and
 * silently destroys data: `migrateState` reconciles a save against the dataset it is handed and
 * drops every player missing from it, so rehydrating a Série Brasil save against Brasileirão squads
 * would not fail — it would quietly return a career with no players in it. A save we cannot load
 * must say so.
 */
export function loadDataset(id: string): Promise<Dataset | undefined> {
  const already = loaded.get(id);
  if (already) return Promise.resolve(already);
  // Two screens can ask at once — the boot path and a click. One download either way.
  const inFlight = loading.get(id);
  if (inFlight) return inFlight;

  const shipped = SHIPPED.find((d) => d.id === id);
  if (!shipped) return Promise.resolve(undefined);

  const promise = shipped.fetch().then(
    ({ league, world }) => {
      const ds: Dataset = {
        id: shipped.id,
        name: shipped.name,
        version: shipped.version,
        league: () => league,
        world: () => world,
        leagues: () => leaguesOf(world),
        // The TOP flight's badge stands for the dataset. Reading the first league in array order
        // happened to give that while there was one; with a second tier in the file it is the
        // emitter's ordering deciding what the save list shows, so ask for tier order instead.
        logo: () => leaguesOf(world)[0]?.logo,
      };
      loaded.set(id, ds);
      loading.delete(id);
      return ds;
    },
    (err: unknown) => {
      // Not cached as a failure: a dropped connection should not make the dataset permanently
      // missing for the rest of the session.
      loading.delete(id);
      throw err;
    },
  );
  loading.set(id, promise);
  return promise;
}
