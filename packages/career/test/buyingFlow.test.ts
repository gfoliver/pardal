import { describe, expect, it } from "vitest";
import { Position } from "@fut/domain";
import type { LeagueData, PlayerData, TeamData } from "@fut/competition";
import { Career, InboxMessageType } from "@fut/career";

/**
 * Buying a player, from bid to signature.
 *
 * The flow was broken in the middle and the break was invisible: the clubs DID
 * agree a fee, but the screen that finishes a signing read a list only the old
 * offer code ever wrote. So the deal reached `feeAgreed`, offered the manager
 * nothing to do, and lapsed on the bid clock — which from the outside looked
 * exactly like "clubs never answer, offers always expire".
 */

function attrs(v: number) {
  return {
    physical: { pace: v, stamina: v, strength: v, agility: v },
    mental: { decisions: v, composure: v, workRate: v, teamwork: v, aggression: v, anticipation: v, positioning: v, vision: v },
    technical: { passing: v, technique: v, dribbling: v, finishing: v, shotPower: v, tackling: v, marking: v, crossing: v },
  };
}
const POS: [Position, boolean][] = [
  [Position.Goalkeeper, true], [Position.Goalkeeper, true],
  ...Array.from({ length: 8 }, () => [Position.CentreBack, false] as [Position, boolean]),
  ...Array.from({ length: 8 }, () => [Position.CentralMidfielder, false] as [Position, boolean]),
  ...Array.from({ length: 6 }, () => [Position.Striker, false] as [Position, boolean]),
];
function team(id: string, r: number): TeamData {
  return {
    id, name: id, shortName: id.toUpperCase(),
    coach: { id: `${id}-c`, name: "C", age: 50, nationality: "BR", attributes: { adaptability: 60, tacticalKnowledge: 60, reactiveness: 60, composure: 60 } },
    players: POS.map(([p, gk], i) => ({ id: `${id}-p${i}`, name: `${id}-p${i}`, age: 26, nationality: "BR", position: p, marketValue: 5_000_000, ...attrs(r), ...(gk ? { goalkeeping: { reflexes: r, handling: r, positioning: r, oneOnOnes: r } } : {}) } as PlayerData)),
  };
}
const league: LeagueData = { id: "fic", name: "Fic", teams: [76, 72, 68, 64].map((r, i) => team(`t${i}`, r)) };
const TARGET = "t1-p20"; // a rival striker

const career = () => {
  const c = Career.create(league, { leagueId: "fic", managedClubId: "t0", seed: 21 });
  // Deep pockets. Fee AND a year of the new salary come out of one pot now, and this
  // fixture's payroll leaves a slack that lands right on the 20M bid below — so without
  // this, "the manager could not afford it" would masquerade as "the flow is broken",
  // which is the exact confusion these tests exist to rule out.
  c.snapshot().clubs.t0!.finance.annualBudget = 5_000_000_000;
  return c;
};
/** Our negotiation for the target, whatever stage it's in. */
const ours = (c: Career) => c.snapshot().negotiations.find((n) => n.playerId === TARGET && n.buyerClubId === "t0");
/** Advance until our negotiation leaves `offered`, or `days` run out. */
function advanceUntilAnswered(c: Career, days = 14) {
  for (let i = 0; i < days; i++) {
    c.advanceDay();
    if (ours(c)?.stage !== "offered") return;
  }
}

/**
 * Let real days pass.
 *
 * `advanceDay` deliberately refuses to step over the manager's own fixture, so
 * looping it just parks the clock on match day. Quick-simming when that happens
 * is how time actually moves in a career.
 */
function passDays(c: Career, days: number) {
  for (let i = 0; i < days; i++) {
    if (c.peekNextStop() === "userMatch") c.advance();
    else if (c.peekNextStop() === "seasonEnd") return;
    else c.advanceDay();
  }
}

describe("a bid gets an answer", () => {
  it("is accepted when it clears what they want", () => {
    const c = career();
    expect(c.makeOffer(TARGET, 20_000_000).ok).toBe(true);
    advanceUntilAnswered(c);
    expect(ours(c)?.stage).toBe("feeAgreed");
    expect(ours(c)?.agreedFee).toBe(20_000_000);
  });

  it("is refused with a reason when it is nowhere near", () => {
    const c = career();
    c.makeOffer(TARGET, 500_000);
    advanceUntilAnswered(c);
    expect(ours(c)?.stage).toBe("rejected");
    expect(ours(c)?.reason).toBeTruthy();
  });

  it("draws a counter-offer when the gap is bridgeable", () => {
    const c = career();
    c.makeOffer(TARGET, 3_800_000);
    advanceUntilAnswered(c);
    expect(ours(c)?.stage).toBe("countered");
  });

  it("never just sits there — every bid is answered before it could lapse", () => {
    for (const bid of [500_000, 3_800_000, 4_500_000, 20_000_000]) {
      const c = career();
      c.makeOffer(TARGET, bid);
      advanceUntilAnswered(c);
      expect(ours(c)?.stage, `bid ${bid}`).not.toBe("offered");
      expect(ours(c)?.stage, `bid ${bid}`).not.toBe("expired");
    }
  });
});

describe("agreeing the fee hands the manager a signing to finish", () => {
  function feeAgreed() {
    const c = career();
    c.makeOffer(TARGET, 20_000_000);
    advanceUntilAnswered(c);
    return c;
  }

  it("shows up as a pending signing — the card that never used to appear", () => {
    const c = feeAgreed();
    const pending = c.pendingSignings();
    expect(pending).toHaveLength(1);
    expect(pending[0]!.playerId).toBe(TARGET);
    expect(pending[0]!.fee).toBe(20_000_000);
    expect(pending[0]!.expectedWage).toBeGreaterThan(0);
  });

  it("tells the manager, in the inbox, that the player's contract is next", () => {
    const c = feeAgreed();
    const mail = c.inbox().filter((m) => m.type === InboxMessageType.PersonalTerms);
    expect(mail).toHaveLength(1);
    expect(mail[0]!.params.playerId).toBe(TARGET);
    // The mail names the deadline, so "how long have I got" is answerable.
    expect(Number(mail[0]!.params.days)).toBeGreaterThan(0);
  });

  it("gives longer to sign the player than to answer a bid", () => {
    const c = feeAgreed();
    // 21 days rather than the 10-day bid window: the old shared clock could kill
    // a fee we had only just agreed.
    expect(c.pendingSignings()[0]!.daysLeft).toBeGreaterThan(10);
  });

  it("completes the move when the wage is enough", () => {
    const c = feeAgreed();
    const wage = c.pendingSignings()[0]!.expectedWage;
    expect(c.agreeTerms(TARGET, wage, 4).signed).toBe(true);
    expect(c.squad().some((e) => e.playerId === TARGET)).toBe(true);
    expect(ours(c)?.stage).toBe("completed");
    expect(c.pendingSignings()).toHaveLength(0);
  });

  it("leaves the deal alive when the player holds out for more", () => {
    const c = feeAgreed();
    const wage = c.pendingSignings()[0]!.expectedWage;
    expect(c.agreeTerms(TARGET, Math.round(wage * 0.5), 4).signed).toBe(false);
    expect(c.squad().some((e) => e.playerId === TARGET)).toBe(false);
    expect(ours(c)?.stage).toBe("feeAgreed"); // still ours to close
    expect(c.pendingSignings()).toHaveLength(1);
  });

  it("a completed signing cannot then lapse on its own deadline", () => {
    const c = feeAgreed();
    c.agreeTerms(TARGET, c.pendingSignings()[0]!.expectedWage, 4);
    passDays(c, 40);
    expect(ours(c)?.stage).toBe("completed");
    expect(c.squad().some((e) => e.playerId === TARGET)).toBe(true);
  });

  it("says WHY when the manager lets the terms window run out", () => {
    const c = feeAgreed();
    passDays(c, 40);
    expect(ours(c)?.stage).toBe("expired");
    expect(c.squad().some((e) => e.playerId === TARGET)).toBe(false);
    // Not the generic "nobody answered" — the manager has to learn which step
    // he missed, or he'll conclude the clubs are broken.
    const mail = c.inbox().filter((m) => m.type === InboxMessageType.PersonalTermsExpired);
    expect(mail.length).toBeGreaterThanOrEqual(1);
  });
});
