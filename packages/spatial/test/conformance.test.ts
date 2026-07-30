import { describe, expect, it } from "vitest";
import golden from "./__golden__/conformance.json" with { type: "json" };
import { conformanceTrace, diffTraces, type ConformanceTrace } from "../src/conformance.js";

/**
 * Checks this runtime against the committed golden trace.
 *
 * On Node this is a behaviour lock: it fails whenever match outcomes change, which
 * is the event that has to bump the engine version, because stored multiplayer
 * replays stop reproducing at that moment. In a browser or a `workerd` isolate the
 * same comparison is the portability check — same code, same golden, different
 * engine. Those runners are not wired up yet (they need Playwright and Miniflare);
 * `conformanceTrace` and `diffTraces` are deliberately free of Node built-ins so
 * they can be loaded there unchanged.
 *
 * If this fails and you did not mean to change the engine, you have found a
 * portability or determinism bug — read the step it reports, not the scoreline.
 * If you DID mean to: npx tsx packages/spatial/scripts/genGolden.ts
 */
describe("cross-runtime conformance", () => {
  const expected = golden as unknown as ConformanceTrace;

  it("reproduces the golden trace", () => {
    const actual = conformanceTrace({
      seeds: expected.seeds,
      sampleEvery: expected.sampleEvery,
      maxSteps: expected.maxSteps ?? Infinity,
    });
    const divergences = diffTraces(expected, actual);
    const report = divergences
      .map((d) => `seed ${d.seed} first differs at step ${d.step}: expected ${d.expected}, got ${d.actual}`)
      .join("\n");
    expect(divergences, `\n${report}\n`).toEqual([]);
    // The scorelines are the human-readable half — a diff in the hashes without one
    // here would mean the divergence washed out, which is worth seeing.
    expect(actual.finals).toEqual(expected.finals);
  }, 120_000);

  it("has a golden worth comparing against", () => {
    // A golden of all-0-0 matches would pass forever while testing almost nothing:
    // three match-minutes is not enough to reach a goal, a restart after one, or a
    // substitution. This asserts the committed trace actually goes somewhere.
    expect(expected.samples.length).toBeGreaterThan(30);
    expect(expected.finals.some((f) => f !== "0-0")).toBe(true);
    expect(new Set(expected.samples.map((s) => s.hash)).size).toBe(expected.samples.length);
  });

  it("diffTraces reports the FIRST divergence per seed and nothing after it", () => {
    // Once one substep differs the two are different matches, so every later sample
    // differs too and says nothing new. Reporting them all would bury the one step
    // worth reading.
    const base: ConformanceTrace = {
      seeds: [1, 2],
      sampleEvery: 10,
      maxSteps: 30,
      finals: ["0-0", "0-0"],
      samples: [
        { seed: 1, step: 10, hash: "a" },
        { seed: 1, step: 20, hash: "b" },
        { seed: 2, step: 10, hash: "c" },
        { seed: 2, step: 20, hash: "d" },
      ],
    };
    const drifted: ConformanceTrace = {
      ...base,
      samples: [
        { seed: 1, step: 10, hash: "a" },
        { seed: 1, step: 20, hash: "XX" },
        { seed: 2, step: 10, hash: "YY" },
        { seed: 2, step: 20, hash: "ZZ" },
      ],
    };
    expect(diffTraces(base, drifted)).toEqual([
      { seed: 1, step: 20, expected: "b", actual: "XX" },
      { seed: 2, step: 10, expected: "c", actual: "YY" },
    ]);
    expect(diffTraces(base, base)).toEqual([]);
  });

  it("reports a missing sample rather than passing it over", () => {
    const base: ConformanceTrace = {
      seeds: [1],
      sampleEvery: 10,
      maxSteps: 10,
      finals: ["0-0"],
      samples: [{ seed: 1, step: 10, hash: "a" }],
    };
    const truncated: ConformanceTrace = { ...base, samples: [] };
    expect(diffTraces(base, truncated)).toEqual([
      { seed: 1, step: 10, expected: "a", actual: "(missing)" },
    ]);
  });
});
