import { describe, expect, it } from "vitest";
import { Position } from "@fut/domain";
import type { LeagueData, PlayerData, TeamData } from "@fut/competition";
import { Career } from "@fut/career";

function attrs(v: number) {
  return {
    physical: { pace: v, stamina: v, strength: v, agility: v },
    mental: { decisions: v, composure: v, workRate: v, teamwork: v, aggression: v, anticipation: v, positioning: v, vision: v, offTheBall: v },
    technical: { passing: v, technique: v, dribbling: v, finishing: v, shotPower: v, tackling: v, marking: v, crossing: v, firstTouch: v, heading: v },
  };
}
const POS: [Position, boolean][] = [
  [Position.Goalkeeper, true], [Position.Goalkeeper, true],
  ...Array.from({ length: 6 }, () => [Position.CentreBack, false] as [Position, boolean]),
  ...Array.from({ length: 6 }, () => [Position.CentralMidfielder, false] as [Position, boolean]),
  ...Array.from({ length: 4 }, () => [Position.Striker, false] as [Position, boolean]),
];
function team(id: string, r: number): TeamData {
  return {
    id, name: id, shortName: id.toUpperCase(),
    coach: { id: `${id}-c`, name: "C", age: 50, nationality: "BR", attributes: { adaptability: 60, tacticalKnowledge: 60, reactiveness: 60, composure: 60 } },
    players: POS.map(([p, gk], i) => ({ id: `${id}-p${i}`, name: `${id}-p${i}`, age: i < 4 ? 19 : 27, nationality: "BR", position: p, ...attrs(r), ...(gk ? { goalkeeping: { reflexes: r, handling: r, positioning: r, oneOnOnes: r } } : {}) })),
  };
}
const league: LeagueData = { id: "fic", name: "Fic", teams: [76, 72, 68, 64].map((r, i) => team(`t${i}`, r)) };
const opts = { leagueId: "fic", managedClubId: "t0", seed: 21 };
const MINE = "t0-p8";

const career = () => Career.create(league, opts);
/** Play a whole season and roll into the next. */
const playSeason = (c: Career) => {
  c.simulateSeason();
  c.rolloverSeason();
};

describe("the squad row carries what the screen needs", () => {
  it("knows our own players' market value exactly — no fog at home", () => {
    const row = career().squad().find((e) => e.playerId === MINE)!;
    expect(row.value).toBeGreaterThan(0);
  });

  it("carries contract countdown, condition and ability", () => {
    const row = career().squad().find((e) => e.playerId === MINE)!;
    expect(row.contractDaysLeft).toBeTypeOf("number");
    expect(row.fitness).toBeGreaterThan(0);
    expect(row.potentialAbility).toBeGreaterThanOrEqual(row.currentAbility);
  });
});

describe("development history", () => {
  it("is empty before a season has been played — an honest blank, not a fake curve", () => {
    expect(career().playerHistory(MINE)).toEqual([]);
  });

  it("gains exactly one point per season", () => {
    const c = career();
    playSeason(c);
    expect(c.playerHistory(MINE)).toHaveLength(1);
    playSeason(c);
    expect(c.playerHistory(MINE)).toHaveLength(2);
  });

  it("records the player as he WAS that season, before ageing", () => {
    const c = career();
    const ageBefore = c.squad().find((e) => e.playerId === MINE)!.age;
    playSeason(c);
    const [first] = c.playerHistory(MINE);
    expect(first!.age).toBe(ageBefore);
    expect(first!.season).toBe(0);
  });

  it("never rewrites a season already on the record", () => {
    const c = career();
    playSeason(c);
    const before = JSON.parse(JSON.stringify(c.playerHistory(MINE)));
    // A second rollover for the same season must not duplicate or alter it.
    c.rolloverSeason();
    expect(c.playerHistory(MINE)[0]).toEqual(before[0]);
  });

  it("shows a young player improving across seasons", () => {
    const c = career();
    playSeason(c);
    playSeason(c);
    playSeason(c);
    /*
     * A youngster who is STILL ours, found rather than named.
     *
     * This used to name `t0-p0` and the market sold him to t2 in season one, which only surfaced when the
     * chart was fogged: two of his three seasons were spent somewhere we were not watching. Picking a
     * player who stayed keeps the test about what it says it is about — development — instead of about
     * the transfer market's choices.
     */
    const snap = c.snapshot();
    const stillOurs = snap.clubs[snap.managedClubId]!.squad.playerIds;
    const young = stillOurs.find((id) => {
      const rows = snap.playerHistory?.[id] ?? [];
      return rows.length === 3 && rows[0]!.age <= 20;
    });
    expect(young).toBeDefined();

    const history = c.playerHistory(young!);
    expect(history).toHaveLength(3);
    // The rating, not `ca`: the view carries what a screen may state, and current ability is the hidden
    // 0-200 scale the UI never shows. These seasons are all exact because he spent them with us.
    expect(history.every((h) => h.overall.exact)).toBe(true);
    expect(history[history.length - 1]!.overall.mid).toBeGreaterThan(history[0]!.overall.mid);
    expect(history.map((h) => h.season)).toEqual([0, 1, 2]);
  });

  it("keeps the seasons a player spent with us after he is sold", () => {
    /*
     * Caught by this suite when the chart was fogged: gating history on "do we know him NOW" erased three
     * seasons of a youth graduate the day he was transferred. We watched those seasons. The row records
     * which club he was at, so they stay exact while anything he does afterwards is only as clear as our
     * scouting of him.
     */
    const c = career();
    const young = "t0-p0";
    playSeason(c);
    playSeason(c);
    playSeason(c);
    const snap = c.snapshot();
    const nowAt = Object.entries(snap.clubs).find(([, club]) => club.squad.playerIds.includes(young))?.[0];
    // The fixture's market moves him; if it ever stops, this test is no longer about anything.
    expect(nowAt).not.toBe(snap.managedClubId);
    expect(c.confidenceIn(young)).toBe(0);

    const history = c.playerHistory(young);
    const rawRows = snap.playerHistory?.[young] ?? [];
    expect(rawRows.length).toBe(3);

    // What we lived: exact, and still there. What he did after leaving: absent, because we stopped
    // watching. Half a curve is the honest answer, and it is not the same as no curve.
    expect(history.length).toBeGreaterThan(0);
    expect(history.length).toBeLessThan(rawRows.length);
    expect(history.every((h) => h.overall.exact)).toBe(true);
    const oursSeasons = rawRows.filter((r) => r.clubId === snap.managedClubId).map((r) => r.season);
    expect(history.map((h) => h.season)).toEqual(oursSeasons);
  });

  it("survives a save/load", () => {
    const c = career();
    playSeason(c);
    const reloaded = Career.load(JSON.parse(JSON.stringify(c.snapshot())), league);
    expect(reloaded.playerHistory(MINE)).toEqual(c.playerHistory(MINE));
  });

  it("is deterministic from the seed", () => {
    const run = () => {
      const c = career();
      playSeason(c);
      playSeason(c);
      return c.playerHistory(MINE);
    };
    expect(run()).toEqual(run());
  });
});
