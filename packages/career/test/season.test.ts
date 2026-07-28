import { describe, expect, it } from "vitest";
import { Position } from "@fut/domain";
import type { LeagueData, PlayerData, TeamData } from "@fut/competition";
import { CareerRunner, createCareer, indexPlayers } from "@fut/career";

// --- tiny deterministic league fixture -------------------------------------
function attrs(v: number) {
  return {
    physical: { pace: v, stamina: v, strength: v, agility: v },
    mental: { decisions: v, composure: v, workRate: v, teamwork: v, aggression: v, anticipation: v, positioning: v, vision: v },
    technical: { passing: v, technique: v, dribbling: v, finishing: v, shotPower: v, tackling: v, marking: v, crossing: v },
  };
}
function player(id: string, position: Position, v: number, gk = false): PlayerData {
  return { id, name: id, age: 25, nationality: "BR", position, ...attrs(v), ...(gk ? { goalkeeping: { reflexes: v, handling: v, positioning: v, oneOnOnes: v } } : {}) };
}
// A 442-friendly 16-man squad at rating v.
const SQUAD_POS: [Position, boolean][] = [
  [Position.Goalkeeper, true], [Position.Goalkeeper, true],
  [Position.CentreBack, false], [Position.CentreBack, false], [Position.CentreBack, false],
  [Position.FullBack, false], [Position.FullBack, false], [Position.FullBack, false],
  [Position.CentralMidfielder, false], [Position.CentralMidfielder, false], [Position.CentralMidfielder, false], [Position.CentralMidfielder, false],
  [Position.Winger, false], [Position.Winger, false],
  [Position.Striker, false], [Position.Striker, false],
];
function team(id: string, rating: number): TeamData {
  const coach = { id: `${id}-c`, name: "C", age: 50, nationality: "BR", attributes: { adaptability: 60, tacticalKnowledge: 60, reactiveness: 60, composure: 60 } };
  const players = SQUAD_POS.map(([pos, gk], i) => player(`${id}-p${i}`, pos, rating, gk));
  return { id, name: id.toUpperCase(), shortName: id.slice(0, 3).toUpperCase(), coach, players };
}
function makeLeague(): LeagueData {
  const ratings = [78, 74, 70, 66, 62, 58];
  return { id: "fic", name: "Série Fictícia", teams: ratings.map((r, i) => team(`t${i}`, r)) };
}

describe("career season (headless)", () => {
  const league = makeLeague();
  const opts = { leagueId: "fic", managedClubId: "t0", seed: 7 };

  function run() {
    const state = createCareer(league, opts);
    const runner = new CareerRunner(state, indexPlayers(league));
    runner.simulateSeason();
    return runner;
  }

  it("plays a full double round-robin (10 games each for 6 teams)", () => {
    const r = run();
    expect(r.seasonComplete).toBe(true);
    const table = r.table("league");
    expect(table).toHaveLength(6);
    for (const row of table) expect(row.played).toBe(10);
  });

  it("produces goals", () => {
    const r = run();
    const totalGoals = r.table("league").reduce((s, row) => s + row.goalsFor, 0);
    expect(totalGoals).toBeGreaterThan(0);
  });

  it("is deterministic — same seed reproduces the exact final table", () => {
    const a = run().table("league");
    const b = run().table("league");
    expect(a).toEqual(b);
  });
});

/**
 * `advanceDay` used to jump straight to the next match day, so a "day by day"
 * button moved a week per press and the manager never saw a Tuesday.
 */
describe("the calendar advances one day at a time", () => {
  const league = makeLeague();
  const opts = { leagueId: "fic", managedClubId: "t0", seed: 7 };
  const start = () => {
    const s = createCareer(league, opts);
    return { s, runner: new CareerRunner(s, indexPlayers(league)) };
  };
  /** Get past the opening fixture so we're mid-week rather than on a match day. */
  const clearOpeningDay = (runner: CareerRunner, s: ReturnType<typeof createCareer>) => {
    let guard = 0;
    while (runner.peekNextStop() === "userMatch" && guard++ < 5) {
      const u = runner.nextUserFixture()!;
      runner.commitUserFixture(u.comp, u.fixture, { homeScore: 0, awayScore: 0, timeline: [], discipline: { yellowCards: 0, redCards: 0, byPlayer: {} } } as never);
    }
    return s.currentDate.dayOfSeason;
  };

  it("moves exactly one day when nothing is on", () => {
    const { s, runner } = start();
    // Resolve the opening round first. Stopping on the manager's game leaves
    // the rest of that day's fixtures pending, so they're played on the next
    // advance WITHOUT the clock moving — correct, and worth stepping past here.
    clearOpeningDay(runner, s);
    const before = s.currentDate.dayOfSeason;
    let guard = 0;
    while (s.currentDate.dayOfSeason === before && guard++ < 5) runner.advanceDay();
    expect(s.currentDate.dayOfSeason).toBe(before + 1);

    // From here, with an empty week ahead, each call is exactly one day.
    const mid = s.currentDate.dayOfSeason;
    expect(runner.advanceDay().day).toBe(mid + 1);
  });

  it("never steps OVER a match day", () => {
    const { s, runner } = start();
    const days: number[] = [];
    for (let i = 0; i < 12; i++) {
      const { blocked, day } = runner.advanceDay();
      days.push(day);
      if (blocked === "userMatch") {
        const u = runner.nextUserFixture()!;
        // We are standing ON the fixture's day, not past it.
        expect(u.fixture.day).toBe(s.currentDate.dayOfSeason);
        runner.commitUserFixture(u.comp, u.fixture, { homeScore: 1, awayScore: 0, timeline: [], discipline: { yellowCards: 0, redCards: 0, byPlayer: {} } } as never);
      }
    }
    // Strictly non-decreasing, and never a gap wider than a day.
    for (let i = 1; i < days.length; i++) expect(days[i]! - days[i - 1]!).toBeLessThanOrEqual(1);
  });

  it("stops on the manager's own fixture without playing it", () => {
    const { s, runner } = start();
    let guard = 0;
    let blocked: string | null = null;
    while (guard++ < 40 && blocked !== "userMatch") blocked = runner.advanceDay().blocked;
    expect(blocked).toBe("userMatch");
    const u = runner.nextUserFixture();
    expect(u).not.toBeNull();
    expect(u!.fixture.day).toBe(s.currentDate.dayOfSeason);
  });

  it("only calls it the manager's match once the day has arrived", () => {
    const { s, runner } = start();
    // Play the opener so the next user fixture is a week away.
    clearOpeningDay(runner, s);
    runner.advanceDay();
    const nextUser = runner.nextUserFixture()!.fixture.day;
    if (nextUser > s.currentDate.dayOfSeason) {
      // Days still to run: the manager should be able to advance, not be told
      // to play a match that isn't for another week.
      expect(runner.peekNextStop()).toBe("ai");
    }
  });

  it("reports season end rather than looping once every fixture is played", () => {
    const { runner } = start();
    runner.simulateSeason();
    expect(runner.advanceDay()).toMatchObject({ blocked: "seasonEnd" });
  });
});

describe("season rollover", () => {
  const league = makeLeague();
  const opts = { leagueId: "fic", managedClubId: "t0", seed: 7 };

  it("advances season, ages players, and reopens the fixture list", () => {
    const s = createCareer(league, opts);
    const runner = new CareerRunner(s, indexPlayers(league));
    runner.simulateSeason();
    const ageBefore = s.playerDev["t0-p14"]!.ageAtSeasonStart;
    runner.rolloverSeason();
    expect(s.currentDate.season).toBe(1);
    expect(s.playerDev["t0-p14"]!.ageAtSeasonStart).toBe(ageBefore + 1);
    expect(runner.seasonComplete).toBe(false); // a fresh season to play
  });

  it("two full seasons reproduce identical tables", () => {
    function twoSeasons() {
      const s = createCareer(league, opts);
      const r = new CareerRunner(s, indexPlayers(league));
      r.simulateSeason();
      const t1 = r.table("league");
      r.rolloverSeason();
      r.simulateSeason();
      return { t1, t2: r.table("league") };
    }
    expect(twoSeasons()).toEqual(twoSeasons());
  });
});
