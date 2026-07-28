import { describe, expect, it } from "vitest";
import { Position } from "@fut/domain";
import { applyPesRatings, distributionOf, type PesRatedPlayer, type PesRatings } from "../src/index.js";
import type { InferredPlayer } from "../src/infer/InferAttributes.js";
import { attr } from "../src/infer/Attribute.js";

/**
 * Real ratings replacing guessed ones — and what happens to the players the
 * source has never heard of.
 *
 * The second half is the delicate part. Measured against the live source, it
 * covers 69% of a Brazilian top-flight dataset and the missing 31% are almost
 * entirely teenagers. Left on the inferred scale they would have sat ~15 points
 * below everyone else and every squad would visibly split into two castes.
 */

const flat = (v: number) => ({ value: v, confidence: 0.4, source: "prior" as const });
function inferred(id: string, position: Position, value: number): InferredPlayer {
  const g = <K extends string>(keys: readonly K[]) =>
    Object.fromEntries(keys.map((k) => [k, attr(value, 0.4, "prior")])) as Record<K, ReturnType<typeof attr>>;
  return {
    id,
    name: id,
    clubId: "c1",
    position,
    secondaryPositions: [],
    nationality: ["Brazil"],
    ageYears: 25,
    overall: value,
    physical: g(["pace", "stamina", "strength", "agility"] as const),
    mental: g(["decisions", "composure", "workRate", "teamwork", "aggression", "anticipation", "positioning", "vision"] as const),
    technical: g(["passing", "technique", "dribbling", "finishing", "shotPower", "tackling", "marking", "crossing"] as const),
    goalkeeping: g(["reflexes", "handling", "positioning", "oneOnOnes"] as const),
  };
}
void flat;

const ratings = (overall: number, tilt: Partial<PesRatings> = {}): PesRatedPlayer => ({
  overall,
  ratings: {
    topSpeed: 75, acceleration: 75, stamina: 75, balance: 75, jump: 75, agility: 75,
    mentality: 75, response: 75, aggression: 75, teamWork: 75, longPassAccuracy: 75,
    shortPassAccuracy: 75, technique: 75, dribbleAccuracy: 75, dribbleSpeed: 75,
    shotAccuracy: 75, shotPower: 75, shotTechnique: 75, freeKickAccuracy: 75, swerve: 75,
    defense: 75, heading: 75, goalKeeping: 75, ...tilt,
  },
});

const outfield = (id: string, v = 55) => inferred(id, Position.CentralMidfielder, v);

describe("replacing inference with real ratings", () => {
  it("gives a rated player the overall the source states", () => {
    const { players, report } = applyPesRatings([outfield("a")], new Map([["a", ratings(82)]]));
    expect(report.rated).toBe(1);
    expect(players[0]!.overall).toBe(82);
  });

  it("marks the attributes as sourced, not guessed, so the UI can say so", () => {
    const { players } = applyPesRatings([outfield("a")], new Map([["a", ratings(80)]]));
    expect(players[0]!.physical.pace.source).toBe("community");
    expect(players[0]!.physical.pace.confidence).toBeGreaterThan(0.9);
  });

  it("keeps a rated player's shape — a stopper is not suddenly a finisher", () => {
    const { players } = applyPesRatings(
      [outfield("a")],
      new Map([["a", ratings(78, { defense: 90, shotAccuracy: 40, shotTechnique: 40 })]]),
    );
    const p = players[0]!;
    expect(p.technical.tackling.value).toBeGreaterThan(p.technical.finishing.value);
  });

  it("preserves the input order, which the emit stage relies on", () => {
    const ids = ["a", "b", "c", "d"];
    const { players } = applyPesRatings(ids.map((i) => outfield(i)), new Map([["c", ratings(80)]]));
    expect(players.map((p) => p.id)).toEqual(ids);
  });
});

describe("the players the source doesn't cover", () => {
  /** Ten rated players around 78, plus five unrated guesses down at 50. */
  function mixed() {
    const rated = Array.from({ length: 10 }, (_, i) => outfield(`r${i}`, 55));
    const unrated = Array.from({ length: 5 }, (_, i) => outfield(`u${i}`, 50 + i));
    const map = new Map(rated.map((p, i) => [p.id, ratings(74 + (i % 5) * 2)] as const));
    return applyPesRatings([...rated, ...unrated], map);
  }

  it("moves them onto the rated population's scale, not the other way round", () => {
    const { players, report } = mixed();
    expect(report.rated).toBe(10);
    expect(report.backfilled).toBe(5);
    const unrated = players.filter((p) => p.id.startsWith("u"));
    // They started at 50-54 on the inferred scale; the rated ones live near 78.
    for (const p of unrated) expect(p.overall).toBeGreaterThan(60);
  });

  it("lands them just below the rated players, not in a separate caste", () => {
    const { players, report } = mixed();
    const unrated = players.filter((p) => p.id.startsWith("u")).map((p) => p.overall);
    const mean = distributionOf(unrated).mean;
    expect(mean).toBeLessThan(report.ratedMean);
    expect(report.ratedMean - mean).toBeLessThan(6);
  });

  it("keeps the pecking order among themselves", () => {
    const { players } = mixed();
    const unrated = players.filter((p) => p.id.startsWith("u"));
    for (let i = 1; i < unrated.length; i++) {
      expect(unrated[i]!.overall).toBeGreaterThanOrEqual(unrated[i - 1]!.overall);
    }
  });

  it("does NOT claim more confidence for a rescaled guess", () => {
    const { players } = mixed();
    const u = players.find((p) => p.id.startsWith("u"))!;
    // Moving a guess onto a better scale makes it comparable, not better founded.
    expect(u.physical.pace.source).toBe("prior");
    expect(u.physical.pace.confidence).toBeLessThan(0.9);
  });
});

describe("degenerate inputs", () => {
  it("leaves inference untouched when nothing is rated", () => {
    const before = [outfield("a"), outfield("b")];
    const { players, report } = applyPesRatings(before, new Map());
    expect(report.rated).toBe(0);
    expect(players.map((p) => p.overall)).toEqual(before.map((p) => p.overall));
  });

  it("handles a squad where EVERY player is rated", () => {
    const ids = ["a", "b"];
    const { players, report } = applyPesRatings(
      ids.map((i) => outfield(i)),
      new Map(ids.map((i, k) => [i, ratings(70 + k * 8)] as const)),
    );
    expect(report.backfilled).toBe(0);
    expect(players.map((p) => p.overall)).toEqual([70, 78]);
  });

  it("rates a goalkeeper off the goalkeeping numbers", () => {
    const gk = inferred("gk", Position.Goalkeeper, 55);
    const { players } = applyPesRatings([gk], new Map([["gk", ratings(80, { goalKeeping: 88 })]]));
    expect(players[0]!.overall).toBe(80);
    expect(players[0]!.goalkeeping.reflexes.source).toBe("community");
  });

  it("never emits a rating outside 1..99", () => {
    const { players } = applyPesRatings(
      [outfield("a"), outfield("b")],
      new Map([["a", ratings(99)], ["b", ratings(1)]]),
    );
    for (const p of players) {
      for (const g of [p.physical, p.mental, p.technical, p.goalkeeping]) {
        for (const a of Object.values(g)) {
          expect(a.value).toBeGreaterThanOrEqual(1);
          expect(a.value).toBeLessThanOrEqual(99);
        }
      }
    }
  });
});
