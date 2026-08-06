import { describe, expect, it } from "vitest";
import { Position } from "@fut/domain";
import type { LeagueData, PlayerData, TeamData } from "@fut/competition";
import { Career } from "@fut/career";

/**
 * Squad numbers: the dataset's, then the manager's.
 *
 * A number has to be stable — the match view used to hand out 1..N by lineup
 * order, so a player's shirt changed whenever the XI did and never matched the
 * squad screen.
 */

function attrs(v: number) {
  return {
    physical: { pace: v, stamina: v, strength: v, agility: v },
    mental: { decisions: v, composure: v, workRate: v, teamwork: v, aggression: v, anticipation: v, positioning: v, vision: v, offTheBall: v },
    technical: { passing: v, technique: v, dribbling: v, finishing: v, shotPower: v, tackling: v, marking: v, crossing: v, firstTouch: v, heading: v },
  };
}
const POS: [Position, boolean][] = [
  [Position.Goalkeeper, true], [Position.Goalkeeper, true],
  ...Array.from({ length: 8 }, () => [Position.CentreBack, false] as [Position, boolean]),
  ...Array.from({ length: 8 }, () => [Position.CentralMidfielder, false] as [Position, boolean]),
  ...Array.from({ length: 6 }, () => [Position.Striker, false] as [Position, boolean]),
];
/** `numbered` decides whether the dataset gives this squad shirt numbers. */
function team(id: string, r: number, numbered = true): TeamData {
  return {
    id, name: id, shortName: id.toUpperCase(),
    coach: { id: `${id}-c`, name: "C", age: 50, nationality: "BR", attributes: { adaptability: 60, tacticalKnowledge: 60, reactiveness: 60, composure: 60 } },
    players: POS.map(([p, gk], i) => ({
      id: `${id}-p${i}`, name: `${id}-p${i}`, age: 26, nationality: "BR", position: p, marketValue: 5_000_000,
      ...(numbered ? { shirtNumber: i + 1 } : {}),
      ...attrs(r), ...(gk ? { goalkeeping: { reflexes: r, handling: r, positioning: r, oneOnOnes: r } } : {}),
    })),
  };
}
const league: LeagueData = { id: "fic", name: "Fic", teams: [team("t0", 76), team("t1", 72), team("t2", 68), team("t3", 64)] };
const career = () => Career.create(league, { leagueId: "fic", managedClubId: "t0", seed: 21 });

describe("squad numbers", () => {
  it("uses what the dataset registered", () => {
    const c = career();
    expect(c.shirtNumber("t0-p0")).toBe(1);
    expect(c.shirtNumber("t0-p9")).toBe(10);
    expect(c.squad().find((e) => e.playerId === "t0-p9")!.shirtNumber).toBe(10);
  });

  it("never puts two players in the same shirt", () => {
    const numbers = [...career().squadNumbers().values()];
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("takes the manager's assignment over the dataset's", () => {
    const c = career();
    c.setShirtNumber("t0-p15", 99);
    expect(c.shirtNumber("t0-p15")).toBe(99);
  });

  it("swaps when the number is already worn, rather than duplicating it", () => {
    const c = career();
    const before = c.shirtNumber("t0-p15")!; // 16
    c.setShirtNumber("t0-p15", 10); // p9 wears 10
    expect(c.shirtNumber("t0-p15")).toBe(10);
    expect(c.shirtNumber("t0-p9")).toBe(before);
    const numbers = [...c.squadNumbers().values()];
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("refuses a number outside 1..99, leaving the squad untouched", () => {
    const c = career();
    const before = new Map(c.squadNumbers());
    for (const bad of [0, -1, 100, 7.5]) c.setShirtNumber("t0-p3", bad);
    expect([...c.squadNumbers()]).toEqual([...before]);
  });

  it("won't renumber another club's player", () => {
    const c = career();
    c.setShirtNumber("t1-p3", 77);
    expect(c.snapshot().shirtNumbers?.["t1-p3"]).toBeUndefined();
  });

  it("only reports free numbers that nobody wears", () => {
    const c = career();
    const worn = new Set(c.squadNumbers().values());
    for (const n of c.freeShirtNumbers()) expect(worn.has(n)).toBe(false);
  });

  it("puts the real number on the shirt in a match, not the lineup index", () => {
    const c = career();
    c.setShirtNumber("t0-p15", 99);
    const fx = c.nextUserFixture()!.fixture;
    const { home, away } = c.buildTeams(fx);
    const mine = [home, away].find((t) => t.id === "t0")!;
    const all = [...mine.startingXi, ...mine.bench];
    expect(all.find((p) => p.id === "t0-p15")?.shirtNumber).toBe(99);
    expect(all.find((p) => p.id === "t0-p0")?.shirtNumber).toBe(1);
  });

  it("survives a save/load round trip", () => {
    const c = career();
    c.setShirtNumber("t0-p15", 99);
    const reloaded = Career.load(JSON.parse(JSON.stringify(c.snapshot())), league);
    expect(reloaded.shirtNumber("t0-p15")).toBe(99);
  });
});

describe("a dataset with no numbers at all", () => {
  const bare: LeagueData = { id: "fic", name: "Fic", teams: [team("t0", 76, false), team("t1", 72, false)] };

  it("leaves everyone unnumbered rather than inventing numbers", () => {
    const c = Career.create(bare, { leagueId: "fic", managedClubId: "t0", seed: 5 });
    expect(c.squadNumbers().size).toBe(0);
    expect(c.squad().every((e) => e.shirtNumber === undefined)).toBe(true);
  });

  it("still lets the manager assign one", () => {
    const c = Career.create(bare, { leagueId: "fic", managedClubId: "t0", seed: 5 });
    c.setShirtNumber("t0-p4", 5);
    expect(c.shirtNumber("t0-p4")).toBe(5);
    expect(c.squadNumbers().size).toBe(1);
  });
});
