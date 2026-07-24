import { describe, expect, it } from "vitest";
import { Formation, Mentality } from "@fut/domain";
import { apply, applyAll, type CareerCommand, type CareerState, InboxMessageType } from "@fut/career";

function baseState(): CareerState {
  return {
    version: 1,
    careerSeed: 42,
    datasetId: "test",
    datasetVersion: "1",
    managedClubId: "onze",
    currentDate: { season: 0, dayOfSeason: 0 },
    structure: { divisions: [], cups: [] },
    clubs: {
      onze: {
        id: "onze",
        name: "Onze FC",
        shortName: "ONZ",
        divisionId: "d1",
        squad: { clubId: "onze", playerIds: ["p1"], coach: { id: "c", name: "C", age: 50, nationality: "BR" } as never },
        finance: { balance: 1000, wageBudgetPerPeriod: 100, transferBudget: 500, revenue: { matchdayPerHomeGame: 10, tvPerRound: 5, prizeMoneyByFinalPosition: [] } },
        formation: Formation.F442,
        mentality: Mentality.Balanced,
        objectives: { leaguePositionTarget: 1, cupTargets: {}, confidence: 60 },
        reputation: 60,
      },
    },
    playerDev: {},
    transfers: { listings: [], offers: [], loans: [] },
    inbox: [
      { id: "m1", type: InboxMessageType.MatchResult, date: { season: 0, dayOfSeason: 0 }, read: false, params: {} },
      { id: "m2", type: InboxMessageType.WindowOpened, date: { season: 0, dayOfSeason: 0 }, read: false, params: {} },
    ],
  };
}

const log: CareerCommand[] = [
  { type: "readInbox", messageId: "m1" },
  { type: "setClubTactics", clubId: "onze", formation: Formation.F433, mentality: Mentality.Attacking },
  { type: "archiveInbox", messageId: "m2" },
];

describe("apply (pure reducer)", () => {
  it("does not mutate the input state", () => {
    const s0 = baseState();
    const before = JSON.stringify(s0);
    apply(s0, { type: "readInbox", messageId: "m1" });
    expect(JSON.stringify(s0)).toBe(before);
  });

  it("applies inbox + tactics commands correctly", () => {
    const s = applyAll(baseState(), log);
    expect(s.inbox.find((m) => m.id === "m1")?.read).toBe(true);
    expect(s.inbox.find((m) => m.id === "m2")).toBeUndefined();
    expect(s.clubs.onze!.formation).toBe(Formation.F433);
    expect(s.clubs.onze!.mentality).toBe(Mentality.Attacking);
  });

  it("is deterministic — same log twice yields deep-equal state", () => {
    const a = applyAll(baseState(), log);
    const b = applyAll(baseState(), log);
    expect(a).toEqual(b);
  });
});
