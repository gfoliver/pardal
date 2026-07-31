import { describe, expect, it } from "vitest";
import { digest, firstDivergence, HashDomain, prefixChain } from "../src/hash.js";
import { engineFor, MatchProtocol } from "../src/match.js";

describe("domain-separated hashing", () => {
  it("gives the same value the same digest", async () => {
    const value = { matchId: "m1", seed: 7 };
    expect(await digest(HashDomain.MatchInput, value)).toBe(
      await digest(HashDomain.MatchInput, value),
    );
  });

  it("is insensitive to key order, like the canonical form it hashes", async () => {
    expect(await digest(HashDomain.Lineup, { a: 1, b: 2 })).toBe(
      await digest(HashDomain.Lineup, { b: 2, a: 1 }),
    );
  });

  it("gives the SAME value different digests under different domains", async () => {
    // The point of the tag: without it, a hash computed as a lineup commitment is a
    // valid hash of the same bytes as a result root, and one can be presented as the
    // other.
    const value = { x: 1 };
    const a = await digest(HashDomain.Lineup, value);
    const b = await digest(HashDomain.ResultRoot, value);
    expect(a).not.toBe(b);
  });

  it("cannot be confused by a tag boundary", async () => {
    // Length-prefixing the tag is what makes this impossible. With a plain separator,
    // a crafted payload could reproduce another tag's preimage.
    const a = await digest(HashDomain.Lineup, "x");
    const b = await digest(HashDomain.ResultRoot, "x");
    const c = await digest(HashDomain.Lineup, `${HashDomain.ResultRoot}"x"`);
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it("produces 64 hex characters", async () => {
    expect(await digest(HashDomain.MatchInput, {})).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("prefix chain", () => {
  const events = [{ minute: 1 }, { minute: 2 }, { minute: 3 }, { minute: 4 }];

  it("commits to every prefix, so a divergence can be bisected", async () => {
    const chain = await prefixChain(HashDomain.EventPrefix, events);
    expect(chain).toHaveLength(4);
    expect(new Set(chain).size).toBe(4);
    // A prefix's digest depends only on that prefix, which is what makes a binary
    // search over the chain meaningful.
    const shorter = await prefixChain(HashDomain.EventPrefix, events.slice(0, 2));
    expect(shorter).toEqual(chain.slice(0, 2));
  });

  it("locates the FIRST differing element", async () => {
    const mine = await prefixChain(HashDomain.EventPrefix, events);
    const theirs = await prefixChain(HashDomain.EventPrefix, [
      { minute: 1 },
      { minute: 2 },
      { minute: 99 },
      { minute: 4 },
    ]);
    expect(firstDivergence(mine, theirs)).toBe(2);
    // Everything after the first difference differs too and says nothing new.
    expect(mine[3]).not.toBe(theirs[3]);
  });

  it("says nothing when one run is simply shorter", async () => {
    const full = await prefixChain(HashDomain.EventPrefix, events);
    expect(firstDivergence(full, full.slice(0, 2))).toBeNull();
    expect(firstDivergence(full, full)).toBeNull();
  });
});

describe("engine selection", () => {
  it("uses the zone engine only when no person is playing", () => {
    expect(engineFor({ homeIsHuman: false, awayIsHuman: false })).toBe("zone");
    expect(engineFor({ homeIsHuman: true, awayIsHuman: false })).toBe("spatial");
    expect(engineFor({ homeIsHuman: false, awayIsHuman: true })).toBe("spatial");
    expect(engineFor({ homeIsHuman: true, awayIsHuman: true })).toBe("spatial");
  });
});

describe("pinned protocol constants", () => {
  it("leaves nobody managing their own bench", () => {
    // The live divergence this closes: the career's watched path passes a
    // manualSubsTeamId and its quick-sim path does not, so the same seed produces two
    // different matches. An attester who is not a participant has no human bench, so
    // "nobody" is the only value everyone can agree on.
    expect(MatchProtocol.manualSubsTeamId).toBeUndefined();
  });

  it("starts every player fully fit", () => {
    // The spatial engine seeds live stamina from pre-match condition, so any
    // disagreement about fitness is a disagreement about the match.
    expect(MatchProtocol.condition).toBe(1);
  });
});
