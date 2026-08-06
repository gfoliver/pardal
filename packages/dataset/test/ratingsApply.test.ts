import { describe, expect, it } from "vitest";
import { Position } from "@fut/domain";
import { applyRatings, distributionOf, REQUIRED_LABELS, SCALE_ANCHORS, toOurScale, type RatedPlayer } from "../src/index.js";
import type { InferredPlayer } from "../src/infer/InferAttributes.js";
import { attr } from "../src/infer/Attribute.js";

/**
 * Real ratings replacing guessed ones — and what happens to the players the source has never
 * heard of.
 *
 * The second half is the delicate part. Measured against the live source it covers 81% of a
 * Brazilian top-flight dataset and the missing 19% are mostly teenagers and late signings. Left on
 * the inferred scale they would sit well below everyone else and every squad would visibly split
 * into two castes; rescaled without a ceiling they came out ABOVE the internationals, because
 * being absent from a ratings database is not a claim to be elite.
 */

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
    mental: g(["decisions", "composure", "workRate", "teamwork", "aggression", "anticipation", "positioning", "vision", "offTheBall"] as const),
    technical: g(["passing", "technique", "dribbling", "finishing", "shotPower", "tackling", "marking", "crossing", "firstTouch", "heading"] as const),
    goalkeeping: g(["reflexes", "handling", "positioning", "oneOnOnes"] as const),
  };
}

/** A complete source row on FM's native 1–20. */
const rated = (v: number, tilt: Record<string, number> = {}, labels = REQUIRED_LABELS.outfield): RatedPlayer => ({
  attributes: { ...Object.fromEntries(labels.map((l) => [l, v])), ...tilt },
});

const outfield = (id: string, v = 55) => inferred(id, Position.CentralMidfielder, v);

describe("replacing inference with real ratings", () => {
  /**
   * Quality is ABSOLUTE, not relative to whoever else got loaded. The source's 1–20 is a global
   * scale and `SCALE_ANCHORS` maps it with a fixed curve, so a strong player rates strong even on
   * his own — and, more to the point, a strong LEAGUE rates stronger than a weak one instead of
   * both being normalised to the same centre.
   */
  it("rates a lone player on the curve, not relative to the squad he arrived with", () => {
    const { players, report } = applyRatings([outfield("a")], new Map([["a", rated(17)]]));
    expect(report.rated).toBe(1);
    /*
     * NOT asserted as `toOurScale(17)` any more, and the reason is the point of the per-attribute
     * calibration: a flat 17 across every label is not a flat player. Each attribute is shifted onto
     * its own group's centre first, because the source does not use its 1–20 the same way twice — a 17
     * for Finishing is a rarer thing than a 17 for Agility. So the exact number depends on which
     * attributes this position weights, which is correct and is why the equality was dropped rather
     * than updated to a new constant.
     *
     * Nor is it asserted against the league-star anchor any more: a flat 17 central midfielder comes
     * out at 82 rather than 85, because the attributes his position weights — passing, stamina, work
     * rate, technique — are the ABUNDANT ones, where a 17 is a smaller distinction than a 17 for
     * finishing. That is the calibration doing its job, not a regression, so the claim is stated at the
     * level that is actually model-wide: comfortably clear of a squad player.
     *
     * What this test is really for is the INVARIANCE below — he is placed by the curve alone, so he
     * rates the same whether he arrived on his own or in a crowd.
     */
    expect(players[0]!.overall).toBeGreaterThan(SCALE_ANCHORS.squadPlayer.ours);
    const crowd = applyRatings(
      [outfield("a"), outfield("b"), outfield("c")],
      new Map([["a", rated(17)], ["b", rated(17)], ["c", rated(17)]]),
    );
    expect(crowd.players[0]!.overall).toBe(players[0]!.overall);
  });

  it("ranks a better source row above a worse one", () => {
    const { players } = applyRatings(
      [outfield("a"), outfield("b")],
      new Map([["a", rated(17)], ["b", rated(9)]]),
    );
    expect(players[0]!.overall).toBeGreaterThan(players[1]!.overall);
  });

  it("marks the attributes as sourced, not guessed, so the UI can say so", () => {
    const { players } = applyRatings([outfield("a")], new Map([["a", rated(14)]]));
    expect(players[0]!.physical.pace.source).toBe("community");
    expect(players[0]!.physical.pace.confidence).toBeGreaterThan(0.9);
  });

  it("keeps a rated player's shape — a stopper is not suddenly a finisher", () => {
    const { players } = applyRatings(
      [outfield("a")],
      new Map([["a", rated(12, { Tackling: 18, Marking: 17, Finishing: 4 })]]),
    );
    const p = players[0]!;
    expect(p.technical.tackling.value).toBeGreaterThan(p.technical.finishing.value);
  });

  it("preserves the input order, which the emit stage relies on", () => {
    const ids = ["a", "b", "c", "d"];
    const { players } = applyRatings(ids.map((i) => outfield(i)), new Map([["c", rated(14)]]));
    expect(players.map((p) => p.id)).toEqual(ids);
  });

  /**
   * Regression: the source publishes no outfield technicals for a keeper, and a neutral fill would
   * have given every goalkeeper in the league a fabricated `finishing` marked as sourced data.
   *
   * An attribute the source never published stays labelled as a guess. Its VALUE does move, with
   * the same scale transform as everything else — a player has to be internally on one scale, or a
   * keeper's sourced `handling` and his inferred `finishing` would be numbers from two different
   * rulers sitting in the same record.
   */
  it("keeps an unpublished attribute labelled as a guess, and never raises its confidence", () => {
    const gk = inferred("gk", Position.Goalkeeper, 55);
    const { players } = applyRatings([gk], new Map([["gk", rated(15, {}, REQUIRED_LABELS.goalkeeper)]]));
    const p = players[0]!;
    expect(p.goalkeeping.reflexes.source).toBe("community");
    expect(p.technical.finishing.source).toBe("prior");
    expect(p.technical.finishing.confidence).toBe(gk.technical.finishing.confidence);
  });

  it("does not overwrite an OUTFIELDER's goalkeeping with source numbers", () => {
    // The source has no keeper labels on an outfield page, so his inferred ones must stand rather
    // than be filled from nothing.
    const { players } = applyRatings([outfield("a")], new Map([["a", rated(16)]]));
    expect(players[0]!.goalkeeping.reflexes.source).toBe("prior");
  });
});

describe("placing the source's global scale on ours", () => {
  /**
   * A league shaped like the real one: a broad middle on the source's 1–20, one standout, and one
   * fringe player. The source's own 20 means "best in the world", so a mid-tier league centres near
   * 11 — and adopting that unchanged put the whole competition ~16 points too low for the engine.
   */
  const league = () => {
    const bulk = Array.from({ length: 60 }, (_, i) => outfield(`p${i}`, 55));
    const map = new Map<string, RatedPlayer>(bulk.map((p, i) => [p.id, rated(9 + (i % 6))] as const));
    map.set("p0", rated(18)); // the standout
    map.set("p1", rated(5)); // the fringe player
    return applyRatings(bulk, map);
  };

  it("puts a mid-tier league near the squad-player anchor, not near the top of the scale", () => {
    const { report } = league();
    // The source centres such a league around its own 11, which is what that anchor is for.
    expect(report.sourceAttributeMean).toBeGreaterThan(SCALE_ANCHORS.squadPlayer.ours - 6);
    expect(report.sourceAttributeMean).toBeLessThan(SCALE_ANCHORS.leagueStar.ours - 10);
  });

  it("keeps the source's own spacing, which a fitted rescale used to cut by a third", () => {
    const { players } = league();
    const sourced = players.flatMap((p) =>
      [p.physical, p.mental, p.technical].flatMap((g) => Object.values(g).filter((a) => a.source === "community").map((a) => a.value)),
    );
    // Fitting this to a target sd multiplied every attribute by 0.626 and collapsed the gap between
    // the league's best players and its ordinary ones. The curve's own slope has to survive.
    expect(distributionOf(sourced).sd).toBeGreaterThan(9);
  });

  /**
   * The ceiling rule, and the reason the transform is not a pure level shift: 90+ belongs to
   * players better than anyone in the competition. A shift alone put this league's best man at 96.
   */
  it("leaves the top of the scale free for players better than anyone in the league", () => {
    const { players } = league();
    const top = Math.max(...players.map((p) => p.overall));
    expect(top).toBeGreaterThan(78); // the standout is clearly the best
    // On the real Brasileirão this lands at 83, with the next best at 76–79. The band is wider
    // than that because this synthetic league's spread is not the real one; what it guards is that
    // nobody in a domestic league reaches the part of the scale reserved for the world's best.
    expect(top).toBeLessThan(95);
  });

  it("does not compress the league into a single band while doing it", () => {
    const { players } = league();
    const overalls = players.map((p) => p.overall);
    // The fringe player must still be visibly worse than the standout.
    expect(Math.max(...overalls) - Math.min(...overalls)).toBeGreaterThan(15);
  });

  it("preserves every ranking, because one affine transform moves everybody", () => {
    const { players } = league();
    const byId = new Map(players.map((p) => [p.id, p.overall]));
    // p0 was the source's 18, p1 its 5, the rest 9..14 — that order has to survive the move.
    expect(byId.get("p0")!).toBeGreaterThan(byId.get("p2")!);
    expect(byId.get("p2")!).toBeGreaterThan(byId.get("p1")!);
  });

  it("keeps a player's own shape, so the transform cannot flatten a specialist", () => {
    const { players } = applyRatings(
      [outfield("a")],
      new Map([["a", rated(11, { Pace: 18, Tackling: 5 })]]),
    );
    const p = players[0]!;
    expect(p.physical.pace.value - p.technical.tackling.value).toBeGreaterThan(20);
  });
});

describe("the players the source doesn't cover", () => {
  /** Ten rated players, plus five unrated guesses down on the inferred scale. */
  function mixed() {
    const known = Array.from({ length: 10 }, (_, i) => outfield(`r${i}`, 55));
    const unknown = Array.from({ length: 5 }, (_, i) => outfield(`u${i}`, 50 + i));
    const map = new Map(known.map((p, i) => [p.id, rated(11 + (i % 5))] as const));
    return applyRatings([...known, ...unknown], map);
  }

  it("moves them onto the rated population's scale, not the other way round", () => {
    const { report } = mixed();
    expect(report.rated).toBe(10);
    expect(report.backfilled).toBe(5);
  });

  it("lands them just below the rated players, not in a separate caste", () => {
    const { players, report } = mixed();
    const unrated = players.filter((p) => p.id.startsWith("u")).map((p) => p.overall);
    const mean = distributionOf(unrated).mean;
    expect(mean).toBeLessThan(report.ratedMean);
    expect(report.ratedMean - mean).toBeLessThan(8);
  });

  it("never lets an unrated player top the league", () => {
    const { players, report } = mixed();
    for (const p of players.filter((p) => p.id.startsWith("u"))) {
      // Ceiling is the rated population's own MEAN: the best of this group is an average
      // top-flight player and no better.
      expect(p.overall).toBeLessThanOrEqual(Math.ceil(report.ratedMean));
    }
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
    const { players, report } = applyRatings(before, new Map());
    expect(report.rated).toBe(0);
    expect(players.map((p) => p.overall)).toEqual(before.map((p) => p.overall));
  });

  it("handles a squad where EVERY player is rated", () => {
    const { players, report } = applyRatings(
      ["a", "b"].map((i) => outfield(i)),
      new Map([["a", rated(11)], ["b", rated(17)]]),
    );
    expect(report.backfilled).toBe(0);
    expect(players[1]!.overall).toBeGreaterThan(players[0]!.overall);
  });

  it("never emits a rating outside 1..99", () => {
    const { players } = applyRatings(
      [outfield("a"), outfield("b")],
      new Map([["a", rated(20)], ["b", rated(1)]]),
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
