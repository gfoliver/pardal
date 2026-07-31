import { describe, expect, it } from "vitest";
import { Formation, MarkingScheme, Mentality } from "@fut/domain";
import { apply, applyAll, MAX_SAVED_TACTICS, type CareerCommand, type CareerState, type SavedTactic, InboxMessageType } from "@fut/career";

function tactic(id: string, name: string): SavedTactic {
  return {
    id,
    name,
    formation: Formation.F442,
    mentality: Mentality.Balanced,
    familiarity: 60,
    lineup: ["p1"],
    bench: [],
    roles: {},
    instructions: { tempo: 0.5, pressing: 0.5, lineHeight: 0.5, width: 0.5, directness: 0.5, markingScheme: MarkingScheme.Zonal },
  };
}

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
        finance: { annualBudget: 1000, feesPaid: 0, feesReceived: 0 },
        tacticSlots: [tactic("t1", "1")],
        activeTacticId: "t1",
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
  { type: "setFormation", clubId: "onze", formation: Formation.F433 },
  { type: "setMentality", clubId: "onze", mentality: Mentality.Attacking },
  { type: "archiveInbox", messageId: "m2" },
];

describe("apply (pure reducer)", () => {
  it("does not mutate the input state", () => {
    const s0 = baseState();
    const before = JSON.stringify(s0);
    apply(s0, { type: "readInbox", messageId: "m1" });
    expect(JSON.stringify(s0)).toBe(before);
  });

  it("applies inbox + tactics commands correctly, to the active tactic slot", () => {
    const s = applyAll(baseState(), log);
    expect(s.inbox.find((m) => m.id === "m1")?.read).toBe(true);
    expect(s.inbox.find((m) => m.id === "m2")).toBeUndefined();
    const active = s.clubs.onze!.tacticSlots[0]!;
    expect(active.formation).toBe(Formation.F433);
    expect(active.mentality).toBe(Mentality.Attacking);
  });

  it("is deterministic — same log twice yields deep-equal state", () => {
    const a = applyAll(baseState(), log);
    const b = applyAll(baseState(), log);
    expect(a).toEqual(b);
  });
});

describe("named tactics (create/rename/delete/select)", () => {
  it("createTactic copies the source (default: active) and selects the copy", () => {
    const s = apply(baseState(), { type: "createTactic", clubId: "onze", id: "t2", name: "2" });
    const club = s.clubs.onze!;
    expect(club.tacticSlots).toHaveLength(2);
    expect(club.activeTacticId).toBe("t2");
    const copy = club.tacticSlots.find((t) => t.id === "t2")!;
    expect(copy.name).toBe("2");
    expect(copy.formation).toBe(Formation.F442); // copied from t1
    expect(copy.lineup).toEqual(["p1"]);
  });

  it("createTactic can copy an explicit sourceId other than the active one", () => {
    let s = apply(baseState(), { type: "createTactic", clubId: "onze", id: "t2", name: "2" });
    s = apply(s, { type: "setFormation", clubId: "onze", formation: Formation.F433 }); // edits t2 (active)
    s = apply(s, { type: "createTactic", clubId: "onze", id: "t3", name: "3", sourceId: "t1" });
    const t3 = s.clubs.onze!.tacticSlots.find((t) => t.id === "t3")!;
    expect(t3.formation).toBe(Formation.F442); // from t1, not the edited t2
  });

  it("refuses to exceed the cap, and refuses a duplicate id", () => {
    let s = baseState();
    for (let i = 2; i <= MAX_SAVED_TACTICS; i++) s = apply(s, { type: "createTactic", clubId: "onze", id: `t${i}`, name: String(i) });
    expect(s.clubs.onze!.tacticSlots).toHaveLength(MAX_SAVED_TACTICS);
    const overCap = apply(s, { type: "createTactic", clubId: "onze", id: "t99", name: "over" });
    expect(overCap.clubs.onze!.tacticSlots).toHaveLength(MAX_SAVED_TACTICS); // no-op

    const dup = apply(baseState(), { type: "createTactic", clubId: "onze", id: "t1", name: "dup" });
    expect(dup.clubs.onze!.tacticSlots).toHaveLength(1); // no-op, id already used
  });

  it("renameTactic trims and refuses an empty name", () => {
    const s = apply(baseState(), { type: "renameTactic", clubId: "onze", id: "t1", name: "  My 4-4-2  " });
    expect(s.clubs.onze!.tacticSlots[0]!.name).toBe("My 4-4-2");
    const blank = apply(baseState(), { type: "renameTactic", clubId: "onze", id: "t1", name: "   " });
    expect(blank.clubs.onze!.tacticSlots[0]!.name).toBe("1"); // no-op
  });

  it("deleteTactic refuses to remove the last slot, and reassigns the active one", () => {
    const soleSlot = apply(baseState(), { type: "deleteTactic", clubId: "onze", id: "t1" });
    expect(soleSlot.clubs.onze!.tacticSlots).toHaveLength(1); // no-op

    let s = apply(baseState(), { type: "createTactic", clubId: "onze", id: "t2", name: "2" }); // active → t2
    s = apply(s, { type: "deleteTactic", clubId: "onze", id: "t2" });
    expect(s.clubs.onze!.tacticSlots.map((t) => t.id)).toEqual(["t1"]);
    expect(s.clubs.onze!.activeTacticId).toBe("t1"); // fell back to the remaining slot
  });

  it("selectTactic switches the active slot, and ignores an unknown id", () => {
    let s = apply(baseState(), { type: "createTactic", clubId: "onze", id: "t2", name: "2" }); // active → t2
    s = apply(s, { type: "selectTactic", clubId: "onze", id: "t1" });
    expect(s.clubs.onze!.activeTacticId).toBe("t1");

    const s2 = apply(s, { type: "selectTactic", clubId: "onze", id: "ghost" });
    expect(s2.clubs.onze!.activeTacticId).toBe("t1"); // no-op
  });

  it("editing the active tactic leaves every other saved tactic untouched", () => {
    let s = apply(baseState(), { type: "createTactic", clubId: "onze", id: "t2", name: "2" }); // active → t2
    s = apply(s, { type: "selectTactic", clubId: "onze", id: "t1" });
    const before = s.clubs.onze!.tacticSlots.find((t) => t.id === "t2");
    s = apply(s, { type: "setFormation", clubId: "onze", formation: Formation.F352 }); // edits t1 (active)
    expect(s.clubs.onze!.tacticSlots.find((t) => t.id === "t2")).toEqual(before);
    expect(s.clubs.onze!.tacticSlots.find((t) => t.id === "t1")!.formation).toBe(Formation.F352);
  });

  it("is deterministic across create/select/rename/delete", () => {
    const named: CareerCommand[] = [
      { type: "createTactic", clubId: "onze", id: "t2", name: "2" },
      { type: "createTactic", clubId: "onze", id: "t3", name: "3", sourceId: "t1" },
      { type: "selectTactic", clubId: "onze", id: "t3" },
      { type: "renameTactic", clubId: "onze", id: "t3", name: "Cup shape" },
      { type: "deleteTactic", clubId: "onze", id: "t2" },
    ];
    const a = applyAll(baseState(), named);
    const b = applyAll(baseState(), named);
    expect(a).toEqual(b);
  });
});
