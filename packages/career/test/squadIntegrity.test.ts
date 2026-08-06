import { describe, expect, it } from "vitest";
import { Position, PositionGroup } from "@fut/domain";
import type { LeagueData, PlayerData, TeamData } from "@fut/competition";
import {
  createCareer,
  executeTransfer,
  indexPlayers,
  isBorrowed,
  offCooldown,
  runTransferWindow,
  sellerAccepts,
  type CareerState,
} from "@fut/career";

/**
 * What an AI club is not allowed to do to its own squad.
 *
 * Every rule here was absent, and the league showed it: measured over five seasons on the real
 * forty-club dataset, TWO clubs finished the first season with no goalkeeper at all, and one player
 * completed 376 transfers. Both numbers came from the same root — nothing between a club and a sale
 * except the price.
 */

function attrs(v: number) {
  return {
    physical: { pace: v, stamina: v, strength: v, agility: v },
    mental: { decisions: v, composure: v, workRate: v, teamwork: v, aggression: v, anticipation: v, positioning: v, vision: v, offTheBall: v },
    technical: { passing: v, technique: v, dribbling: v, finishing: v, shotPower: v, tackling: v, marking: v, crossing: v, firstTouch: v, heading: v },
  };
}
const player = (id: string, position: Position, v: number, gk = false): PlayerData => ({
  id, name: id, age: 24, nationality: "BR", position, ...attrs(v),
  ...(gk ? { goalkeeping: { reflexes: v, handling: v, positioning: v, oneOnOnes: v } } : {}),
});

/** Exactly the per-line minimums, so any sale would breach one. Two keepers is the floor. */
const POS: [Position, boolean][] = [
  [Position.Goalkeeper, true], [Position.Goalkeeper, true],
  ...Array.from({ length: 6 }, () => [Position.CentreBack, false] as [Position, boolean]),
  ...Array.from({ length: 6 }, () => [Position.CentralMidfielder, false] as [Position, boolean]),
  ...Array.from({ length: 4 }, () => [Position.Striker, false] as [Position, boolean]),
  // Two spare forwards, so the ATTACK line has someone who can legally leave.
  [Position.Striker, false], [Position.Striker, false],
];
function team(id: string, rating: number): TeamData {
  const coach = { id: `${id}-c`, name: "C", age: 50, nationality: "BR", attributes: { adaptability: 60, tacticalKnowledge: 60, reactiveness: 60, composure: 60 } };
  return { id, name: id, shortName: id.toUpperCase(), coach, players: POS.map(([p, gk], i) => player(`${id}-p${i}`, p, rating + (i % 5), gk)) };
}
const league = (): LeagueData => ({ id: "fic", name: "Fic", teams: [72, 70, 68, 66].map((r, i) => team(`t${i}`, r)) });

const setup = () => {
  const lg = league();
  const state = createCareer(lg, { leagueId: "fic", managedClubId: "t0", seed: 11 });
  return { state, dataById: indexPlayers(lg) };
};
/** A fee nobody could refuse on price alone — ten times any valuation in the fixture. */
const ABSURD_FEE = 500_000_000;

describe("an AI club cannot sell its way out of a fieldable squad", () => {
  it("refuses to sell a second goalkeeper at any price", () => {
    const { state, dataById } = setup();
    // t1 has exactly two, which is the floor: neither is available.
    for (const keeper of ["t1-p0", "t1-p1"]) {
      expect(sellerAccepts(state, dataById, keeper, 1_000, ABSURD_FEE), keeper).toBe(false);
    }
  });

  it("still sells from a line that has cover", () => {
    // The point of the rule is a floor, not a freeze. Six forwards against a minimum of four, so two
    // of them can go — if this failed, the market would deadlock rather than be protected.
    const { state, dataById } = setup();
    const forwards = state.clubs.t1!.squad.playerIds.filter((id) => dataById.get(id)!.position === Position.Striker);
    expect(forwards.length).toBeGreaterThan(4);
    expect(sellerAccepts(state, dataById, forwards[0]!, 1_000, ABSURD_FEE)).toBe(true);
  });

  it("leaves the MANAGER free to run his squad down", () => {
    // `squad/composition` states this: the manager gets the warnings and answers for ignoring them.
    // His sales go through `respondToOffer`, but the rule must not catch him even if one day they do.
    const { state, dataById } = setup();
    expect(sellerAccepts(state, dataById, "t0-p0", 1_000, ABSURD_FEE)).toBe(true);
  });

  it("keeps every club at or above its line minimums across a full window", () => {
    const { state, dataById } = setup();
    for (let tick = 0; tick < 40; tick++) runTransferWindow(state, dataById, tick);
    for (const [id, club] of Object.entries(state.clubs)) {
      if (id === state.managedClubId) continue;
      const keepers = club.squad.playerIds.filter((p) => dataById.get(p)!.position === Position.Goalkeeper);
      expect(keepers.length, `${id} keepers`).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("a club cannot sell what it does not own", () => {
  it("refuses a sale of a player the club is only borrowing", () => {
    const { state, dataById } = setup();
    // Move a spare forward to t2 and record it as a loan, which is what `loanPlayer` produces.
    const lent = state.clubs.t1!.squad.playerIds.filter((id) => dataById.get(id)!.position === Position.Striker).at(-1)!;
    state.clubs.t1!.squad.playerIds = state.clubs.t1!.squad.playerIds.filter((id) => id !== lent);
    state.clubs.t2!.squad.playerIds = [...state.clubs.t2!.squad.playerIds, lent];
    state.transfers.loans.push({ playerId: lent, ownerClubId: "t1", borrowerClubId: "t2", until: { season: 0, dayOfSeason: state.totalDays }, wageSharePct: 0.5 });

    expect(isBorrowed(state, lent, "t2")).toBe(true);
    expect(isBorrowed(state, lent, "t1")).toBe(false);
    /*
     * The measured consequence of not asking: the borrower passed him on, and the next club passed him
     * on again. One player made seventeen moves in two seasons, five of them on one day, including
     * straight back to the club that had lent him out — every fee zero, because they were all loans.
     */
    expect(sellerAccepts(state, dataById, lent, 1_000, ABSURD_FEE)).toBe(false);
  });
});

describe("borrowed cover is not licence to sell your own man", () => {
  it("counts only the players a club OWNS against the line minimums", () => {
    const { state, dataById } = setup();
    // t1 has exactly two keepers of its own. Lend it a third from t2 and its squad list says three.
    const extra = state.clubs.t2!.squad.playerIds.find((id) => dataById.get(id)!.position === Position.Goalkeeper)!;
    state.clubs.t2!.squad.playerIds = state.clubs.t2!.squad.playerIds.filter((id) => id !== extra);
    state.clubs.t1!.squad.playerIds = [...state.clubs.t1!.squad.playerIds, extra];
    state.transfers.loans.push({ playerId: extra, ownerClubId: "t2", borrowerClubId: "t1", until: { season: 0, dayOfSeason: state.totalDays }, wageSharePct: 0.5 });
    expect(state.clubs.t1!.squad.playerIds.filter((id) => dataById.get(id)!.position === Position.Goalkeeper)).toHaveLength(3);

    /*
     * Counting bodies rather than players owned is how a club ended a season a goalkeeper short: three
     * by the count, sell one, two by the count, and then the loan goes home and it has one.
     */
    expect(sellerAccepts(state, dataById, "t1-p0", 1_000, ABSURD_FEE)).toBe(false);
  });
});

describe("a player who has just moved is not on the market again", () => {
  it("holds him for six months of career time, then releases him", () => {
    const { state } = setup();
    const pid = "t1-p0";
    state.contracts[pid] = {
      playerId: pid, clubId: "t1", wage: 1000,
      expiry: { season: 3, dayOfSeason: 0 },
      squadStatus: state.contracts[pid]!.squadStatus,
      signedOn: { season: 0, dayOfSeason: 1 },
      // The transfer date is what the cooldown reads — `signedOn` is when the contract was written,
      // and a renewal moves that without anybody changing club.
      lastTransferOn: { season: 0, dayOfSeason: 1 },
    };

    state.currentDate = { season: 0, dayOfSeason: 1 };
    expect(offCooldown(state, pid)).toBe(false);
    // Half the season is half a year, which is where the line sits — measured from the day he signed.
    const half = state.totalDays / 2;
    state.currentDate = { season: 0, dayOfSeason: Math.ceil(1 + half) - 1 };
    expect(offCooldown(state, pid)).toBe(false);
    state.currentDate = { season: 0, dayOfSeason: Math.ceil(1 + half) };
    expect(offCooldown(state, pid)).toBe(true);
    // And across a season boundary, where a naive day-of-season subtraction would go negative.
    state.currentDate = { season: 1, dayOfSeason: 0 };
    expect(offCooldown(state, pid)).toBe(true);
  });

  it("does not hold a player nobody has ever signed", () => {
    const { state } = setup();
    delete state.contracts["t1-p2"];
    expect(offCooldown(state, "t1-p2")).toBe(true);
  });

  it("does not hold a player for RENEWING — he has not moved", () => {
    /*
     * The cooldown reads `lastTransferOn`, not `signedOn`. A renewal writes a new contract on the spot
     * and rewrites `signedOn` with it, so reading that put every renewed player on a six-month transfer
     * cooldown for staying exactly where he was.
     */
    const { state } = setup();
    const pid = "t1-p0";
    state.currentDate = { season: 1, dayOfSeason: 40 };
    state.contracts[pid] = {
      ...state.contracts[pid]!,
      expiry: { season: 4, dayOfSeason: 40 },
      signedOn: { ...state.currentDate },
    };
    expect(state.contracts[pid]!.lastTransferOn).toBeUndefined();
    expect(offCooldown(state, pid)).toBe(true);
  });

  it("holds a player the career has actually moved", () => {
    const { state } = setup();
    state.currentDate = { season: 1, dayOfSeason: 40 };
    state.contracts["t1-p0"] = { ...state.contracts["t1-p0"]!, lastTransferOn: { season: 1, dayOfSeason: 39 } };
    expect(offCooldown(state, "t1-p0")).toBe(false);
  });
});

describe("a club remembers what it lost", () => {
  const queue = (state: CareerState, id: string) => state.clubs[id]!.replacing ?? [];
  /** A forward who is in the XI — losing him costs the club something it was fielding. */
  const starterForward = (state: CareerState, dataById: ReadonlyMap<string, PlayerData>, clubId: string) => {
    const club = state.clubs[clubId]!;
    return club.tacticSlots[0]!.lineup.find((id) => dataById.get(id)!.position === Position.Striker)!;
  };

  it("queues the line a departing STARTER played in", () => {
    const { state, dataById } = setup();
    expect(queue(state, "t1")).toEqual([]);
    executeTransfer(state, dataById, starterForward(state, dataById, "t1"), "t1", "t3", 1_000_000);
    expect(queue(state, "t1")).toEqual([PositionGroup.Attack]);
  });

  it("says nothing when the club loses a squad player it was not fielding", () => {
    // Otherwise every departure is a hole and the market churns on nothing.
    const { state, dataById } = setup();
    const club = state.clubs.t1!;
    const xi = club.tacticSlots[0]!.lineup;
    const ovr = (id: string) => dataById.get(id)!.technical.finishing;
    const spare = club.squad.playerIds
      .filter((id) => dataById.get(id)!.position === Position.Striker && !xi.includes(id))
      .sort((a, b) => ovr(a) - ovr(b))[0]!;
    executeTransfer(state, dataById, spare, "t1", "t3", 1_000_000);
    expect(queue(state, "t1")).toEqual([]);
  });

  it("records a line once, however many it loses there", () => {
    const { state, dataById } = setup();
    executeTransfer(state, dataById, starterForward(state, dataById, "t1"), "t1", "t3", 1_000_000);
    executeTransfer(state, dataById, starterForward(state, dataById, "t1"), "t1", "t3", 1_000_000);
    // A club that loses two strikers wants strikers, not strikers twice.
    expect(queue(state, "t1")).toEqual([PositionGroup.Attack]);
  });

  it("spends the note and forgets it, rather than queueing for ever", () => {
    const { state, dataById } = setup();
    executeTransfer(state, dataById, starterForward(state, dataById, "t1"), "t1", "t3", 1_000_000);
    expect(queue(state, "t1")).toHaveLength(1);
    // Enough ticks that t1 is certain to have taken its turn — `CLUB_ACTS_PER_WINDOW` is a chance.
    for (let tick = 0; tick < 60; tick++) runTransferWindow(state, dataById, tick);
    expect(queue(state, "t1")).toEqual([]);
  });

  it("never writes a note for the manager's club — he decides his own business", () => {
    const { state, dataById } = setup();
    executeTransfer(state, dataById, starterForward(state, dataById, "t0"), "t0", "t3", 1_000_000);
    expect(queue(state, "t0")).toEqual([]);
  });
});
