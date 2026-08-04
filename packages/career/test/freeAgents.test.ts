import { describe, expect, it } from "vitest";
import { Career } from "@fut/career";
import {
  DECISION_DAYS,
  aiBidForFreeAgents,
  bidForFreeAgent,
  freeAgentDemands,
  isFreeAgent,
  resolveFreeAgents,
  withdrawFreeAgentBid,
} from "../src/transfer/FreeAgents.js";
import { InboxMessageType } from "../src/inbox/types.js";
import { MAX_SQUAD, MIN_SQUAD } from "../src/squad/composition.js";
import { absoluteDay } from "../src/time/tickDay.js";
import { fixtureDataById, fixtureLeague } from "./fixtures.js";

/**
 * Out-of-contract players, and the clubs competing to sign them.
 *
 * `freeAgentIds` used to be written by contract expiry and read by nothing, so every released player
 * left the game for good: five seasons took the league from 670 players under contract to 364, with
 * 306 stranded in a pool nobody could sign from and AI squads pinned to the composition floor. These
 * tests cover both halves of the fix — that a free agent can be signed at all, and that the manager
 * is in a race he can lose.
 */

const league = fixtureLeague();
const dataById = fixtureDataById(league);
const MINE = "t0";
const career = () => Career.create(league, { leagueId: "fic", managedClubId: MINE, seed: 11 });

/** Cut a player loose the way a lapsed contract does. */
function release(c: Career, playerId: string): void {
  const s = c.snapshot();
  const clubId = s.contracts[playerId]!.clubId;
  s.clubs[clubId]!.squad.playerIds = s.clubs[clubId]!.squad.playerIds.filter((id) => id !== playerId);
  delete s.contracts[playerId];
  (s.freeAgentIds ??= []).push(playerId);
}

/** Somebody at an AI club, so releasing him does not thin the managed squad. */
const loose = (c: Career) => {
  const id = c.snapshot().clubs.t1!.squad.playerIds[4]!;
  release(c, id);
  return id;
};

describe("what a free agent wants", () => {
  it("asks slightly under his market rate, having no leverage", () => {
    const c = career();
    const id = loose(c);
    const s = c.snapshot();
    const demands = freeAgentDemands(s, dataById, id)!;
    expect(demands.wage).toBeGreaterThan(0);
    // The discount is most of why signing a free agent is worth doing at all.
    expect(demands.minimumWage).toBeLessThan(demands.wage);
    expect(demands.years).toBeGreaterThanOrEqual(1);
  });

  it("is nobody's player until he signs", () => {
    const c = career();
    const id = loose(c);
    const s = c.snapshot();
    expect(isFreeAgent(s, id)).toBe(true);
    expect(Object.values(s.clubs).some((club) => club.squad.playerIds.includes(id))).toBe(false);
  });

  it("has no demands once he is not free", () => {
    const c = career();
    const s = c.snapshot();
    const contracted = s.clubs.t1!.squad.playerIds[0]!;
    expect(freeAgentDemands(s, dataById, contracted)).toBeUndefined();
  });
});

describe("bidding for a free agent", () => {
  it("refuses an offer under what he will consider", () => {
    const c = career();
    const id = loose(c);
    const s = c.snapshot();
    const demands = freeAgentDemands(s, dataById, id)!;
    expect(bidForFreeAgent(s, dataById, id, MINE, demands.minimumWage - 1, 3)).toEqual({
      placed: false,
      reason: "insulting",
    });
    expect(s.freeAgentBids ?? []).toHaveLength(0);
  });

  it("refuses a player who is not free", () => {
    const c = career();
    const s = c.snapshot();
    const contracted = s.clubs.t1!.squad.playerIds[0]!;
    expect(bidForFreeAgent(s, dataById, contracted, MINE, 1_000_000, 3).reason).toBe("notFree");
  });

  it("sets his decision day when the FIRST offer lands, not when he came loose", () => {
    const c = career();
    const id = loose(c);
    const s = c.snapshot();
    const demands = freeAgentDemands(s, dataById, id)!;
    expect(s.freeAgentBids ?? []).toHaveLength(0); // loose, but nobody is asking

    bidForFreeAgent(s, dataById, id, MINE, demands.wage, 3);
    expect(s.freeAgentBids![0]!.decidesDay).toBe(absoluteDay(s) + DECISION_DAYS);
  });

  it("replaces our own offer rather than stacking two, and does not reset his clock", () => {
    const c = career();
    const id = loose(c);
    const s = c.snapshot();
    const demands = freeAgentDemands(s, dataById, id)!;
    bidForFreeAgent(s, dataById, id, MINE, demands.wage, 3);
    const decidesDay = s.freeAgentBids![0]!.decidesDay;

    bidForFreeAgent(s, dataById, id, MINE, demands.wage * 2, 4);
    const interest = s.freeAgentBids![0]!;
    expect(interest.bids).toHaveLength(1);
    expect(interest.bids[0]!.wage).toBe(demands.wage * 2);
    // Otherwise a club could keep a player waiting for ever by nudging its offer.
    expect(interest.decidesDay).toBe(decidesDay);
  });

  it("lets us pull out", () => {
    const c = career();
    const id = loose(c);
    const s = c.snapshot();
    const demands = freeAgentDemands(s, dataById, id)!;
    bidForFreeAgent(s, dataById, id, MINE, demands.wage, 3);
    withdrawFreeAgentBid(s, id, MINE);
    expect(s.freeAgentBids![0]!.bids).toHaveLength(0);
  });
});

describe("the day he decides", () => {
  it("signs him, on the terms he accepted", () => {
    const c = career();
    const id = loose(c);
    const s = c.snapshot();
    const demands = freeAgentDemands(s, dataById, id)!;
    bidForFreeAgent(s, dataById, id, MINE, demands.wage, 3);

    resolveFreeAgents(s, dataById, absoluteDay(s) + DECISION_DAYS);

    expect(s.clubs[MINE]!.squad.playerIds).toContain(id);
    expect(s.contracts[id]!.wage).toBe(demands.wage);
    expect(s.contracts[id]!.clubId).toBe(MINE);
    expect(isFreeAgent(s, id)).toBe(false);
    // `years` from today, keeping the day of the season — the rule every signing follows.
    expect(s.contracts[id]!.expiry.season).toBe(s.currentDate.season + 3);
    expect(s.contracts[id]!.expiry.dayOfSeason).toBe(s.currentDate.dayOfSeason);
  });

  it("does nothing before that day", () => {
    const c = career();
    const id = loose(c);
    const s = c.snapshot();
    bidForFreeAgent(s, dataById, id, MINE, freeAgentDemands(s, dataById, id)!.wage, 3);

    resolveFreeAgents(s, dataById, absoluteDay(s) + DECISION_DAYS - 1);
    expect(s.clubs[MINE]!.squad.playerIds).not.toContain(id);
    expect(s.freeAgentBids).toHaveLength(1);
  });

  it("puts him in a lineup, so he is actually available", () => {
    const c = career();
    const id = loose(c);
    const s = c.snapshot();
    bidForFreeAgent(s, dataById, id, MINE, freeAgentDemands(s, dataById, id)!.wage, 3);
    resolveFreeAgents(s, dataById, absoluteDay(s) + DECISION_DAYS);

    const club = s.clubs[MINE]!;
    const active = club.tacticSlots.find((t) => t.id === club.activeTacticId)!;
    // Registered but in nobody's XI or bench would make him a signing you cannot pick.
    expect([...active.lineup, ...active.bench]).toContain(id);
  });

  it("tells us we got him, and how many we beat", () => {
    const c = career();
    const id = loose(c);
    const s = c.snapshot();
    const demands = freeAgentDemands(s, dataById, id)!;
    bidForFreeAgent(s, dataById, id, MINE, demands.wage * 1.5, 3);
    bidForFreeAgent(s, dataById, id, "t2", demands.minimumWage, 3);
    resolveFreeAgents(s, dataById, absoluteDay(s) + DECISION_DAYS);

    const msg = s.inbox.find((m) => m.type === InboxMessageType.FreeAgentSigned);
    expect(msg).toBeDefined();
    expect(msg!.params.rivals).toBe(1);
  });
});

describe("competing for one", () => {
  it("takes the better offer", () => {
    const c = career();
    const id = loose(c);
    const s = c.snapshot();
    const demands = freeAgentDemands(s, dataById, id)!;
    bidForFreeAgent(s, dataById, id, MINE, demands.minimumWage, 3);
    bidForFreeAgent(s, dataById, id, "t2", Math.round(demands.wage * 1.3), 3);

    resolveFreeAgents(s, dataById, absoluteDay(s) + DECISION_DAYS);
    expect(s.contracts[id]!.clubId).toBe("t2");
  });

  it("tells us when we are outbid, and by whom", () => {
    const c = career();
    const id = loose(c);
    const s = c.snapshot();
    const demands = freeAgentDemands(s, dataById, id)!;
    bidForFreeAgent(s, dataById, id, MINE, demands.minimumWage, 3);
    bidForFreeAgent(s, dataById, id, "t2", Math.round(demands.wage * 1.3), 3);
    resolveFreeAgents(s, dataById, absoluteDay(s) + DECISION_DAYS);

    const msg = s.inbox.find((m) => m.type === InboxMessageType.FreeAgentLost);
    expect(msg).toBeDefined();
    expect(msg!.params.clubId).toBe("t2");
  });

  it("says nothing about a race we were never in", () => {
    const c = career();
    const id = loose(c);
    const s = c.snapshot();
    bidForFreeAgent(s, dataById, id, "t2", freeAgentDemands(s, dataById, id)!.wage, 3);
    resolveFreeAgents(s, dataById, absoluteDay(s) + DECISION_DAYS);

    expect(s.inbox.some((m) => m.type === InboxMessageType.FreeAgentLost)).toBe(false);
  });

  it("lets us answer being outbid by raising our own", () => {
    const c = career();
    const id = loose(c);
    const s = c.snapshot();
    const demands = freeAgentDemands(s, dataById, id)!;
    bidForFreeAgent(s, dataById, id, MINE, demands.minimumWage, 3);
    bidForFreeAgent(s, dataById, id, "t2", Math.round(demands.wage * 1.2), 3);
    // The whole reason offers sit on the table until he decides.
    bidForFreeAgent(s, dataById, id, MINE, Math.round(demands.wage * 1.35), 3);

    resolveFreeAgents(s, dataById, absoluteDay(s) + DECISION_DAYS);
    expect(s.contracts[id]!.clubId).toBe(MINE);
  });

  /** Money cannot simply buy anyone, or the richest club signs the whole pool. */
  it("does not let an unlimited wage beat everything", () => {
    const c = career();
    const id = loose(c);
    const s = c.snapshot();
    const demands = freeAgentDemands(s, dataById, id)!;
    s.clubs[MINE]!.reputation = 20;
    s.clubs.t1!.reputation = 95;
    /*
     * Both offers are past `WAGE_SCORE_CAP` (1.4× his asking wage), where extra money stops earning
     * anything — so the two score identically on money and the club decides. Note the ceiling is not
     * only this cap: a bid also has to survive `canAffordWage`, so an absurd number is simply refused.
     */
    const overCap = Math.round(demands.wage * 1.6);
    expect(bidForFreeAgent(s, dataById, id, MINE, overCap, 3).placed).toBe(true);
    expect(bidForFreeAgent(s, dataById, id, "t1", overCap, 3).placed).toBe(true);

    resolveFreeAgents(s, dataById, absoluteDay(s) + DECISION_DAYS);
    expect(s.contracts[id]!.clubId).toBe("t1");
  });
});

describe("AI clubs in the market", () => {
  it("signs someone when a line is short", () => {
    const c = career();
    const id = loose(c);
    const s = c.snapshot();
    // Strip t2 down so it MUST fill a hole.
    s.clubs.t2!.squad.playerIds = s.clubs.t2!.squad.playerIds.slice(0, 12);

    for (let tick = 0; tick < 12; tick++) aiBidForFreeAgents(s, dataById, tick);
    expect((s.freeAgentBids ?? []).some((i) => i.bids.length > 0)).toBe(true);
    void id;
  });

  it("never bids for the managed club", () => {
    const c = career();
    loose(c);
    const s = c.snapshot();
    for (let tick = 0; tick < 12; tick++) aiBidForFreeAgents(s, dataById, tick);
    for (const interest of s.freeAgentBids ?? []) {
      expect(interest.bids.map((b) => b.clubId)).not.toContain(MINE);
    }
  });

  /**
   * The ceiling, learnt the hard way: with free agency wired up and nothing capping the opportunistic
   * path, one club had hoarded ninety players inside five seasons — a wealthy club is never short of
   * free agents better than its worst man.
   */
  it("stops signing players it does not need once the squad is full", () => {
    const c = career();
    const id = loose(c);
    const s = c.snapshot();
    // Pad t2 past the ceiling with players it already owns elsewhere, keeping every line covered.
    s.clubs.t2!.squad.playerIds = [...new Set([...s.clubs.t2!.squad.playerIds, ...s.clubs.t3!.squad.playerIds])];
    expect(s.clubs.t2!.squad.playerIds.length).toBeGreaterThanOrEqual(MAX_SQUAD);
    // Funded, so a refusal here is the ceiling talking and not the wage bill.
    s.clubs.t2!.finance.annualBudget = s.clubs.t2!.finance.annualBudget * 10;

    for (let tick = 0; tick < 12; tick++) aiBidForFreeAgents(s, dataById, tick);
    const bidders = (s.freeAgentBids ?? []).flatMap((i) => i.bids.map((b) => b.clubId));
    expect(bidders).not.toContain("t2");
    void id;
  });

  it("still fills a genuine hole above the ceiling — size is not the same as being able to field a side", () => {
    const c = career();
    const s = c.snapshot();
    // A huge squad with only one keeper still needs a keeper.
    const keeperId = s.clubs.t1!.squad.playerIds.find((id) => dataById.get(id)!.position === "goalkeeper")!;
    release(c, keeperId);
    const t2 = s.clubs.t2!;
    t2.squad.playerIds = [...new Set([...t2.squad.playerIds, ...s.clubs.t3!.squad.playerIds])]
      .filter((id) => dataById.get(id)!.position !== "goalkeeper");
    expect(t2.squad.playerIds.length).toBeGreaterThanOrEqual(MAX_SQUAD);
    // A squad that size carries a payroll that size: without the budget to match, the club is refused
    // for `cannotAfford` and the test would be measuring affordability rather than the ceiling.
    t2.finance.annualBudget = t2.finance.annualBudget * 10;

    for (let tick = 0; tick < 12; tick++) aiBidForFreeAgents(s, dataById, tick);
    const chased = (s.freeAgentBids ?? []).find((i) => i.playerId === keeperId);
    expect(chased?.bids.map((b) => b.clubId)).toContain("t2");
  });

  it("is deterministic for the same career and tick", () => {
    const run = () => {
      const c = career();
      loose(c);
      const s = c.snapshot();
      for (let tick = 0; tick < 6; tick++) aiBidForFreeAgents(s, dataById, tick);
      return JSON.stringify(s.freeAgentBids);
    };
    expect(run()).toBe(run());
  });
});

describe("over several seasons", () => {
  /**
   * The measurement that justified the feature: without a signing path the league drained. With one,
   * the pool has to stay bounded and squads have to stay near full.
   */
  it("drains the pool instead of letting it grow without limit", () => {
    const c = career();
    for (let i = 0; i < 4; i++) {
      let guard = 0;
      while (!c.seasonComplete && guard++ < 2_000) c.advance();
      c.rolloverSeason();
    }
    const s = c.snapshot();
    const pool = (s.freeAgentIds ?? []).length;
    const registered = Object.keys(s.contracts).length;
    const total = league.teams.reduce((a, t) => a + t.players.length, 0);

    // Most of the league is employed, rather than most of it stranded.
    expect(registered).toBeGreaterThan(total * 0.8);
    expect(pool).toBeLessThan(total * 0.2);
  });

  it("keeps AI squads off the floor now that they can restock", () => {
    const c = career();
    for (let i = 0; i < 4; i++) {
      let guard = 0;
      while (!c.seasonComplete && guard++ < 2_000) c.advance();
      c.rolloverSeason();
    }
    const s = c.snapshot();
    for (const [id, club] of Object.entries(s.clubs)) {
      if (id === s.managedClubId) continue;
      expect(club.squad.playerIds.length, id).toBeGreaterThan(MIN_SQUAD);
    }
  });
});

/**
 * The shape the market screen consumes.
 *
 * Worth its own tests because the table is the only place a manager can act on any of this, and the
 * two facts it exists to convey — that there IS competition, and how long is left to answer it — are
 * derived here rather than stored.
 */
describe("the row the market screen reads", () => {
  it("lists a free agent with what he wants", () => {
    const c = career();
    const id = loose(c);
    const row = c.freeAgents().find((r) => r.playerId === id)!;
    expect(row).toBeDefined();
    expect(row.askingWage).toBeGreaterThan(0);
    expect(row.minimumWage).toBeLessThan(row.askingWage);
    expect(row.overall).toBeGreaterThan(0);
    // Nobody has bid, so there is no clock yet and nothing to answer.
    expect(row.myBid).toBeUndefined();
    expect(row.rivalBids).toBe(0);
    expect(row.decidesInDays).toBeUndefined();
  });

  it("shows our own offer back to us", () => {
    const c = career();
    const id = loose(c);
    const asking = c.freeAgents().find((r) => r.playerId === id)!.askingWage;
    expect(c.bidForFreeAgent(id, asking, 3).placed).toBe(true);

    const row = c.freeAgents().find((r) => r.playerId === id)!;
    expect(row.myBid).toEqual({ wage: asking, years: 3 });
    expect(row.decidesInDays).toBe(DECISION_DAYS);
  });

  /** A count, not the numbers: outbidding should be judgement, not arithmetic. */
  it("counts rivals without exposing what they offered", () => {
    const c = career();
    const id = loose(c);
    const s = c.snapshot();
    const demands = freeAgentDemands(s, dataById, id)!;
    bidForFreeAgent(s, dataById, id, "t2", demands.wage * 1.2, 3);
    bidForFreeAgent(s, dataById, id, "t3", demands.wage * 1.1, 3);

    const row = c.freeAgents().find((r) => r.playerId === id)!;
    expect(row.rivalBids).toBe(2);
    expect(JSON.stringify(row)).not.toContain(String(Math.round(demands.wage * 1.2)));
  });

  it("drops him from the list once he has signed", () => {
    const c = career();
    const id = loose(c);
    const s = c.snapshot();
    c.bidForFreeAgent(id, freeAgentDemands(s, dataById, id)!.wage, 3);
    resolveFreeAgents(s, dataById, absoluteDay(s) + DECISION_DAYS);

    expect(c.freeAgents().some((r) => r.playerId === id)).toBe(false);
    expect(c.squad().some((e) => e.playerId === id)).toBe(true);
  });

  it("reports a refusal rather than silently doing nothing", () => {
    const c = career();
    const id = loose(c);
    const row = c.freeAgents().find((r) => r.playerId === id)!;
    expect(c.bidForFreeAgent(id, row.minimumWage - 1, 3)).toEqual({ placed: false, reason: "insulting" });
  });
});
