import { describe, expect, it } from "vitest";
import { Position } from "@fut/domain";
import type { LeagueData, PlayerData, TeamData } from "@fut/competition";
import {
  activeListings,
  apply,
  createCareer,
  effectiveOverall,
  generateUserOffers,
  indexPlayers,
  isListed,
  listingFor,
  pruneListings,
  suggestedAsk,
  type CareerState,
} from "@fut/career";

// Same shape as transfer.test.ts: eighteen players, four clubs, no market values in the
// data so valuations come from the derived model.
function attrs(v: number) {
  return {
    physical: { pace: v, stamina: v, strength: v, agility: v },
    mental: { decisions: v, composure: v, workRate: v, teamwork: v, aggression: v, anticipation: v, positioning: v, vision: v },
    technical: { passing: v, technique: v, dribbling: v, finishing: v, shotPower: v, tackling: v, marking: v, crossing: v },
  };
}
function player(id: string, position: Position, v: number, gk = false): PlayerData {
  return { id, name: id, age: 24, nationality: "BR", position, ...attrs(v), ...(gk ? { goalkeeping: { reflexes: v, handling: v, positioning: v, oneOnOnes: v } } : {}) };
}
const POS: [Position, boolean][] = [
  [Position.Goalkeeper, true], [Position.Goalkeeper, true],
  [Position.CentreBack, false], [Position.CentreBack, false], [Position.CentreBack, false], [Position.CentreBack, false],
  [Position.FullBack, false], [Position.FullBack, false], [Position.FullBack, false], [Position.FullBack, false],
  [Position.CentralMidfielder, false], [Position.CentralMidfielder, false],
  [Position.Winger, false], [Position.Winger, false],
  [Position.Striker, false], [Position.Striker, false], [Position.Striker, false], [Position.Striker, false],
];
function team(id: string, rating: number): TeamData {
  const coach = { id: `${id}-c`, name: "C", age: 50, nationality: "BR", attributes: { adaptability: 60, tacticalKnowledge: 60, reactiveness: 60, composure: 60 } };
  return { id, name: id, shortName: id.toUpperCase(), coach, players: POS.map(([p, gk], i) => player(`${id}-p${i}`, p, rating + (i % 5), gk)) };
}
function league(): LeagueData {
  return { id: "fic", name: "Fic", teams: [72, 70, 68, 66].map((r, i) => team(`t${i}`, r)) };
}

const lg = league();
const data = indexPlayers(lg);
const opts = { leagueId: "fic", managedClubId: "t0", seed: 11 };

/** The weakest man in our squad: nobody would ask about him unless we advertised him. */
function fringePlayerId(s: CareerState): string {
  return [...s.clubs.t0!.squad.playerIds]
    .sort((a, b) => effectiveOverall(data.get(a)!, s.playerDev[a]) - effectiveOverall(data.get(b)!, s.playerDev[b]))[0]!;
}

/**
 * How many of `ticks` interest windows produce a bid for `playerId`.
 *
 * Negotiations are cleared between ticks because an OPEN conversation about a player
 * suppresses the next one — leaving them in place would measure "how long the first offer
 * lasts" rather than how often one arrives.
 */
function interestRate(s: CareerState, playerId: string, ticks: number): number {
  let hits = 0;
  for (let tick = 0; tick < ticks; tick++) {
    s.negotiations = [];
    generateUserOffers(s, data, tick);
    if (s.negotiations.some((n) => n.playerId === playerId)) hits++;
  }
  s.negotiations = [];
  return hits / ticks;
}

/**
 * The opening bid a rival makes for a player listed at `askingPrice`.
 *
 * Walks forward through interest windows until one produces a bid, rather than pinning a
 * particular tick: whether a given window fires is a coin flip, and a test that depended
 * on which one would be pinning the RNG stream instead of the rule under test.
 */
function firstBidFor(askingPrice: number, playerId: string): number | undefined {
  const s = apply(createCareer(lg, opts), { type: "listPlayer", playerId, askingPrice });
  for (let tick = 0; tick < 40; tick++) {
    s.negotiations = [];
    generateUserOffers(s, data, tick);
    const n = s.negotiations.find((x) => x.playerId === playerId);
    if (n) return n.rounds[0]!.fee;
  }
  return undefined;
}

describe("transfer list", () => {
  it("lists and unlists one of our own players", () => {
    let s = createCareer(lg, opts);
    const id = fringePlayerId(s);
    expect(isListed(s, id)).toBe(false);

    s = apply(s, { type: "listPlayer", playerId: id, askingPrice: 5_000_000 });
    expect(listingFor(s, id)).toMatchObject({ playerId: id, clubId: "t0", askingPrice: 5_000_000 });

    s = apply(s, { type: "unlistPlayer", playerId: id });
    expect(isListed(s, id)).toBe(false);
  });

  it("refuses another club's player and a price of nothing", () => {
    const s = createCareer(lg, opts);
    const theirs = s.clubs.t1!.squad.playerIds[0]!;
    expect(apply(s, { type: "listPlayer", playerId: theirs, askingPrice: 1_000_000 })).toBe(s);
    const mine = fringePlayerId(s);
    expect(apply(s, { type: "listPlayer", playerId: mine, askingPrice: 0 })).toBe(s);
    expect(apply(s, { type: "listPlayer", playerId: mine, askingPrice: -1 })).toBe(s);
  });

  it("re-listing re-prices without restarting the clock", () => {
    let s = createCareer(lg, opts);
    const id = fringePlayerId(s);
    s = apply(s, { type: "listPlayer", playerId: id, askingPrice: 4_000_000 });
    const listedOn = listingFor(s, id)!.listedOn;

    s = { ...s, currentDate: { season: 0, dayOfSeason: 40 } };
    s = apply(s, { type: "listPlayer", playerId: id, askingPrice: 9_000_000 });

    expect(activeListings(s)).toHaveLength(1); // re-priced, not duplicated
    expect(listingFor(s, id)!.askingPrice).toBe(9_000_000);
    expect(listingFor(s, id)!.listedOn).toEqual(listedOn);
  });

  it("a listing goes quiet on its own once the player has left", () => {
    let s = createCareer(lg, opts);
    const id = fringePlayerId(s);
    s = apply(s, { type: "listPlayer", playerId: id, askingPrice: 4_000_000 });

    // Sold, by whatever route — the listing row is still in the array and nobody deleted
    // it, which is exactly the shape the stale-loan bug had.
    s.clubs.t0!.squad.playerIds = s.clubs.t0!.squad.playerIds.filter((p) => p !== id);
    s.clubs.t1!.squad.playerIds = [...s.clubs.t1!.squad.playerIds, id];

    expect(s.transfers.listings).toHaveLength(1);
    expect(isListed(s, id)).toBe(false);
    expect(activeListings(s)).toHaveLength(0);
    expect(pruneListings(s)).toBe(1);
    expect(s.transfers.listings).toHaveLength(0);
  });

  it("listing a fringe player is what makes anyone ask about him", () => {
    const before = createCareer(lg, opts);
    const id = fringePlayerId(before);
    // Unlisted, he is outside the band rivals look at at all.
    expect(interestRate(before, id, 40)).toBe(0);

    const after = apply(createCareer(lg, opts), { type: "listPlayer", playerId: id, askingPrice: suggestedAsk(before, data, id) });
    expect(interestRate(after, id, 40)).toBeGreaterThan(0.4);
  });

  it("a defensible ask is met outright; a fanciful one is not", () => {
    const base = createCareer(lg, opts);
    const id = fringePlayerId(base);
    const ask = suggestedAsk(base, data, id);

    expect(firstBidFor(ask, id)).toBe(ask);
    // Five times his worth: they are still interested, at their own number.
    expect(firstBidFor(ask * 5, id)).toBeLessThan(ask * 5);
  });

  it("is deterministic — same seed and same list produce the same bids", () => {
    const run = () => {
      const s = apply(createCareer(lg, opts), { type: "listPlayer", playerId: "t0-p17", askingPrice: 7_000_000 });
      generateUserOffers(s, data, 3);
      return s.negotiations;
    };
    expect(run()).toEqual(run());
  });
});
