import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildArtifact, loadArtifact, writeArtifact } from "../src/artifact/store.js";
import type { RawSnapshot } from "@fut/dataset";

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
});
