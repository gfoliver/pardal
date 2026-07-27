import { describe, expect, it } from "vitest";
import { Position } from "@fut/domain";
import type { LeagueData, PlayerData, TeamData } from "@fut/competition";
import { Career, InMemoryCareerStore, deserializeCareer, serializeCareer } from "@fut/career";

function attrs(v: number) {
  return {
    physical: { pace: v, stamina: v, strength: v, agility: v },
    mental: { decisions: v, composure: v, workRate: v, teamwork: v, aggression: v, anticipation: v, positioning: v, vision: v },
    technical: { passing: v, technique: v, dribbling: v, finishing: v, shotPower: v, tackling: v, marking: v, crossing: v },
  };
}
const POS: [Position, boolean][] = [
  [Position.Goalkeeper, true], [Position.Goalkeeper, true],
  [Position.CentreBack, false], [Position.CentreBack, false], [Position.CentreBack, false], [Position.FullBack, false], [Position.FullBack, false], [Position.FullBack, false],
  [Position.CentralMidfielder, false], [Position.CentralMidfielder, false], [Position.CentralMidfielder, false], [Position.CentralMidfielder, false],
  [Position.Winger, false], [Position.Winger, false], [Position.Striker, false], [Position.Striker, false],
];
function team(id: string, r: number): TeamData {
  return { id, name: id, shortName: id.toUpperCase(), coach: { id: `${id}-c`, name: "C", age: 50, nationality: "BR", attributes: { adaptability: 60, tacticalKnowledge: 60, reactiveness: 60, composure: 60 } }, players: POS.map(([p, gk], i) => ({ id: `${id}-p${i}`, name: `${id}-p${i}`, age: 25, nationality: "BR", position: p, ...attrs(r), ...(gk ? { goalkeeping: { reflexes: r, handling: r, positioning: r, oneOnOnes: r } } : {}) } as PlayerData)) };
}
const league: LeagueData = { id: "fic", name: "Fic", teams: [76, 72, 68, 64].map((r, i) => team(`t${i}`, r)) };
const opts = { leagueId: "fic", managedClubId: "t0", seed: 5 };

describe("career persistence (M6) + façade (M7)", () => {
  it("save → load → continue reproduces play-through without reload", () => {
    // Reference: play a few days, then finish.
    const ref = Career.create(league, opts);
    ref.advance();
    ref.advance();
    ref.simulateSeason();
    const refTable = ref.table("league");

    // Split: play the same few days, serialize, reload, then finish.
    const a = Career.create(league, opts);
    a.advance();
    a.advance();
    const json = serializeCareer(a.snapshot());
    const b = Career.load(deserializeCareer(json), league);
    b.simulateSeason();

    expect(b.table("league")).toEqual(refTable);
  });

  it("round-trips through a CareerStore", async () => {
    const store = new InMemoryCareerStore();
    const c = Career.create(league, opts);
    c.advance();
    await store.save("slot1", c.snapshot());
    expect(await store.list()).toEqual(["slot1"]);
    const loaded = await store.load("slot1");
    expect(loaded).not.toBeNull();
    expect(loaded!.careerSeed).toBe(5);
    expect(loaded!.managedClubId).toBe("t0");
  });

  it("façade exposes squad, inbox and tactics command", () => {
    const c = Career.create(league, opts);
    const squad = c.squad();
    expect(squad.length).toBeGreaterThanOrEqual(16);
    expect(squad[0]!.overall).toBeGreaterThanOrEqual(squad[squad.length - 1]!.overall);

    expect(c.unreadCount()).toBeGreaterThan(0);
    const firstMsg = c.inbox()[0]!;
    c.dispatch({ type: "readInbox", messageId: firstMsg.id });
    expect(c.inbox().find((m) => m.id === firstMsg.id)!.read).toBe(true);
  });

  it("migrates a legacy save (single formation/mentality/tactics on the club) to one named tactic", () => {
    const c = Career.create(league, opts);
    const before = c.tacticsView()!;
    const snap = c.snapshot();
    const club = snap.clubs.t0!;

    // Rewrite t0 to the pre-multi-tactic shape: formation/mentality/tactics
    // directly on the club, no tacticSlots/activeTacticId.
    const legacyClub = { ...club } as Record<string, unknown>;
    legacyClub.formation = before.formation;
    legacyClub.mentality = before.mentality;
    legacyClub.tactics = { lineup: before.slots.map((s) => s.player!.playerId), bench: before.bench.map((p) => p.playerId), roles: {}, instructions: before.instructions };
    delete legacyClub.tacticSlots;
    delete legacyClub.activeTacticId;
    const legacySnap = { ...snap, clubs: { ...snap.clubs, t0: legacyClub as never } };

    const loaded = Career.load(legacySnap, league);
    const v = loaded.tacticsView()!;
    expect(v.tactics).toHaveLength(1);
    expect(v.tactics[0]).toMatchObject({ id: "t1", name: "1" });
    expect(v.formation).toBe(before.formation);
    expect(v.mentality).toBe(before.mentality);
    expect(v.slots.map((s) => s.player?.playerId)).toEqual(before.slots.map((s) => s.player?.playerId));

    // Idempotent: loading the now-migrated snapshot again changes nothing.
    const reloaded = Career.load(loaded.snapshot(), league);
    expect(reloaded.tacticsView()).toEqual(loaded.tacticsView());
    expect(reloaded.snapshot()).toEqual(loaded.snapshot());
  });

  it("watch flow: prepare a user fixture then commit a result", () => {
    const c = Career.create(league, opts);
    const prepared = c.prepareNextUserFixture();
    expect(prepared).not.toBeNull();
    expect(prepared!.fixture.homeTeamId === "t0" || prepared!.fixture.awayTeamId === "t0").toBe(true);
    // Quick-sim it via the engine and commit.
    const fr = c.commitUserFixture(prepared!.comp, prepared!.fixture, {
      homeScore: 2, awayScore: 1, timeline: [], discipline: { yellowCards: 0, redCards: 0, byPlayer: {} },
    } as never);
    expect(fr.homeScore).toBe(2);
    expect(c.table("league").reduce((s, r) => s + r.played, 0)).toBeGreaterThan(0);
  });
});
