import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { DatasetWorld, LeagueData } from "@fut/competition";
import { datasetContentHash } from "../src/index.js";

/**
 * The committed artifact against the hash committed beside it.
 *
 * This is the guard that makes the hash worth anything. `datasetContentHash` being correct is not the
 * risk — the risk is a build that changes the data and ships a manifest still naming the old hash, or
 * an app copy that drifted from the source copy because somebody rebuilt without `--emit-to`. Either
 * one hands a client a roster identity that does not describe the roster it holds, which in a fixture
 * reads as a mismatch on an honest pair.
 *
 * Both copies are checked, and checked against EACH OTHER, because the app bundles one and the dataset
 * commands own the other. They are the same dataset or one of them is stale.
 */

const path = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const COPIES = {
  "dataset/data": path("../data/brasileirao"),
  "web app copy": path("../../web/src/lib/career/datasets/brasileirao"),
};

const read = (dir: string) => ({
  manifest: JSON.parse(readFileSync(`${dir}/manifest.json`, "utf8")) as { contentHash?: string; datasetVersion: string },
  league: JSON.parse(readFileSync(`${dir}/league.json`, "utf8")) as LeagueData,
  world: JSON.parse(readFileSync(`${dir}/world.json`, "utf8")) as DatasetWorld,
});

describe("the committed dataset's content hash", () => {
  for (const [label, dir] of Object.entries(COPIES)) {
    it(`describes the data actually committed in the ${label}`, async () => {
      // Skipped rather than failed when absent: the artifact is regenerable and gitignored in part, so a
      // fresh clone that has not built yet should not see a red test about a file it was never given.
      if (!existsSync(`${dir}/manifest.json`)) return;
      const { manifest, league, world } = read(dir);
      expect(manifest.contentHash, "manifest has no contentHash — rebuild the dataset").toMatch(/^[0-9a-f]{64}$/);
      expect(manifest.contentHash).toBe(await datasetContentHash({ league, world }));
    });
  }

  it("is the same hash in both copies, so the app is not a build behind", async () => {
    const dirs = Object.values(COPIES).filter((d) => existsSync(`${d}/manifest.json`));
    if (dirs.length < 2) return;
    const [a, b] = dirs.map(read);
    expect(a!.manifest.contentHash).toBe(b!.manifest.contentHash);
  });

  /**
   * Reproducible from the FILES, which is the property a client depends on.
   *
   * A client only ever has `league.json` and `world.json` as parsed JSON — it never sees the in-memory
   * artifact the build hashed, and those two shapes differ: the object carries keys whose value is
   * `undefined` and `JSON.stringify` drops them on the way out. Hashing the object would have produced a
   * number nobody else could arrive at, which is why the hash is taken over the published form.
   */
  it("can be recomputed from the two files a client loads, with nothing else", async () => {
    const dir = COPIES["web app copy"];
    if (!existsSync(`${dir}/manifest.json`)) return;
    const league = JSON.parse(readFileSync(`${dir}/league.json`, "utf8")) as LeagueData;
    const world = JSON.parse(readFileSync(`${dir}/world.json`, "utf8")) as DatasetWorld;
    const twice = await Promise.all([datasetContentHash({ league, world }), datasetContentHash({ league, world })]);
    expect(twice[0]).toBe(twice[1]);
    expect(twice[0]).toBe((JSON.parse(readFileSync(`${dir}/manifest.json`, "utf8")) as { contentHash: string }).contentHash);
  });
});
