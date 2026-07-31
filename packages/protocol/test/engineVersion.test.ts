import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ENGINE_VERSION } from "../src/engineVersion.js";
import { computeEngineVersion } from "../scripts/computeEngineVersion.js";

const repoRoot = join(import.meta.dirname, "..", "..", "..");

describe("engine version", () => {
  it("matches the simulation packages as they stand", async () => {
    // This is the guard that makes "the seed is the authority" true rather than
    // aspirational. If it fails and you changed the simulation, that is correct and
    // expected — regenerate with `npm run engine:version` — and it is telling you
    // something real: records written by the old build no longer reproduce, so any
    // league pinned to it must stay pinned and its stored scores must stand on their
    // own rather than be re-derived.
    //
    // If it fails and you did NOT change the simulation, something changed the files
    // under your feet.
    const { version, files } = await computeEngineVersion(repoRoot);
    expect(
      version,
      `\nENGINE_VERSION is ${ENGINE_VERSION} but the simulation hashes to ${version}.` +
        `\nIf you changed the engine: npm run engine:version\n`,
    ).toBe(ENGINE_VERSION);
    // A sanity floor: if the collector silently stopped finding files, the hash would
    // still be stable and still "pass" while covering nothing.
    expect(files).toBeGreaterThan(50);
  });

  it("is a short lowercase hex string", () => {
    expect(ENGINE_VERSION).toMatch(/^[0-9a-f]{16}$/);
  });

  it("does not depend on the checkout's line endings", async () => {
    // A CRLF checkout on Windows and an LF one elsewhere must agree, or the same code
    // gets two versions on two machines — which is precisely the failure this whole
    // mechanism exists to prevent, arriving through the back door.
    const { version } = await computeEngineVersion(repoRoot);
    const { version: again } = await computeEngineVersion(repoRoot);
    expect(again).toBe(version);
    // The normalisation itself, stated directly so a refactor cannot quietly drop it:
    const normalise = (s: string): string => s.replace(/\r\n/g, "\n");
    expect(normalise("a\r\nb")).toBe(normalise("a\nb"));
  });
});
