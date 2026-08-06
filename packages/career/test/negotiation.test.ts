import { describe, expect, it } from "vitest";
import { Position } from "@fut/domain";
import type { LeagueData, PlayerData, TeamData } from "@fut/competition";
import { Career, InboxMessageType, MAX_COUNTER_ROUNDS, OFFER_WINDOW_DAYS, indexPlayers, respondToBid, sellerStance } from "@fut/career";
import { BRIDGEABLE_GAP } from "../src/transfer/Negotiation.js";

function attrs(v: number) {
  return {
    physical: { pace: v, stamina: v, strength: v, agility: v },
    mental: { decisions: v, composure: v, workRate: v, teamwork: v, aggression: v, anticipation: v, positioning: v, vision: v, offTheBall: v },
    technical: { passing: v, technique: v, dribbling: v, finishing: v, shotPower: v, tackling: v, marking: v, crossing: v, firstTouch: v, heading: v },
  };
}
// Deep enough everywhere that "we'd be short" isn't the reason for every refusal.
const POS: [Position, boolean][] = [
  [Position.Goalkeeper, true], [Position.Goalkeeper, true], [Position.Goalkeeper, true],
  ...Array.from({ length: 8 }, () => [Position.CentreBack, false] as [Position, boolean]),
  ...Array.from({ length: 8 }, () => [Position.CentralMidfielder, false] as [Position, boolean]),
  ...Array.from({ length: 6 }, () => [Position.Striker, false] as [Position, boolean]),
];
function team(id: string, r: number): TeamData {
  return {
    id, name: id, shortName: id.toUpperCase(),
    coach: { id: `${id}-c`, name: "C", age: 50, nationality: "BR", attributes: { adaptability: 60, tacticalKnowledge: 60, reactiveness: 60, composure: 60 } },
    players: POS.map(([p, gk], i) => ({ id: `${id}-p${i}`, name: `${id}-p${i}`, age: 25, nationality: "BR", position: p, ...attrs(r), ...(gk ? { goalkeeping: { reflexes: r, handling: r, positioning: r, oneOnOnes: r } } : {}) })),
  };
}
const league: LeagueData = { id: "fic", name: "Fic", teams: [76, 72, 68, 64].map((r, i) => team(`t${i}`, r)) };
const opts = { leagueId: "fic", managedClubId: "t0", seed: 3 };
const TARGET = "t1-p10";

const career = () => {
  const c = Career.create(league, opts);
  // Deep pockets, so "you can't afford it" never masks the thing under test.
  c.snapshot().clubs.t0!.finance.annualBudget = 5_000_000_000;
  return c;
};
const dayOf = (c: Career) => {
  const s = c.snapshot();
  return s.currentDate.season * (s.totalDays || 1) + s.currentDate.dayOfSeason;
};
const advanceDays = (c: Career, days: number) => {
  const target = dayOf(c) + days;
  let guard = 0;
  while (dayOf(c) < target && guard++ < 400) {
    if (c.peekNextStop() === "seasonEnd") c.rolloverSeason();
    else c.advance();
  }
};
/** Our negotiation for a player, whatever stage it has reached — live or closed. */
const mine = (c: Career, id = TARGET) => c.myOffers().concat(c.settledOffers()).find((o) => o.playerId === id)!;

/**
 * Advance only until the seller has answered. Match days are a week apart, so
 * "advance 8 days" really lands on day 14 — past a 10-day deadline, which would
 * expire the very reply we're waiting to inspect.
 */
const advanceUntilAnswered = (c: Career) => {
  let guard = 0;
  while (mine(c)?.stage === "offered" && guard++ < 10) {
    if (c.peekNextStop() === "seasonEnd") c.rolloverSeason();
    else c.advance();
  }
};
const ask = (c: Career) => c.snapshot().negotiations.find((n) => n.playerId === TARGET);

describe("respondToBid — the seller's decision, in isolation", () => {
  const base = { askingPrice: 100, countersSoFar: 0, squadTooThin: false, isKeyPlayer: false };

  it("takes anything at or above the asking price", () => {
    expect(respondToBid({ ...base, bid: 100 })).toEqual({ kind: "accept" });
    expect(respondToBid({ ...base, bid: 150 })).toEqual({ kind: "accept" });
  });

  it("counters when the gap is bridgeable", () => {
    const r = respondToBid({ ...base, bid: 80 });
    expect(r.kind).toBe("counter");
    if (r.kind === "counter") {
      expect(r.fee).toBeLessThan(100); // they moved
      expect(r.fee).toBeGreaterThanOrEqual(80); // but never below our own bid
    }
  });

  it("refuses outright when the gap is not bridgeable, and says why", () => {
    const r = respondToBid({ ...base, bid: Math.round(100 * (1 - BRIDGEABLE_GAP) - 1) });
    expect(r).toEqual({ kind: "reject", reason: "belowValuation" });
  });

  it("blames the right thing for a key player", () => {
    expect(respondToBid({ ...base, bid: 10, isKeyPlayer: true })).toEqual({ kind: "reject", reason: "keyPlayer" });
  });

  it("won't sell at any price when it would leave a hole", () => {
    expect(respondToBid({ ...base, bid: 1_000_000, squadTooThin: true })).toEqual({ kind: "reject", reason: "squadTooThin" });
  });

  it("stops haggling after a bounded number of rounds", () => {
    expect(respondToBid({ ...base, bid: 90, countersSoFar: MAX_COUNTER_ROUNDS }).kind).toBe("reject");
  });

  it("concedes further with each round, so the haggle converges", () => {
    const feeAt = (n: number) => {
      const r = respondToBid({ ...base, bid: 80, countersSoFar: n });
      return r.kind === "counter" ? r.fee : NaN;
    };
    expect(feeAt(1)).toBeLessThan(feeAt(0));
    expect(feeAt(2)).toBeLessThan(feeAt(1));
  });
});

describe("a negotiation has a clock", () => {
  it("does not resolve the instant we bid — the seller takes time", () => {
    const c = career();
    expect(c.makeOffer(TARGET, 1_000_000).ok).toBe(true);
    expect(mine(c).stage).toBe("offered");
    expect(mine(c).daysLeft).toBe(OFFER_WINDOW_DAYS);
  });

  it("lapses if nobody moves, and tells the manager", () => {
    const c = career();
    // A bid so far below value that the seller rejects rather than counters
    // would end it early; use one that leaves them silent by withdrawing.
    c.makeOffer(TARGET, 1);
    const id = mine(c).id;
    c.snapshot().negotiations.find((n) => n.id === id)!.stage = "personalTerms"; // nobody's turn
    advanceDays(c, OFFER_WINDOW_DAYS + 2);

    expect(mine(c).stage).toBe("expired");
    expect(c.inbox().some((m) => m.type === InboxMessageType.TransferExpired)).toBe(true);
  });

  it("NEVER lets an unanswered offer freeze the calendar", () => {
    const c = career();
    const before = dayOf(c);
    // Rival bids for our players arrive on day 0 and go unanswered.
    expect(c.pendingOffers().length).toBeGreaterThan(0);
    advanceDays(c, 20);
    expect(dayOf(c)).toBeGreaterThan(before);
  });

  it("expires a bid for OUR player that we ignored — indecision has a price", () => {
    const c = career();
    const incoming = c.pendingOffers()[0]!;
    advanceDays(c, OFFER_WINDOW_DAYS + 2);
    expect(c.myOffers().concat(c.settledOffers(), c.pendingOffers()).some((o) => o.id === incoming.id && o.daysLeft !== undefined)).toBe(false);
  });
});

describe("the conversation", () => {
  it("comes back with a counter we can see, not a silent no", () => {
    const c = career();
    // Bid inside the bridgeable gap, so a counter is the correct answer.
    const asking = sellerStance(c.snapshot(), indexPlayers(league), TARGET).askingPrice;
    c.makeOffer(TARGET, Math.round(asking * 0.85));
    advanceUntilAnswered(c);

    const n = mine(c);
    expect(n.stage).toBe("countered");
    expect(n.theirLastFee).toBeGreaterThan(n.ourLastFee!); // they want more
    expect(n.theirLastFee).toBeLessThan(asking); // but they moved off their ask
    expect(n.rounds.map((r) => r.by)).toEqual(["buyer", "seller"]);
  });

  it("closes when we accept what they asked for", () => {
    const c = career();
    const asking = sellerStance(c.snapshot(), indexPlayers(league), TARGET).askingPrice;
    c.makeOffer(TARGET, Math.round(asking * 0.85));
    advanceUntilAnswered(c);
    c.acceptCounter(mine(c).id);

    expect(mine(c).stage).toBe("feeAgreed");
    expect(mine(c).agreedFee).toBe(mine(c).theirLastFee);
  });

  it("lapses a counter we leave sitting — the deadline binds both ways", () => {
    const c = career();
    const asking = sellerStance(c.snapshot(), indexPlayers(league), TARGET).askingPrice;
    c.makeOffer(TARGET, Math.round(asking * 0.85));
    advanceUntilAnswered(c);
    expect(mine(c).stage).toBe("countered");

    advanceDays(c, OFFER_WINDOW_DAYS + 7);
    expect(mine(c).stage).toBe("expired");
  });

  it("records every number that crossed the table", () => {
    const c = career();
    c.makeOffer(TARGET, 500_000);
    advanceDays(c, 8);
    const n = mine(c);
    expect(n.rounds.length).toBeGreaterThanOrEqual(1);
    expect(n.rounds[0]).toMatchObject({ by: "buyer", fee: 500_000 });
  });

  it("carries a reason when the club says no", () => {
    const c = career();
    c.makeOffer(TARGET, 1); // hopeless
    advanceDays(c, 8);
    const n = mine(c);
    expect(n.stage).toBe("rejected");
    expect(n.reason).toBeTruthy();
  });

  it("refuses a second conversation about the same player", () => {
    const c = career();
    expect(c.makeOffer(TARGET, 1_000_000).ok).toBe(true);
    expect(c.makeOffer(TARGET, 2_000_000).ok).toBe(false);
  });

  it("lets us walk away", () => {
    const c = career();
    c.makeOffer(TARGET, 1_000_000);
    c.withdrawOffer(mine(c).id);
    expect(mine(c).stage).toBe("withdrawn");
    // And frees us to try again later.
    expect(c.makeOffer(TARGET, 2_000_000).ok).toBe(true);
  });

  it("resets the clock when we counter — now they owe US an answer", () => {
    const c = career();
    c.makeOffer(TARGET, 1_000_000);
    advanceDays(c, 6);
    const before = mine(c).daysLeft ?? 0;
    c.counterOffer(mine(c).id, 2_000_000);
    expect(mine(c).daysLeft).toBeGreaterThan(before);
  });
});

describe("selling", () => {
  it("completes a sale we accept, and moves the player", () => {
    const c = career();
    const bid = c.pendingOffers()[0]!;
    const playerId = bid.playerId;
    c.respondOffer(bid.id, true);
    advanceDays(c, 8);

    expect(c.snapshot().clubs.t0!.squad.playerIds).not.toContain(playerId);
    expect(c.squad().some((e) => e.playerId === playerId)).toBe(false);
  });

  it("keeps the player when we refuse", () => {
    const c = career();
    const bid = c.pendingOffers()[0]!;
    c.respondOffer(bid.id, false);
    advanceDays(c, 8);
    expect(c.snapshot().clubs.t0!.squad.playerIds).toContain(bid.playerId);
  });
});

describe("negotiating a received offer — not just yes or no", () => {
  /** Advance until the buyer has answered the price we named. */
  const untilBuyerAnswers = (c: Career, id: string) => {
    let guard = 0;
    while (c.pendingOffers().concat(c.myOffers(), c.settledOffers()).find((o) => o.id === id)?.stage === "countered" && guard++ < 10) {
      if (c.peekNextStop() === "seasonEnd") c.rolloverSeason();
      else c.advance();
    }
  };
  const find = (c: Career, id: string) => c.pendingOffers().concat(c.myOffers(), c.settledOffers()).find((o) => o.id === id);

  it("lets us name a price instead of accepting the bid on the table", () => {
    const c = career();
    const bid = c.pendingOffers()[0]!;
    c.askFor(bid.id, (bid.theirLastFee ?? 0) * 3);
    const n = find(c, bid.id)!;
    expect(n.stage).toBe("countered");
    expect(n.ourLastFee).toBe((bid.theirLastFee ?? 0) * 3);
  });

  it("a rich enough buyer meets our price and the sale goes through", () => {
    const c = career();
    const bid = c.pendingOffers()[0]!;
    const playerId = bid.playerId;
    // A small bump over their opening bid — inside any real buyer's ceiling.
    c.askFor(bid.id, Math.round((bid.theirLastFee ?? 0) * 1.05));
    untilBuyerAnswers(c, bid.id);
    advanceDays(c, 8);
    expect(c.snapshot().clubs.t0!.squad.playerIds).not.toContain(playerId);
  });

  it("a buyer walks when our price clears their budget, and we keep the player", () => {
    const c = career();
    const bid = c.pendingOffers()[0]!;
    const playerId = bid.playerId;
    c.askFor(bid.id, 5_000_000_000); // no club can pay this
    advanceDays(c, OFFER_WINDOW_DAYS + 8);
    const n = find(c, bid.id);
    expect(n === undefined || n.stage === "withdrawn").toBe(true);
    expect(c.snapshot().clubs.t0!.squad.playerIds).toContain(playerId);
  });

  it("is deterministic", () => {
    const run = () => {
      const c = career();
      const bid = c.pendingOffers()[0]!;
      c.askFor(bid.id, Math.round((bid.theirLastFee ?? 0) * 1.2));
      advanceDays(c, 20);
      return c.myOffers().concat(c.settledOffers(), c.pendingOffers()).map((o) => [o.playerId, o.stage, o.rounds.map((r) => r.fee)]);
    };
    expect(run()).toEqual(run());
  });
});

describe("determinism", () => {
  it("two careers from the same seed negotiate identically", () => {
    const run = () => {
      const c = career();
      c.makeOffer(TARGET, 900_000);
      advanceDays(c, 20);
      return c.myOffers().concat(c.settledOffers()).map((o) => [o.playerId, o.stage, o.reason, o.rounds.map((r) => r.fee)]);
    };
    expect(run()).toEqual(run());
  });

  it("survives a save/load with the clock intact", () => {
    const c = career();
    c.makeOffer(TARGET, 900_000);
    const reloaded = Career.load(JSON.parse(JSON.stringify(c.snapshot())), league);
    expect(reloaded.myOffers().find((o) => o.playerId === TARGET)?.daysLeft).toBe(mine(c).daysLeft);
  });
});
