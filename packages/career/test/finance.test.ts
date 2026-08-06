import { describe, expect, it } from "vitest";
import { Position } from "@fut/domain";
import type { LeagueData, PlayerData, TeamData } from "@fut/competition";
import { Career, MONTHS_PER_SEASON, canAffordWage, feeHeadroom, monthlyWageBill, summariseFinance } from "@fut/career";

/**
 * One annual pot, spent on fees and on wages.
 *
 * What these pin is that the money is a RULE and not a readout. The model this replaced had
 * a cash balance fed by matchday and TV income that nothing reacted to, a wage budget with a
 * meter no code enforced, and a per-round net the simulation never computed — three numbers
 * whose only job was to be displayed.
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
function team(id: string, r: number): TeamData {
  return {
    id, name: id, shortName: id.toUpperCase(),
    coach: { id: `${id}-c`, name: "C", age: 50, nationality: "BR", attributes: { adaptability: 60, tacticalKnowledge: 60, reactiveness: 60, composure: 60 } },
    players: POS.map(([p, gk], i) => ({ id: `${id}-p${i}`, name: `${id}-p${i}`, age: 26, nationality: "BR", position: p, marketValue: 5_000_000, ...attrs(r), ...(gk ? { goalkeeping: { reflexes: r, handling: r, positioning: r, oneOnOnes: r } } : {}) })),
  };
}
const league: LeagueData = { id: "fic", name: "Fic", teams: [76, 72, 68, 64].map((r, i) => team(`t${i}`, r)) };
const opts = { leagueId: "fic", managedClubId: "t0", seed: 21 };
const career = () => Career.create(league, opts);
const TARGET = "t1-p20";

describe("the season budget", () => {
  it("covers the payroll and leaves fee money on top", () => {
    const c = career();
    const fin = c.finances()!;
    expect(fin.payroll).toBe(fin.monthlyWageBill * MONTHS_PER_SEASON);
    expect(fin.annualBudget).toBeGreaterThan(fin.payroll);
    expect(fin.available).toBe(fin.annualBudget + fin.feesReceived - fin.committed);
    expect(fin.available).toBeGreaterThan(0);
  });

  it("states the same money twice — once as a fee, once as a monthly salary", () => {
    const fin = career().finances()!;
    expect(fin.wageRoomPerMonth).toBe(Math.floor(fin.available / MONTHS_PER_SEASON));
  });

  it("differs from club to club, and is stable for a given club and seed", () => {
    const budgets = Object.keys(career().snapshot().clubs).map((id) => career().finances(id)!.annualBudget);
    expect(new Set(budgets).size).toBeGreaterThan(1);
    expect(career().finances("t0")!.annualBudget).toBe(career().finances("t0")!.annualBudget);
  });

  /** A bid is a commitment. Four 40M bids against a 40M pot is four accidental signings. */
  it("counts a bid still on the table against what is left", () => {
    const c = career();
    c.snapshot().clubs.t0!.finance.annualBudget = c.finances()!.payroll + 30_000_000;
    const before = c.transferBudget;
    expect(c.makeOffer(TARGET, 10_000_000).ok).toBe(true);
    expect(c.transferBudget).toBe(before - 10_000_000);
  });

  it("refuses a bid the budget cannot cover", () => {
    const c = career();
    c.snapshot().clubs.t0!.finance.annualBudget = c.finances()!.payroll + 5_000_000;
    expect(c.makeOffer(TARGET, 40_000_000).ok).toBe(false);
    // Our OWN offers, not every negotiation — a rival's opening interest in one of our
    // players is already on the books the day a career starts.
    expect(c.myOffers()).toHaveLength(0);
  });
});

describe("wages come out of the same pot as fees", () => {
  it("prices a salary as a year of it", () => {
    const c = career();
    const room = feeHeadroom(c.snapshot(), "t0");
    expect(canAffordWage(c.snapshot(), "t0", Math.floor(room / MONTHS_PER_SEASON))).toBe(true);
    expect(canAffordWage(c.snapshot(), "t0", Math.floor(room / MONTHS_PER_SEASON) + 1_000)).toBe(false);
  });

  /**
   * The wage side used to be decorative: the only thing between the manager and any salary
   * he liked was whether the PLAYER said yes, so a wage budget could be blown past without
   * anything noticing.
   */
  it("refuses personal terms the budget cannot carry, and says why", () => {
    const c = career();
    c.snapshot().clubs.t0!.finance.annualBudget = c.finances()!.payroll + 25_000_000;
    expect(c.makeOffer(TARGET, 20_000_000).ok).toBe(true);
    for (let i = 0; i < 14 && c.pendingSignings().length === 0; i++) c.advanceDay();
    const pending = c.pendingSignings();
    expect(pending).toHaveLength(1);

    // 20M of the 25M is now spoken for; a 1M/month salary is 12M a year and cannot fit.
    const rich = c.agreeTerms(TARGET, 1_000_000, 4);
    expect(rich.signed).toBe(false);
    expect(rich.reason).toBe("overBudget");
    // What he actually asks for does fit, so the deal is still closable.
    expect(c.agreeTerms(TARGET, pending[0]!.expectedWage, 4).signed).toBe(true);
  });
});

describe("fees are booked on both sides", () => {
  it("charges the buyer and credits the seller", () => {
    const c = career();
    c.snapshot().clubs.t0!.finance.annualBudget = 5_000_000_000;
    c.makeOffer(TARGET, 12_000_000);
    for (let i = 0; i < 14 && c.pendingSignings().length === 0; i++) c.advanceDay();
    c.agreeTerms(TARGET, c.pendingSignings()[0]!.expectedWage, 4);

    expect(c.finances("t0")!.feesPaid).toBe(12_000_000);
    expect(c.finances("t1")!.feesReceived).toBe(12_000_000);
    // Income from a sale is spendable again — it goes back into the same pot.
    const t1 = c.finances("t1")!;
    expect(t1.available).toBe(t1.annualBudget + 12_000_000 - t1.committed);
  });
});

describe("a loan splits the salary", () => {
  /**
   * `wageSharePct` was written on every loan and read by nothing. Harmless while wages were
   * charged off a cash balance nobody minded; an exploit the moment the payroll competes with
   * fees for one pot, because loaning a big earner out would take him off the books entirely.
   */
  it("leaves the owner paying his share and charges the borrower theirs", () => {
    const c = career();
    const s = c.snapshot();
    const player = "t0-p2";
    const wage = s.contracts[player]!.wage;
    const ownerBefore = monthlyWageBill(s, "t0");
    const borrowerBefore = monthlyWageBill(s, "t1");

    s.clubs.t0!.squad.playerIds = s.clubs.t0!.squad.playerIds.filter((p) => p !== player);
    s.clubs.t1!.squad.playerIds = [...s.clubs.t1!.squad.playerIds, player];
    s.transfers.loans.push({
      playerId: player,
      ownerClubId: "t0",
      borrowerClubId: "t1",
      until: { season: 0, dayOfSeason: s.totalDays },
      wageSharePct: 0.5,
    });

    expect(monthlyWageBill(s, "t0")).toBe(ownerBefore - Math.round(wage * 0.5));
    expect(monthlyWageBill(s, "t1")).toBe(borrowerBefore + Math.round(wage * 0.5));
  });
});

describe("summariseFinance", () => {
  it("reports an overcommitted club as negative rather than clamping", () => {
    const fin = summariseFinance({ annualBudget: 100, feesPaid: 60, feesReceived: 0 }, 5);
    expect(fin.payroll).toBe(5 * MONTHS_PER_SEASON);
    expect(fin.committed).toBe(60 + 5 * MONTHS_PER_SEASON);
    expect(fin.available).toBeLessThan(0);
  });
});
