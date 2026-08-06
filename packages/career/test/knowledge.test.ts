import { describe, expect, it } from "vitest";
import { Formation, Position, WEIGHTS, type AssignablePlayer } from "@fut/domain";
import {
  ATTR_GROUPS,
  KNOWLEDGE_TIERS,
  MAX_RIVAL_CONFIDENCE,
  attributeKnowledge,
  estimateMoney,
  estimateOf,
  overallGrade,
  potentialStars,
  relevanceAt,
  squadFit,
  tierFor,
} from "../src/scouting/knowledge.js";
import { scoutSeed } from "../src/rng/seeds.js";

const SEED = 4242;

describe("knowledge tiers", () => {
  it("climbs the ladder the spec describes", () => {
    expect(tierFor(0)).toMatchObject({ attrMargin: null, overall: "hidden", chart: "hidden" });
    expect(tierFor(30)).toMatchObject({ attrMargin: 20, overall: "grade", chart: "coarse" });
    expect(tierFor(60)).toMatchObject({ attrMargin: 10, overall: "exact", chart: "close" });
    expect(tierFor(90)).toMatchObject({ attrMargin: 5, overall: "exact", chart: "exact" });
    expect(tierFor(100)).toMatchObject({ attrMargin: 0, overall: "exact", chart: "exact" });
  });

  it("does not promote a player who is between tiers", () => {
    expect(tierFor(29).attrMargin).toBeNull();
    expect(tierFor(59).attrMargin).toBe(20);
    expect(tierFor(89).attrMargin).toBe(10);
    expect(tierFor(99).attrMargin).toBe(5);
  });

  it("reserves certainty for our own players", () => {
    // A rival's player can never reach the exact tier, by design.
    expect(tierFor(MAX_RIVAL_CONFIDENCE).attrMargin).toBeGreaterThan(0);
    expect(KNOWLEDGE_TIERS.filter((t) => t.attrMargin === 0)).toHaveLength(1);
  });
});

describe("estimateOf — the property the whole model rests on", () => {
  const facts = ["finishing", "pace", "vision", "marking"];
  const truths = [12, 33, 50, 64, 71, 88, 99, 0];

  it("always contains the truth, at every margin", () => {
    for (const truth of truths) {
      for (const fact of facts) {
        for (const margin of [20, 10, 5]) {
          const e = estimateOf(truth, margin, scoutSeed(SEED, "p1", fact));
          expect(e.low).toBeLessThanOrEqual(truth);
          expect(e.high).toBeGreaterThanOrEqual(truth);
        }
      }
    }
  });

  it("CONVERGES as the margin narrows — the scout gets closer, not merely different", () => {
    for (const truth of truths) {
      const coarse = estimateOf(truth, 20, scoutSeed(SEED, "p1", "finishing"));
      const close = estimateOf(truth, 10, scoutSeed(SEED, "p1", "finishing"));
      const tight = estimateOf(truth, 5, scoutSeed(SEED, "p1", "finishing"));
      expect(Math.abs(close.mid - truth)).toBeLessThanOrEqual(Math.abs(coarse.mid - truth));
      expect(Math.abs(tight.mid - truth)).toBeLessThanOrEqual(Math.abs(close.mid - truth));
    }
  });

  it("errs in a consistent direction for a given player and fact", () => {
    const a = estimateOf(60, 20, scoutSeed(SEED, "p1", "pace"));
    const b = estimateOf(60, 10, scoutSeed(SEED, "p1", "pace"));
    expect(Math.sign(a.mid - 60)).toBe(Math.sign(b.mid - 60));
  });

  it("is deterministic, and different per player and per fact", () => {
    const again = estimateOf(60, 20, scoutSeed(SEED, "p1", "pace"));
    expect(again).toEqual(estimateOf(60, 20, scoutSeed(SEED, "p1", "pace")));
    expect(again.mid).not.toBe(estimateOf(60, 20, scoutSeed(SEED, "p2", "pace")).mid);
    expect(again.mid).not.toBe(estimateOf(60, 20, scoutSeed(SEED, "p1", "vision")).mid);
  });

  it("collapses to a point at zero margin", () => {
    expect(estimateOf(77, 0, 1)).toEqual({ low: 77, mid: 77, high: 77, exact: true });
  });

  it("stays on the 0-99 scale at the extremes, without losing the truth", () => {
    for (const truth of [0, 1, 98, 99]) {
      const e = estimateOf(truth, 20, scoutSeed(SEED, "edge", String(truth)));
      expect(e.low).toBeGreaterThanOrEqual(0);
      expect(e.high).toBeLessThanOrEqual(99);
      expect(e.low).toBeLessThanOrEqual(truth);
      expect(e.high).toBeGreaterThanOrEqual(truth);
    }
  });

  it("scales money bands by proportion, since values span decades", () => {
    const e = estimateMoney(50_000_000, 0.4, scoutSeed(SEED, "p1", "value"));
    expect(e.low).toBeLessThanOrEqual(50_000_000);
    expect(e.high).toBeGreaterThanOrEqual(50_000_000);
    expect(e.high - e.low).toBeGreaterThan(20_000_000);
    expect(Number.isInteger(e.mid)).toBe(true);
  });
});

describe("the full attribute picture", () => {
  const truth = {
    pace: 80, stamina: 70, strength: 65, agility: 75,
    decisions: 68, composure: 72, workRate: 66, teamwork: 64, aggression: 60, anticipation: 71, positioning: 69, vision: 73, offTheBall: 71,
    passing: 74, technique: 78, dribbling: 82, finishing: 85, shotPower: 79, tackling: 40, marking: 38, crossing: 61, firstTouch: 78, heading: 65,
  };

  it("shows every physical, mental and technical attribute — nothing summarised away", () => {
    const known = attributeKnowledge(truth, Position.Striker, 60, SEED, "p1");
    const names = known.map((a) => a.name);
    for (const group of ["physical", "mental", "technical"] as const) {
      for (const attr of ATTR_GROUPS[group]) expect(names).toContain(attr);
    }
    expect(known).toHaveLength(20);
  });

  it("hides everything at zero confidence", () => {
    expect(attributeKnowledge(truth, Position.Striker, 0, SEED, "p1")).toEqual([]);
    expect(attributeKnowledge(truth, Position.Striker, 29, SEED, "p1")).toEqual([]);
  });

  it("narrows every band as confidence rises", () => {
    const width = (c: number) => {
      const a = attributeKnowledge(truth, Position.Striker, c, SEED, "p1").find((x) => x.name === "finishing")!;
      return a.estimate.high - a.estimate.low;
    };
    expect(width(30)).toBeGreaterThan(width(60));
    expect(width(60)).toBeGreaterThan(width(90));
    expect(width(100)).toBe(0);
  });

  it("ranks attributes by what the ENGINE actually weights, not by decoration", () => {
    const st = attributeKnowledge(truth, Position.Striker, 90, SEED, "p1");
    const rel = (n: string) => st.find((a) => a.name === n)!.relevance;
    // Finishing is a striker's defining attribute (weight 3); marking is unused.
    expect(rel("finishing")).toBe(1);
    expect(rel("marking")).toBe(0);
    expect(rel("composure")).toBeGreaterThan(rel("dribbling")); // weights 2 vs 1
  });

  it("re-ranks the same attributes for a different position", () => {
    const cb = attributeKnowledge(truth, Position.CentreBack, 90, SEED, "p1");
    const rel = (n: string) => cb.find((a) => a.name === n)!.relevance;
    expect(rel("marking")).toBe(1);
    expect(rel("finishing")).toBe(0);
  });

  it("matches the domain's own weight table exactly", () => {
    for (const position of Object.values(Position)) {
      const rel = relevanceAt(position);
      const weights = WEIGHTS[position];
      const max = Math.max(...Object.values(weights).map((w) => w ?? 0));
      for (const [name, w] of Object.entries(weights)) {
        expect(rel[name as keyof typeof rel]).toBeCloseTo((w ?? 0) / max, 6);
      }
    }
  });

  it("shows goalkeeping attributes only to goalkeepers", () => {
    const gkTruth = { ...truth, reflexes: 80, handling: 78, gkPositioning: 76, oneOnOnes: 74 };
    const gk = attributeKnowledge(gkTruth, Position.Goalkeeper, 90, SEED, "gk1").map((a) => a.name);
    expect(gk).toContain("reflexes");
    // An outfielder's goalkeeping numbers are domain placeholders, not data.
    const out = attributeKnowledge(gkTruth, Position.Striker, 90, SEED, "p1").map((a) => a.name);
    expect(out).not.toContain("reflexes");
  });
});

describe("headline figures", () => {
  it("grades an overall the scout can only ballpark", () => {
    expect(overallGrade(90)).toBe("A");
    expect(overallGrade(80)).toBe("B");
    expect(overallGrade(72)).toBe("C");
    expect(overallGrade(50)).toBe("E");
  });

  it("gives potential as a star band that tightens with confidence", () => {
    const spread = (c: number) => {
      const p = potentialStars(160, c, SEED, "p1");
      return p.high - p.low;
    };
    expect(spread(30)).toBeGreaterThan(spread(90));
    expect(potentialStars(160, 100, SEED, "p1")).toMatchObject({ low: 4, mid: 4, high: 4, exact: true });
  });

  it("keeps stars inside 1-5 even for extreme ability", () => {
    for (const pa of [0, 40, 120, 200]) {
      const p = potentialStars(pa, 30, SEED, "p1");
      expect(p.low).toBeGreaterThanOrEqual(1);
      expect(p.high).toBeLessThanOrEqual(5);
    }
  });
});

describe("squadFit — what signing him would actually do", () => {
  const p = (id: string, position: Position, rating: number): AssignablePlayer => ({
    id, position, rating, isGoalkeeper: position === Position.Goalkeeper,
  });
  /** A plain 4-4-2's worth of players, all rated 70. */
  const squad = (): AssignablePlayer[] => [
    p("gk", Position.Goalkeeper, 70),
    ...[0, 1].map((i) => p(`cb${i}`, Position.CentreBack, 70)),
    ...[0, 1].map((i) => p(`fb${i}`, Position.FullBack, 70)),
    ...[0, 1].map((i) => p(`cm${i}`, Position.CentralMidfielder, 70)),
    ...[0, 1].map((i) => p(`wg${i}`, Position.Winger, 70)),
    ...[0, 1].map((i) => p(`st${i}`, Position.Striker, 70)),
  ];

  it("counts our depth and best man in his position", () => {
    const fit = squadFit(squad(), p("target", Position.Striker, 85), Formation.F442);
    expect(fit.depthAtPosition).toBe(2);
    expect(fit.bestAtPosition).toBe(70);
  });

  it("says a clear upgrade would start, and quantifies the gain", () => {
    const fit = squadFit(squad(), p("star", Position.Striker, 90), Formation.F442);
    expect(fit.wouldStart).toBe(true);
    expect(fit.xiGain).toBeGreaterThan(0);
  });

  it("says a worse player adds nothing — no fake positive", () => {
    const fit = squadFit(squad(), p("weak", Position.Striker, 45), Formation.F442);
    expect(fit.wouldStart).toBe(false);
    expect(fit.xiGain).toBe(0);
  });

  it("values filling a hole more than adding to a strength", () => {
    const thin = squad().filter((x) => x.id !== "cb1"); // a centre-back short
    const cb = squadFit(thin, p("cb-new", Position.CentreBack, 75), Formation.F442);
    const st = squadFit(thin, p("st-new", Position.Striker, 75), Formation.F442);
    expect(cb.xiGain).toBeGreaterThan(st.xiGain);
  });

  it("is deterministic", () => {
    const a = squadFit(squad(), p("t", Position.Winger, 80), Formation.F442);
    expect(a).toEqual(squadFit(squad(), p("t", Position.Winger, 80), Formation.F442));
  });
});
