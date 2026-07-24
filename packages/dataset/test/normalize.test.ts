import { describe, expect, it } from "vitest";
import { Position, PositionGroup } from "@fut/domain";
import { normalizeSnapshot, type RawSnapshot } from "@fut/dataset";

function snapshot(players: RawSnapshot["players"]): RawSnapshot {
  return {
    primaryCompetitionId: "BRA1",
    competitions: [{ id: "BRA1", name: "L", type: "league", entrantClubIds: ["c"] }],
    clubs: [{ id: "c", name: "C", competitionIds: ["BRA1"] }],
    players,
  };
}

const striker = (id: string, value: number, minutes: number, goals: number) => ({
  id,
  name: id,
  clubId: "c",
  position: "Centre-Forward",
  marketValueEur: value,
  stats: [{ source: "s", competitionId: "BRA1", minutes, goals, assists: 0, yellow: 0, red: 0 }],
});

describe("normalize", () => {
  it("ranks market value into a within-position percentile (0..1)", () => {
    const norm = normalizeSnapshot(snapshot([striker("a", 1_000_000, 900, 0), striker("b", 5_000_000, 900, 0), striker("c", 9_000_000, 900, 0)]));
    const by = Object.fromEntries(norm.map((p) => [p.id, p.valuePct]));
    expect(by.a).toBe(0);
    expect(by.c).toBe(1);
    expect(by.b).toBeGreaterThan(0);
    expect(by.b).toBeLessThan(1);
  });

  it("computes per-90 from minutes", () => {
    const [p] = normalizeSnapshot(snapshot([striker("a", 1_000_000, 900, 5)])); // 5 goals in 900' = 0.5/90
    expect(p!.per90.goals).toBeCloseTo(0.5, 5);
    expect(p!.position).toBe(Position.Striker);
    expect(p!.positionGroup).toBe(PositionGroup.Attack);
  });

  it("percentiles are computed per position group, not globally", () => {
    const gk = { id: "g", name: "g", clubId: "c", position: "Goalkeeper", marketValueEur: 100, stats: [{ source: "s", competitionId: "BRA1", minutes: 900 }] };
    const norm = normalizeSnapshot(snapshot([striker("a", 1_000_000, 900, 0), gk]));
    // A lone GK is top of its own group despite a tiny value.
    expect(norm.find((p) => p.id === "g")!.valuePct).toBe(1);
    expect(norm.find((p) => p.id === "a")!.valuePct).toBe(1);
  });

  it("minutesShare is relative to the busiest player", () => {
    const norm = normalizeSnapshot(snapshot([striker("a", 1e6, 3000, 0), striker("b", 1e6, 1500, 0)]));
    expect(norm.find((p) => p.id === "a")!.minutesShare).toBe(1);
    expect(norm.find((p) => p.id === "b")!.minutesShare).toBe(0.5);
  });
});
