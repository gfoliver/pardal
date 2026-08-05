import type { DatasetWorld } from "@fut/competition";
import { describe, expect, it } from "vitest";
import {
  Career,
  PROMOTED_PER_SEASON,
  RELEGATED_PER_SEASON,
  deserializeCareer,
  serializeCareer,
} from "@fut/career";
import { fixtureLeague } from "./fixtures.js";

/**
 * Two divisions, and clubs that actually move between them.
 *
 * The mechanics existed before this and did nothing: `Division` carried `promotionSlots`, the career
 * carried a `divisionId` per competition, and `applyPromotionRelegation` pushed an inbox message
 * without touching a single team list — so the second tier's champion played the second tier again.
 *
 * Six clubs a division, not four. With four the real slot count (4 up, 4 down) would exchange the
 * ENTIRE division every season and every assertion below would pass for the wrong reason.
 */

const TOP = ["a0", "a1", "a2", "a3", "a4", "a5"];
const SECOND = ["b0", "b1", "b2", "b3", "b4", "b5"];

function twoTierWorld(): DatasetWorld {
  return {
    clubs: [...TOP, ...SECOND].map((id) => ({ id, reputation: 60 })),
    competitions: [
      // Deliberately listed bottom-tier-first, so the ordering is proved to come from `tier`.
      { id: "T2", name: "Second Division", type: "league", tier: 2, entrantClubIds: SECOND },
      { id: "T1", name: "Top Division", type: "league", tier: 1, entrantClubIds: TOP },
    ],
  };
}

const career = (seed: number, managed = "a0") =>
  Career.create(fixtureLeague([...TOP, ...SECOND]), {
    leagueId: "fic",
    managedClubId: managed,
    seed,
    world: twoTierWorld(),
  });

/** The team ids of a division, in the structure. */
const membersOf = (c: Career, divisionId: string) =>
  [...(c.snapshot().structure.divisions.find((d) => d.id === divisionId)?.teamIds ?? [])].sort();

describe("a two-tier world", () => {
  it("becomes two divisions, ordered by tier rather than by listing order", () => {
    const snap = career(1).snapshot();
    expect(snap.structure.divisions.map((d) => [d.id, d.tier, d.name])).toEqual([
      ["d1", 1, "Top Division"],
      ["d2", 2, "Second Division"],
    ]);
    expect(membersOf(career(1), "d1")).toEqual([...TOP].sort());
    expect(membersOf(career(1), "d2")).toEqual([...SECOND].sort());
  });

  it("promotes nobody from the top and relegates nobody from the bottom", () => {
    // The pyramid's ends. Reading movement off `tier` alone would invent both.
    const [d1, d2] = career(1).snapshot().structure.divisions;
    expect(d1!.promotionSlots).toBe(0);
    expect(d1!.relegationSlots).toBe(RELEGATED_PER_SEASON);
    expect(d2!.promotionSlots).toBe(PROMOTED_PER_SEASON);
    expect(d2!.relegationSlots).toBe(0);
  });

  it("gives each club the division it plays in", () => {
    // Asserted through `leagueName`, which is what the club page prints — so this covers the whole
    // chain (club record → structure → the words on screen) rather than just the stored id.
    const c = career(1);
    expect(c.clubDetail("a3")?.leagueName).toBe("Top Division");
    expect(c.clubDetail("b3")?.leagueName).toBe("Second Division");
  });

  it("reads a lower-division club's form and record from its OWN table", () => {
    /*
     * `clubDetail` used to take the competition literally called "league" for both. A second-division
     * club has no row in the first division's table, so its record came back empty while its form was
     * built from matches it never played.
     */
    const c = career(2);
    c.simulateSeason();
    const b = c.clubDetail("b0")!;
    const row = c.table("league-d2").find((r) => r.teamId === "b0")!;
    expect(b.record).toEqual({ won: row.won, drawn: row.drawn, lost: row.lost });
    // A club that played a full season has form; reading the wrong table gave it none.
    expect(b.form.length).toBeGreaterThan(0);
    expect(b.record.won + b.record.drawn + b.record.lost).toBe(row.played);
  });

  it("simulates BOTH divisions, not just the manager's", () => {
    const c = career(2);
    c.simulateSeason();
    const top = c.table("league");
    const second = c.table("league-d2");
    expect(top).toHaveLength(6);
    expect(second).toHaveLength(6);
    // The second division is a real season, not an empty table with the right shape.
    expect(second.reduce((s, r) => s + r.played, 0)).toBeGreaterThan(0);
    expect(second.reduce((s, r) => s + r.goalsFor, 0)).toBeGreaterThan(0);
  });
});

describe("what a screen is offered to choose between", () => {
  /**
   * `divisions()` is the whole basis of the league screen's picker, so it is pinned here rather than
   * trusted: the screen opens on `isMine`, labels the tabs from `name`, asks for a table by
   * `competitionId` and finds the badge by `sourceCompetitionId`. Getting any of the four wrong is a
   * screen showing one division's name over another's table.
   */
  it("lists the pyramid top-tier-first, with everything the screen needs", () => {
    const c = career(1, SECOND[0]);
    expect(c.divisions()).toEqual([
      { id: "d1", name: "Top Division", tier: 1, competitionId: "league", sourceCompetitionId: "T1", isMine: false },
      { id: "d2", name: "Second Division", tier: 2, competitionId: "league-d2", sourceCompetitionId: "T2", isMine: true },
    ]);
  });

  it("moves `isMine` with the manager when he is relegated", () => {
    const c = career(6, TOP[0]);
    expect(c.divisions().find((d) => d.isMine)?.id).toBe("d1");
    c.simulateSeason();
    c.rolloverSeason();
    const mine = c.divisions().find((d) => d.isMine)!;
    // Whichever way it went, the division claiming him is the one his club is in.
    expect(mine.id).toBe(c.clubDetail(TOP[0]!)?.leagueName === "Top Division" ? "d1" : "d2");
    expect(c.table().map((r) => r.teamId)).toContain(TOP[0]);
  });

  it("gives a one-division career exactly one entry", () => {
    const c = Career.create(fixtureLeague(["t0", "t1", "t2", "t3"]), { leagueId: "fic", managedClubId: "t0", seed: 9 });
    const [only, ...rest] = c.divisions();
    expect(rest).toEqual([]);
    expect(only).toMatchObject({ id: "d1", competitionId: "league", isMine: true });
    // No dataset behind it, so no badge to find — and the screen must not invent one.
    expect(only!.sourceCompetitionId).toBeUndefined();
  });
});

describe("promotion and relegation at the rollover", () => {
  it("swaps the bottom of the upper tier with the top of the lower", () => {
    const c = career(3);
    c.simulateSeason();
    const before = { top: c.table("league"), second: c.table("league-d2") };
    const relegated = before.top.slice(-RELEGATED_PER_SEASON).map((r) => r.teamId);
    const promoted = before.second.slice(0, PROMOTED_PER_SEASON).map((r) => r.teamId);

    c.rolloverSeason();

    // The structure moved them...
    expect(membersOf(c, "d1")).toEqual(
      [...before.top.slice(0, -RELEGATED_PER_SEASON).map((r) => r.teamId), ...promoted].sort(),
    );
    expect(membersOf(c, "d2")).toEqual(
      [...before.second.slice(PROMOTED_PER_SEASON).map((r) => r.teamId), ...relegated].sort(),
    );
    // ...and so did the club records, which is what every screen naming a club's league reads.
    for (const id of promoted) expect(c.clubDetail(id)?.leagueName).toBe("Top Division");
    for (const id of relegated) expect(c.clubDetail(id)?.leagueName).toBe("Second Division");
  });

  it("keeps both divisions the size they started", () => {
    // The whole reason movement is a SWAP: a league that grows cannot keep its fixture list.
    const c = career(4);
    c.simulateSeason();
    c.rolloverSeason();
    expect(membersOf(c, "d1")).toHaveLength(TOP.length);
    expect(membersOf(c, "d2")).toHaveLength(SECOND.length);
  });

  it("builds next season's fixtures from the NEW membership", () => {
    /*
     * The defect this pins. The old code regenerated fixtures from `competition.teamIds`, which
     * promotion had not touched — so the structure said a club had come up while the calendar had it
     * playing in the division it left.
     */
    const c = career(5);
    c.simulateSeason();
    const promoted = c.table("league-d2").slice(0, PROMOTED_PER_SEASON).map((r) => r.teamId);
    c.rolloverSeason();

    expect(c.table("league").map((r) => r.teamId).sort()).toEqual(membersOf(c, "d1"));
    c.simulateSeason();
    const top = c.table("league");
    for (const id of promoted) {
      expect(top.find((r) => r.teamId === id)?.played).toBeGreaterThan(0);
    }
  });

  it("moves the manager's own club when he is relegated", () => {
    // Managing a club that goes down has to leave him managing it, in the lower division.
    const c = career(6);
    c.simulateSeason();
    const bottom = c.table("league").slice(-1)[0]!.teamId;
    const managed = career(6, bottom);
    managed.simulateSeason();
    managed.rolloverSeason();
    expect(managed.snapshot().managedClubId).toBe(bottom);
    expect(managed.clubDetail(bottom)?.leagueName).toBe("Second Division");
    // And his own table follows him down, rather than staying the one he was thrown out of.
    expect(managed.table().map((r) => r.teamId)).toContain(bottom);
  });

  it("announces both halves of the exchange in one message", () => {
    const c = career(7);
    c.simulateSeason();
    c.rolloverSeason();
    const msg = c.snapshot().inbox.find((m) => m.type === "promotionRelegation");
    expect(msg).toBeDefined();
    expect(String(msg!.params.promoted).split(",")).toHaveLength(PROMOTED_PER_SEASON);
    expect(String(msg!.params.relegated).split(",")).toHaveLength(RELEGATED_PER_SEASON);
  });

  it("is deterministic — the same seed moves the same clubs", () => {
    const run = () => {
      const c = career(8);
      c.simulateSeason();
      c.rolloverSeason();
      return membersOf(c, "d1");
    };
    expect(run()).toEqual(run());
  });
});

describe("a save written before the pyramid", () => {
  /**
   * A save on disk must keep loading. This strips the three things a pre-pyramid career can be
   * missing and checks the career comes back as what it actually is — one division — rather than
   * either throwing or inventing a second tier whose clubs are not in the save.
   */
  const legacySave = () => {
    const c = Career.create(fixtureLeague(["t0", "t1", "t2", "t3"]), {
      leagueId: "fic",
      managedClubId: "t0",
      seed: 11,
    });
    c.advance();
    const raw = JSON.parse(serializeCareer(c.snapshot())) as Record<string, unknown> & {
      structure?: unknown;
      competitions: { divisionId?: string }[];
      clubs: Record<string, { divisionId?: string }>;
    };
    delete raw.structure;
    for (const comp of raw.competitions) delete comp.divisionId;
    for (const club of Object.values(raw.clubs)) delete club.divisionId;
    return JSON.stringify(raw);
  };

  it("loads, and comes back as a single division", () => {
    const c = Career.load(deserializeCareer(legacySave()), fixtureLeague(["t0", "t1", "t2", "t3"]));
    const divisions = c.snapshot().structure.divisions;
    expect(divisions).toHaveLength(1);
    expect(divisions[0]!.teamIds).toHaveLength(4);
    expect(divisions[0]!.promotionSlots).toBe(0);
  });

  it("still has a table, a board review and a rollover that moves nobody", () => {
    // The failure this guards: the rollover finds a division's table BY id, so a league that does not
    // name its division loses its final table — and with it the review and the prize money — in
    // silence rather than with an error.
    const c = Career.load(deserializeCareer(legacySave()), fixtureLeague(["t0", "t1", "t2", "t3"]));
    c.simulateSeason();
    expect(c.table()).toHaveLength(4);
    const before = membersOf(c, "d1");
    c.rolloverSeason();
    expect(membersOf(c, "d1")).toEqual(before);
    // A fresh season really was built, rather than the old one being left in place.
    expect(c.table().reduce((s, r) => s + r.played, 0)).toBe(0);
  });
});

describe("a one-league world", () => {
  it("still produces a single division that moves nobody", () => {
    // The shape every career up to now has had, and it must not have grown a pyramid.
    const c = Career.create(fixtureLeague(["t0", "t1", "t2", "t3"]), {
      leagueId: "fic",
      managedClubId: "t0",
      seed: 9,
    });
    const divisions = c.snapshot().structure.divisions;
    expect(divisions).toHaveLength(1);
    expect(divisions[0]!.id).toBe("d1");
    expect(divisions[0]!.promotionSlots).toBe(0);
    expect(divisions[0]!.relegationSlots).toBe(0);

    c.simulateSeason();
    const before = membersOf(c, "d1");
    c.rolloverSeason();
    expect(membersOf(c, "d1")).toEqual(before);
  });
});
