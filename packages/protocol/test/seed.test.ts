import { describe, expect, it } from "vitest";
import { Formation, MarkingScheme, Mentality, Position } from "@fut/domain";
import { deriveSeed, lineupHash, type SeedInputs, type TeamInput } from "../src/index.js";

/**
 * The seed, which is the only authority in the multiplayer model.
 *
 * The server cannot re-simulate a match to check one — 6.3 seconds of CPU against a 10 ms budget — so
 * everything rests on the seed being tied to the lineups and unknowable before they are sealed. These
 * tests are that claim written down: each one is a way a player could otherwise choose his own
 * randomness.
 */

const KEY = "a-server-key-that-never-leaves-the-worker";

const team = (over: Partial<TeamInput> = {}): TeamInput => ({
  clubId: "c1",
  startingXi: ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10", "p11"],
  bench: ["p12", "p13", "p14", "p15", "p16"],
  instructions: {
    formation: Formation.F442,
    mentality: Mentality.Balanced,
    tempo: 0.5,
    pressing: 0.5,
    lineHeight: 0.5,
    width: 0.5,
    directness: 0.5,
    markingScheme: MarkingScheme.Zonal,
  },
  roles: { p1: "sweeper-keeper" },
  fieldedPositions: { p1: Position.Goalkeeper },
  coachId: "coach-1",
  ...over,
});

const inputs = async (over: Partial<SeedInputs> = {}): Promise<SeedInputs> => ({
  matchId: "m-1",
  engineVersion: "e-1",
  homeLineupHash: await lineupHash({ matchId: "m-1", teamId: "c1", engineVersion: "e-1", input: team() }),
  awayLineupHash: await lineupHash({ matchId: "m-1", teamId: "c2", engineVersion: "e-1", input: team({ clubId: "c2" }) }),
  ...over,
});

describe("deriving a match seed", () => {
  it("is a 32-bit unsigned integer, which is what the engines take", async () => {
    const seed = await deriveSeed(KEY, await inputs());
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThanOrEqual(0xffff_ffff);
  });

  it("gives the same seed for the same inputs, or nobody could reproduce the match", async () => {
    const args = await inputs();
    expect(await deriveSeed(KEY, args)).toBe(await deriveSeed(KEY, args));
    // And from a freshly built copy of the same values, not just the same object.
    expect(await deriveSeed(KEY, { ...args })).toBe(await deriveSeed(KEY, args));
  });

  /**
   * The property that closes seed-shopping. If a lineup could be changed without changing the seed, a
   * player could hold his team back, learn the randomness, and then pick the eleven that suits it.
   */
  it("changes when ANY part of a lineup changes, down to one instruction", async () => {
    const base = await inputs();
    const seed = await deriveSeed(KEY, base);
    const variants = await Promise.all([
      team({ startingXi: ["p11", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10", "p1"] }), // order
      team({ bench: ["p16", "p13", "p14", "p15", "p12"] }), // the bench IS load-bearing: the engine subs from it
      team({ instructions: { ...team().instructions, tempo: 0.9 } }),
      team({ roles: { p1: "keeper" } }),
      team({ coachId: "coach-2" }),
    ].map(async (t) => {
      const homeLineupHash = await lineupHash({ matchId: "m-1", teamId: "c1", engineVersion: "e-1", input: t });
      return deriveSeed(KEY, { ...base, homeLineupHash });
    }));
    for (const v of variants) expect(v).not.toBe(seed);
    // All five differ from each other too — a collision would mean the hash is ignoring a field.
    expect(new Set([seed, ...variants]).size).toBe(6);
  });

  it("differs per fixture, so two identical line-ups never replay the same match", async () => {
    const a = await inputs({ matchId: "m-1" });
    const b = await inputs({ matchId: "m-2" });
    expect(await deriveSeed(KEY, b)).not.toBe(await deriveSeed(KEY, a));
  });

  it("differs per engine version, because a different engine is a different match", async () => {
    const base = await inputs();
    expect(await deriveSeed(KEY, { ...base, engineVersion: "e-2" })).not.toBe(await deriveSeed(KEY, base));
  });

  it("is not symmetric: swapping the two sides is a different fixture", async () => {
    const base = await inputs();
    const swapped = { ...base, homeLineupHash: base.awayLineupHash, awayLineupHash: base.homeLineupHash };
    expect(await deriveSeed(KEY, swapped)).not.toBe(await deriveSeed(KEY, base));
  });

  /** Without the key this is a public function of public inputs, and every player can grind seeds. */
  it("depends on the key, and refuses to work without one", async () => {
    const args = await inputs();
    expect(await deriveSeed("another-key", args)).not.toBe(await deriveSeed(KEY, args));
    await expect(deriveSeed("", args)).rejects.toThrow(/SERVER_SEED/);
  });
});

describe("sealing a lineup", () => {
  /**
   * A commitment that fits more than one situation commits to nothing. Both of these would otherwise be
   * replayable: the same eleven offered for another fixture, or entered as the opponent.
   */
  it("binds the submission to the fixture and the side", async () => {
    const input = team();
    const mine = await lineupHash({ matchId: "m-1", teamId: "c1", engineVersion: "e-1", input });
    expect(await lineupHash({ matchId: "m-2", teamId: "c1", engineVersion: "e-1", input })).not.toBe(mine);
    expect(await lineupHash({ matchId: "m-1", teamId: "c2", engineVersion: "e-1", input })).not.toBe(mine);
    expect(await lineupHash({ matchId: "m-1", teamId: "c1", engineVersion: "e-2", input })).not.toBe(mine);
  });

  it("is a hex digest, and the same for the same submission", async () => {
    const args = { matchId: "m-1", teamId: "c1", engineVersion: "e-1", input: team() } as const;
    const first = await lineupHash(args);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(await lineupHash({ ...args, input: team() })).toBe(first);
  });
});
