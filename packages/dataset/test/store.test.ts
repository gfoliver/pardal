import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildArtifact, loadArtifact, writeArtifact } from "../src/artifact/store.js";
import { ARTIFACT_FILES, type RawSnapshot } from "@fut/dataset";
import { mergeSources } from "../src/sources/mergeSources.js";

const SAMPLE: RawSnapshot = JSON.parse(
  readFileSync(fileURLToPath(new URL("../data/brasileirao-serie-a/raw.json", import.meta.url)), "utf8"),
);

describe("artifact store", () => {
  it("writes then loads an artifact byte-for-byte", () => {
    const { artifact } = buildArtifact(SAMPLE, { name: "Brasileirão Série A", slug: "bra-test", sources: [{ id: "raw", version: "1", fetchedAt: "2026-01-01T00:00:00.000Z" }] });
    const dir = writeArtifact(mkdtempSync(join(tmpdir(), "fut-ds-")), artifact);
    const loaded = loadArtifact(dir);
    expect(loaded.manifest).toEqual(artifact.manifest);
    expect(loaded.league).toEqual(artifact.league);
    expect(loaded.world).toEqual(artifact.world);
    expect(loaded.evidence.players.length).toBe(artifact.evidence.players.length);
  });

  /**
   * The two-layer contract: enrichment must reach the emitted dataset WITHOUT
   * being folded back into raw.json. Otherwise the next Transfermarkt re-scrape
   * overwrites a file that had grown extra facts, and they vanish silently.
   */
  it("emits from the enriched snapshot but writes back the pristine one", () => {
    const enrichedPlayer = { ...SAMPLE.players[0]!, photo: "https://cdn/x.png" };
    const effective = mergeSources([SAMPLE, { players: [enrichedPlayer] }]);
    expect(SAMPLE.players[0]!.photo).toBeUndefined(); // the input really is unenriched

    const { artifact } = buildArtifact(SAMPLE, {
      name: "Brasileirão Série A", slug: "bra-test", effective,
      sources: [{ id: "raw", version: "1", fetchedAt: "2026-01-01T00:00:00.000Z" }],
    });
    const dir = writeArtifact(mkdtempSync(join(tmpdir(), "fut-ds-")), artifact);

    const emitted = artifact.league.teams.flatMap((t) => t.players).find((p) => p.id === enrichedPlayer.id);
    expect(emitted!.photo).toBe("https://cdn/x.png"); // the photo made it out

    const rewritten: RawSnapshot = JSON.parse(readFileSync(join(dir, ARTIFACT_FILES.raw), "utf8"));
    expect(rewritten.players.find((p) => p.id === enrichedPlayer.id)!.photo).toBeUndefined();
  });

  it("credits TheSportsDB in the manifest only when it actually contributed", () => {
    const opts = { name: "n", slug: "s", sources: [{ id: "transfermarkt", version: "1", fetchedAt: "t" }] };
    expect(buildArtifact(SAMPLE, opts).artifact.manifest.attribution).not.toMatch(/thesportsdb/i);

    const withTsdb = buildArtifact(SAMPLE, { ...opts, sources: [...opts.sources, { id: "thesportsdb", version: "v1-1", fetchedAt: "t" }] });
    expect(withTsdb.artifact.manifest.attribution).toMatch(/thesportsdb/i);
  });
});
