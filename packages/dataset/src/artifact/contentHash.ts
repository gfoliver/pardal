import type { DatasetWorld, LeagueData } from "@fut/competition";
import { digest, HashDomain } from "@fut/protocol";

/**
 * What a dataset IS, as one string.
 *
 * `datasetVersion` is an editorial label a human types, and it does not move when the data does:
 * measured over three rebuilds that changed 919 players' ratings, it stayed "1" throughout while the
 * only field that changed was each source's `fetchedAt` — a wall clock, which moves even when the data
 * does not. So the artifact's identity was exactly backwards, stable when it should have changed and
 * unstable when it should not.
 *
 * That is fatal for multiplayer rather than untidy. A `MatchRecord` names the roster its player ids
 * resolve against, and a client has to be able to answer "I hold that roster" before it simulates. Two
 * clients on different builds both calling themselves version 1 produce a roster mismatch on a
 * perfectly honest pair, with nothing in the data to explain it. `ENGINE_VERSION` solved the same
 * problem for the simulation the same way, and for the same reason: a content hash cannot be forgotten.
 *
 * OVER WHAT THE GAME READS, and nothing else — `league.json` and `world.json`, the two files an app
 * bundles. Not `raw.json`, which is an input ten times the size that no client ever sees, and not the
 * evidence sidecar, which records how the build ran rather than what it produced. Two builds from
 * different scrape sessions that arrive at identical squads are the same dataset, and this says so.
 *
 * Canonical JSON and a domain-separated digest, so a client, the server and this build cannot drift
 * apart on encoding — the hash is only worth having if everybody computes it identically.
 */
export function datasetContentHash(artifact: { readonly league: LeagueData; readonly world: DatasetWorld }): Promise<string> {
  return digest(HashDomain.Dataset, published({ league: artifact.league, world: artifact.world }));
}

/**
 * The artifact as PUBLISHED, which is not the same object as the one in memory.
 *
 * `canonicalJson` refuses a property whose value is `undefined` rather than dropping it, because `{a:
 * undefined}` and `{}` are different objects that would otherwise hash alike. That refusal caught
 * something worth catching here: the in-memory artifact carries present-but-undefined keys (an
 * outfielder's `naturalPositions`, for one) and `JSON.stringify` silently omits them when the file is
 * written. So the object and the file it becomes are different shapes, and a hash of the object is one
 * NO CLIENT COULD EVER REPRODUCE — it only ever sees `league.json`.
 *
 * The round trip is therefore not a workaround for the guard, it is the definition: what is hashed is
 * the data as it is published, arrived at by the same `JSON.stringify` that writes the files, so
 * "recompute it from the two files you loaded" is literally true.
 */
function published<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}
