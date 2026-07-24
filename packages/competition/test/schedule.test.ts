import { describe, expect, it } from "vitest";
import {
  assignDates,
  generateFixtures,
  hasSameDayConflict,
  matchDays,
  pairRound,
  resolvePromotionRelegation,
  roundsNeeded,
  type StandingRow,
} from "@fut/competition";

const ids = ["a", "b", "c", "d", "e", "f"];

describe("assignDates", () => {
  const fixtures = generateFixtures(ids, { doubleRoundRobin: true });
  const dated = assignDates(fixtures, { competitionId: "league", firstDay: 0, daysPerRound: 7 });

  it("dates every fixture and covers every round", () => {
    expect(dated).toHaveLength(fixtures.length);
    const rounds = new Set(fixtures.map((f) => f.round));
    const daysByRound = new Map(dated.map((f) => [f.round, f.day]));
    expect(daysByRound.size).toBe(rounds.size);
  });

  it("never double-books a team on the same day", () => {
    expect(hasSameDayConflict(dated)).toBe(false);
  });

  it("day increases monotonically with round", () => {
    for (const f of dated) expect(f.day).toBe((f.round - 1) * 7);
    expect(matchDays(dated)[0]).toBe(0);
  });
});

describe("resolvePromotionRelegation", () => {
  const table: StandingRow[] = ids.map((teamId, i) => ({
    teamId, played: 10, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 100 - i * 10,
  }));

  it("promotes the top N and relegates the bottom M without overlap", () => {
    const r = resolvePromotionRelegation(table, { promotionSlots: 2, relegationSlots: 2 });
    expect(r.promoted).toEqual(["a", "b"]);
    expect(r.relegated).toEqual(["e", "f"]);
    expect(r.promoted.some((id) => r.relegated.includes(id))).toBe(false);
  });

  it("clamps overlapping slots on a small table", () => {
    const r = resolvePromotionRelegation(table.slice(0, 3), { promotionSlots: 2, relegationSlots: 2 });
    expect(r.promoted).toHaveLength(2);
    expect(r.relegated).toHaveLength(1);
  });
});

describe("cup bracket", () => {
  it("pairs an even round with no byes", () => {
    const r = pairRound(["a", "b", "c", "d"], 1);
    expect(r.ties).toHaveLength(2);
    expect(r.byes).toHaveLength(0);
  });

  it("gives the odd team out a bye", () => {
    const r = pairRound(["a", "b", "c"], 1);
    expect(r.ties).toHaveLength(1);
    expect(r.byes).toEqual(["c"]);
  });

  it("roundsNeeded halves each round", () => {
    expect(roundsNeeded(8)).toBe(3);
    expect(roundsNeeded(6)).toBe(3);
    expect(roundsNeeded(1)).toBe(0);
  });
});
