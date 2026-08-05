import { describe, expect, it } from "vitest";
import { Position } from "@fut/domain";
import type { DatasetWorld, LeagueData, PlayerData, TeamData } from "@fut/competition";
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

  /**
   * A save and its dataset have separate lifetimes: re-scraping a league drops
   * players who transferred out. The save still lists them, and every read went
   * through `dataById.get(id)!` — which crashed the squad screen the moment a
   * refreshed dataset was published.
   */
  describe("a dataset that moved under an existing save", () => {
    /** The same league minus two of t0's players — as if they'd left. */
    const shrunk = (): LeagueData => ({
      ...league,
      teams: league.teams.map((t) => (t.id === "t0" ? { ...t, players: t.players.slice(0, -2) } : t)),
    });
    const departed = ["t0-p14", "t0-p15"];

    it("forgets players the dataset no longer has, instead of throwing", () => {
      const snap = Career.create(league, opts).snapshot();
      expect(snap.clubs.t0!.squad.playerIds).toEqual(expect.arrayContaining(departed));

      const loaded = Career.load(snap, shrunk());
      expect(() => loaded.squad()).not.toThrow();
      for (const id of departed) expect(loaded.snapshot().clubs.t0!.squad.playerIds).not.toContain(id);
      expect(loaded.squad().every((e) => e.name)).toBe(true);
    });

    it("blanks a departed player's lineup slot rather than shifting everyone up", () => {
      const c = Career.create(league, opts);
      const before = c.tacticsView()!.slots.map((s) => s.player?.playerId);
      const kept = before.filter((id) => id && !departed.includes(id));

      const loaded = Career.load(c.snapshot(), shrunk());
      const after = loaded.tacticsView()!.slots.map((s) => s.player?.playerId);

      expect(after).toHaveLength(before.length);
      // Survivors stay in the slot they were picked for.
      for (const id of kept) expect(after.indexOf(id)).toBe(before.indexOf(id));
    });

    it("clears the departed from contracts, shortlists and pending offers", () => {
      const c = Career.create(league, opts);
      c.addTarget(departed[0]!);
      c.scout(departed[0]!);
      const loaded = Career.load(c.snapshot(), shrunk());
      const s = loaded.snapshot();

      expect(s.targetPlayerIds).not.toContain(departed[0]);
      expect(s.scoutedPlayerIds).not.toContain(departed[0]);
      for (const id of departed) expect(s.contracts[id]).toBeUndefined();
      expect(s.transfers.offers.some((o) => departed.includes(o.playerId))).toBe(false);
    });

    it("leaves a save alone when the dataset still has everyone", () => {
      const c = Career.create(league, opts);
      const snap = c.snapshot();
      expect(Career.load(snap, league).snapshot()).toEqual(snap);
    });

    /**
     * The dataset owns what a club is CALLED, and the copy in the save is a cache.
     *
     * Real case: the display names were derived from legal names and were wrong for a dozen Brazilian
     * clubs. Fixing the dataset fixed new careers only — anyone already playing kept "Atlética Ponte"
     * forever, because a save is loaded and never rebuilt.
     */
    it("re-reads club display metadata from the world on every load", () => {
      const world = (nickname: string): DatasetWorld => ({
        competitions: [],
        clubs: [{ id: "t0", nickname, city: "Campinas" }],
      });
      const c = Career.create(league, { ...opts, world: world("Atlética Ponte") });
      expect(c.clubNickname("t0")).toBe("Atlética Ponte");

      const fixed = Career.load(c.snapshot(), league, world("Ponte Preta"));
      expect(fixed.clubNickname("t0")).toBe("Ponte Preta");
      expect(fixed.snapshot().clubs.t0!.city).toBe("Campinas");
      // The career's OWN state is untouched — only the dataset's fields are refreshed.
      expect(fixed.snapshot().clubs.t0!.finance).toEqual(c.snapshot().clubs.t0!.finance);
      expect(fixed.snapshot().clubs.t0!.squad).toEqual(c.snapshot().clubs.t0!.squad);
    });

    it("keeps the save's own metadata for a club the world has dropped", () => {
      const c = Career.create(league, { ...opts, world: { competitions: [], clubs: [{ id: "t0", nickname: "Ponte Preta" }] } });
      // A world that no longer names t0 must not blank the name it already had.
      const loaded = Career.load(c.snapshot(), league, { competitions: [], clubs: [{ id: "t1", nickname: "Other" }] });
      expect(loaded.clubNickname("t0")).toBe("Ponte Preta");
    });

    it("still loads a save with no world in hand", () => {
      const c = Career.create(league, { ...opts, world: { competitions: [], clubs: [{ id: "t0", nickname: "Ponte Preta" }] } });
      expect(Career.load(c.snapshot(), league).clubNickname("t0")).toBe("Ponte Preta");
    });
  });

  /**
   * Entity ids used to come from module-level counters (`let offerSeq = 0`), so
   * an id depended on how many offers the PROCESS had created, not on the save.
   * Two careers built identically in one run drifted apart — which quietly
   * breaks "a save is its seed plus its command log".
   */
  describe("entity ids come from the state, not the module", () => {
    const idsOf = (c: Career) => ({
      inbox: c.snapshot().inbox.map((m) => m.id),
      offers: c.snapshot().transfers.offers.map((o) => o.id),
    });

    it("two careers from the same seed mint identical ids, whatever ran before", () => {
      const warmUp = Career.create(league, opts); // burns ids under the old scheme
      warmUp.advance();
      warmUp.advance();

      const a = Career.create(league, opts);
      const b = Career.create(league, opts);
      a.advance();
      b.advance();

      expect(idsOf(a)).toEqual(idsOf(b));
      expect(a.snapshot().nextEntityId).toBe(b.snapshot().nextEntityId);
    });

    it("the counter survives a save/load round-trip and never reuses an id", () => {
      const c = Career.create(league, opts);
      c.advance();
      const before = c.snapshot().nextEntityId;

      const reloaded = Career.load(deserializeCareer(serializeCareer(c.snapshot())), league);
      expect(reloaded.snapshot().nextEntityId).toBe(before);

      reloaded.advance();
      const all = [...reloaded.snapshot().inbox.map((m) => m.id), ...reloaded.snapshot().transfers.offers.map((o) => o.id)];
      expect(new Set(all).size).toBe(all.length);
    });

    it("resumes above the ids a pre-counter save already holds", () => {
      const c = Career.create(league, opts);
      c.advance();
      const snap = c.snapshot();
      // A save from before the counter existed: ids present, no nextEntityId.
      const legacy = { ...snap, inbox: [...snap.inbox, { id: "txn-99", type: snap.inbox[0]!.type, date: snap.currentDate, read: true, params: {} }] };
      delete (legacy as { nextEntityId?: number }).nextEntityId;

      expect(Career.load(legacy, league).snapshot().nextEntityId).toBe(100);
    });
  });

  /**
   * The end-to-end promise: a career is its seed. Two runs from the same seed
   * must land on byte-identical state, ids and all — which is precisely what the
   * old module-level counters made impossible.
   */
  it("two full seasons from one seed produce identical state", () => {
    const run = () => {
      const c = Career.create(league, opts);
      c.simulateSeason();
      c.rolloverSeason();
      c.simulateSeason();
      return JSON.stringify(c.snapshot());
    };
    expect(run()).toBe(run());
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
