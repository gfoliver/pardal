import { describe, expect, it } from "vitest";
import { Position } from "@fut/domain";
import type { LeagueData, PlayerData, TeamData } from "@fut/competition";
import { Career } from "@fut/career";

/**
 * What the screens are allowed to read, and what they must agree on.
 *
 * The squad list and the player profile each show the same six summary categories, from the same
 * twenty-four attributes — but through different lenses: the profile draws the SCOUT'S estimate, the
 * squad list the true value, because a manager knows his own players. Two copies of that formula
 * would let one player score 74 on one screen and 71 on the other, so there is one, and this is what
 * holds it to one.
 *
 * The rest pins the fog line on a market row. Ability is scouted; a contract's end date is not —
 * expiry is published and argued about in the press, and hiding it would remove the most ordinary
 * piece of squad planning there is.
 */

/** Deliberately uneven, so the six categories cannot all collapse to the same number. */
function attrs() {
  return {
    physical: { pace: 82, stamina: 61, strength: 74, agility: 70 },
    mental: { decisions: 66, composure: 58, workRate: 71, teamwork: 63, aggression: 55, anticipation: 77, positioning: 69, vision: 80 },
    technical: { passing: 75, technique: 68, dribbling: 84, finishing: 59, shotPower: 72, tackling: 48, marking: 51, crossing: 65 },
  };
}
const POS: [Position, boolean][] = [
  [Position.Goalkeeper, true], [Position.Goalkeeper, true],
  ...Array.from({ length: 6 }, () => [Position.CentreBack, false] as [Position, boolean]),
  ...Array.from({ length: 6 }, () => [Position.CentralMidfielder, false] as [Position, boolean]),
  ...Array.from({ length: 4 }, () => [Position.Striker, false] as [Position, boolean]),
];
function team(id: string): TeamData {
  return {
    id, name: id, shortName: id.toUpperCase(),
    coach: { id: `${id}-c`, name: "C", age: 50, nationality: "BR", attributes: { adaptability: 60, tacticalKnowledge: 60, reactiveness: 60, composure: 60 } },
    players: POS.map(([p, gk], i) => ({
      id: `${id}-p${i}`,
      name: `${id}-p${i}`,
      age: 25,
      // Varied so a nationality filter has something to bite on.
      nationality: i % 3 === 0 ? "AR" : "BR",
      position: p,
      // A second natural position for some, which is exactly how the real data behaves.
      ...(i % 2 === 0 ? { naturalPositions: [p, Position.FullBack] } : {}),
      ...attrs(),
      ...(gk ? { goalkeeping: { reflexes: 70, handling: 70, positioning: 70, oneOnOnes: 70 } } : {}),
    } as PlayerData)),
  };
}
const league: LeagueData = { id: "fic", name: "Fic", teams: ["t0", "t1", "t2", "t3"].map(team) };
const career = () => Career.create(league, { leagueId: "fic", managedClubId: "t0", seed: 11 });

/**
 * Walk the calendar forward, playing what has to be played.
 *
 * `advanceDay` alone does not do this: it stops on the managed club's own fixture and stays there,
 * so a loop of two hundred calls can leave the date exactly where it started.
 */
const advanceDays = (c: Career, days: number) => {
  const dayOf = () => {
    const s = c.snapshot();
    return s.currentDate.season * (s.totalDays || 1) + s.currentDate.dayOfSeason;
  };
  const target = dayOf() + days;
  let guard = 0;
  while (dayOf() < target && guard++ < 400) {
    if (c.peekNextStop() === "seasonEnd") c.rolloverSeason();
    else c.advance();
  }
};

describe("a squad row", () => {
  it("carries what a squad question actually needs", () => {
    const row = career().squad().find((r) => r.playerId === "t0-p0")!;
    expect(row.nationality).toBe("AR");
    // His own position is excluded; only the cover position remains.
    expect(row.secondaryPositions).toEqual([Position.FullBack]);
    expect(row.attrs.vel).toBeGreaterThan(0);
  });

  it("scores the six categories exactly as the profile does", () => {
    const c = career();
    // Our own player: no fog, so the profile's estimate-driven radar and the squad list's exact one
    // are computing the same thing and must land on the same numbers.
    for (const id of ["t0-p0", "t0-p8", "t0-p16"]) {
      const row = c.squad().find((r) => r.playerId === id)!;
      const profile = c.playerDetail(id)!;
      expect(profile.confidence, `${id} is ours, so fully known`).toBe(100);
      expect(row.attrs, id).toEqual(profile.attrs);
    }
  });

  it("does not flatten an uneven player into one number", () => {
    const { attrs: a } = career().squad().find((r) => r.playerId === "t0-p8")!;
    // Quick and skilful, poor in the tackle — the shape the attributes describe.
    expect(a.vel).toBeGreaterThan(a.des);
    expect(new Set(Object.values(a)).size).toBeGreaterThan(1);
  });
});

describe("a market row", () => {
  it("tells us when a rival's contract runs out, scouted or not", () => {
    const rows = career().transferTargets();
    expect(rows.length).toBeGreaterThan(0);
    const unscouted = rows.filter((r) => r.confidence === 0);
    expect(unscouted.length, "an unwatched league is the normal starting state").toBeGreaterThan(0);
    for (const r of unscouted) {
      // The fog is over ability, and only ability.
      expect(r.overall, r.playerId).toBeUndefined();
      expect(r.value, r.playerId).toBeUndefined();
      expect(r.wageDemand, r.playerId).toBeUndefined();
      expect(typeof r.contractDaysLeft, r.playerId).toBe("number");
      expect(r.nationality, r.playerId).toMatch(/^(AR|BR)$/);
    }
  });

  it("estimates a wage separately from a value, not the same guess twice", () => {
    const c = career();
    // Scout someone until the numbers come through.
    const target = c.transferTargets()[0]!;
    c.scout(target.playerId);
    advanceDays(c, 200);

    const row = c.transferTargets().find((r) => r.playerId === target.playerId)!;
    // Asserted, not skipped past: a `if (!row.value) return` here would let the test pass while
    // proving nothing, which is worse than not having it.
    expect(row.confidence, "a season of watching should tell us something").toBeGreaterThan(0);
    expect(row.value).toBeDefined();
    expect(row.wageDemand).toBeDefined();
    // Both are bands around a true figure, and the wage is a monthly slice of a market value — so
    // the two must not be the identical band, which is what sharing one rng draw would produce.
    expect(row.wageDemand!.mid).not.toBe(row.value!.mid);
    expect(row.wageDemand!.mid).toBeLessThan(row.value!.mid);
  });
});
