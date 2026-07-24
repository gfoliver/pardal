import { describe, expect, it } from "vitest";
import { Position, positionOverall, Player, Goalkeeper } from "@fut/domain";
import { inferPlayer, type NormalizedPlayer } from "@fut/dataset";

function np(over: Partial<NormalizedPlayer>): NormalizedPlayer {
  return {
    id: "p", name: "p", clubId: "c", position: Position.Striker, positionGroup: 3 as never,
    nationality: ["Brazil"], secondaryPositions: [], marketValueEur: 1e6, valuePct: 0.5,
    appearancePct: 0.5, appearances: 20,
    per90: { goals: 0, assists: 0, cards: 0 }, minutesShare: 0.5, minutes: 900, ageYears: 25,
    ...over,
  } as NormalizedPlayer;
}

/** Rebuild a domain Player from inferred attributes to check positionOverall. */
function toDomain(inf: ReturnType<typeof inferPlayer>) {
  const v = (r: Record<string, { value: number }>) => Object.fromEntries(Object.entries(r).map(([k, a]) => [k, a.value]));
  const common = {
    id: inf.id, name: inf.name, age: inf.ageYears, nationality: "BR",
    physical: v(inf.physical), mental: v(inf.mental), technical: v(inf.technical),
  } as never;
  return inf.position === Position.Goalkeeper
    ? new Goalkeeper({ ...(common as object), goalkeeping: v(inf.goalkeeping) } as never)
    : new Player({ ...(common as object), position: inf.position } as never);
}

describe("infer", () => {
  it("overall increases with market-value percentile", () => {
    const low = inferPlayer(np({ valuePct: 0.1 }));
    const high = inferPlayer(np({ valuePct: 0.9 }));
    expect(high.overall).toBeGreaterThan(low.overall);
  });

  it("overall increases with appearances (a proven starter beats a high-value benchwarmer)", () => {
    const benchStar = inferPlayer(np({ valuePct: 0.9, appearancePct: 0.05 }));
    const regular = inferPlayer(np({ valuePct: 0.4, appearancePct: 0.95 }));
    expect(regular.overall).toBeGreaterThanOrEqual(benchStar.overall);
  });

  it("shaped attributes reproduce the target positionOverall (±3)", () => {
    for (const position of [Position.Striker, Position.CentreBack, Position.CentralMidfielder, Position.Goalkeeper]) {
      const inf = inferPlayer(np({ position, valuePct: 0.7 }));
      const actual = positionOverall(toDomain(inf), position);
      expect(Math.abs(actual - inf.overall)).toBeLessThanOrEqual(3);
    }
  });

  it("more goals per 90 raises finishing (marked stats-sourced)", () => {
    const none = inferPlayer(np({ position: Position.Striker, per90: { goals: 0, assists: 0, cards: 0 } }));
    const scorer = inferPlayer(np({ position: Position.Striker, per90: { goals: 0.8, assists: 0, cards: 0 } }));
    expect(scorer.technical.finishing.value).toBeGreaterThan(none.technical.finishing.value);
    expect(scorer.technical.finishing.source).toBe("stats");
  });

  it("defining attributes carry higher confidence than baseline ones", () => {
    const inf = inferPlayer(np({ position: Position.Striker, valuePct: 0.6 }));
    expect(inf.technical.finishing.confidence).toBeGreaterThanOrEqual(0.6); // defining for striker
    expect(inf.technical.marking.confidence).toBeLessThan(0.6); // baseline
  });

  it("outfield players get a low goalkeeping floor", () => {
    const inf = inferPlayer(np({ position: Position.Striker, valuePct: 0.9 }));
    expect(inf.goalkeeping.reflexes.value).toBeLessThan(20);
  });
});
