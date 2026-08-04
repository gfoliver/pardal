import { describe, expect, it } from "vitest";
import { Position } from "@fut/domain";
import type { LeagueData, PlayerData, TeamData } from "@fut/competition";
import { Career, InboxMessageType, WARNING_DAYS } from "@fut/career";

function attrs(v: number) {
  return {
    physical: { pace: v, stamina: v, strength: v, agility: v },
    mental: { decisions: v, composure: v, workRate: v, teamwork: v, aggression: v, anticipation: v, positioning: v, vision: v },
    technical: { passing: v, technique: v, dribbling: v, finishing: v, shotPower: v, tackling: v, marking: v, crossing: v },
  };
}
const POS: [Position, boolean][] = [
  [Position.Goalkeeper, true], [Position.Goalkeeper, true],
  ...Array.from({ length: 6 }, () => [Position.CentreBack, false] as [Position, boolean]),
  ...Array.from({ length: 6 }, () => [Position.CentralMidfielder, false] as [Position, boolean]),
  ...Array.from({ length: 4 }, () => [Position.Striker, false] as [Position, boolean]),
];
function team(id: string, r: number): TeamData {
  return {
    id, name: id, shortName: id.toUpperCase(),
    coach: { id: `${id}-c`, name: "C", age: 50, nationality: "BR", attributes: { adaptability: 60, tacticalKnowledge: 60, reactiveness: 60, composure: 60 } },
    players: POS.map(([p, gk], i) => ({ id: `${id}-p${i}`, name: `${id}-p${i}`, age: 25, nationality: "BR", position: p, ...attrs(r), ...(gk ? { goalkeeping: { reflexes: r, handling: r, positioning: r, oneOnOnes: r } } : {}) } as PlayerData)),
  };
}
const league: LeagueData = { id: "fic", name: "Fic", teams: [76, 72, 68, 64].map((r, i) => team(`t${i}`, r)) };
const opts = { leagueId: "fic", managedClubId: "t0", seed: 7 };
const MINE = "t0-p8";

/**
 * A career whose squads are NOT quietly dissolving underneath the test.
 *
 * `createCareer` spreads expiry over seasons 1..3 and over the days within them, so a third of the
 * managed club's squad still lapses per season — just no longer all on one day. These tests are
 * about WARNINGS, so each one puts a single deal on the clock itself and pushes every other contract
 * far out of reach; otherwise a 180-day run ends with a club that has lost a third of its players
 * for reasons the test never asked about.
 *
 * The volume of that turnover is a separate matter (only the managed club is stripped — AI clubs
 * renew) and is tracked on its own. It used to be invisible because a departed player stayed in the
 * stored lineup and kept being fielded, which is the bug `reconcileTactics` fixes.
 */
const career = () => {
  const c = Career.create(league, opts);
  const s = c.snapshot();
  for (const id of Object.keys(s.contracts)) {
    s.contracts[id] = { ...s.contracts[id]!, expiry: { season: 9, dayOfSeason: 0 } };
  }
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
/** Put a player's deal `days` from the end, without waiting years for it. */
const setExpiryIn = (c: Career, playerId: string, days: number) => {
  const s = c.snapshot();
  const per = s.totalDays || 1;
  const absolute = s.currentDate.season * per + s.currentDate.dayOfSeason + days;
  s.contracts[playerId] = { ...s.contracts[playerId]!, expiry: { season: Math.floor(absolute / per), dayOfSeason: absolute % per } };
};

describe("a contract that actually runs out", () => {
  it("used to be impossible to lose anyone — now the deal can end", () => {
    const c = career();
    setExpiryIn(c, MINE, 3);
    advanceDays(c, 20);

    expect(c.snapshot().clubs.t0!.squad.playerIds).not.toContain(MINE);
    expect(c.inbox().some((m) => m.type === InboxMessageType.ContractLapsed)).toBe(true);
    /*
     * He is no longer OURS — which is the loss. Whether he is still unattached twenty days later is
     * not this test's business: free agency means a rival can pick him up inside that window, and it
     * has been doing so since it landed. Asserting `contracts[MINE] === undefined` here was really
     * asserting that nobody else wanted him.
     */
    expect(c.snapshot().contracts[MINE]?.clubId).not.toBe("t0");
  });

  it("warns before it happens, at each milestone, exactly once", () => {
    const c = career();
    setExpiryIn(c, MINE, WARNING_DAYS[0]! - 1);
    advanceDays(c, WARNING_DAYS[0]!);

    const warnings = c.inbox().filter((m) => m.type === InboxMessageType.ContractExpiring && m.params.playerId === MINE);
    const milestones = warnings.map((m) => m.params.milestone);
    expect(warnings.length).toBeGreaterThan(0);
    // No milestone repeats — a warning that shows up daily is one you ignore.
    expect(new Set(milestones).size).toBe(milestones.length);
  });

  it("gives the six-month notice the manager asked for", () => {
    const c = career();
    setExpiryIn(c, MINE, 179);
    advanceDays(c, 8);
    expect(c.inbox().some((m) => m.type === InboxMessageType.ContractExpiring && m.params.milestone === 180)).toBe(true);
  });

  it("leaves AI clubs' squads intact — they renew their own", () => {
    const c = career();
    const rival = "t1-p8";
    setExpiryIn(c, rival, 3);
    // An AI contract is at its own club, so it renews rather than lapsing.
    c.snapshot().contracts[rival] = { ...c.snapshot().contracts[rival]!, clubId: "t1" };
    advanceDays(c, 20);

    expect(c.snapshot().clubs.t1!.squad.playerIds).toContain(rival);
    expect(c.snapshot().contracts[rival]).toBeDefined();
  });

  it("lists what's running down, soonest first", () => {
    const c = career();
    setExpiryIn(c, "t0-p8", 100);
    setExpiryIn(c, "t0-p9", 40);
    const rows = c.expiringContracts(180);
    expect(rows[0]!.playerId).toBe("t0-p9");
    expect(rows.map((r) => r.playerId)).toContain("t0-p8");
  });
});

describe("renewal is a negotiation", () => {
  it("states what the player wants, rather than accepting anything", () => {
    const c = career();
    const demands = c.contractDemands(MINE)!;
    expect(demands.wage).toBeGreaterThan(0);
    expect(demands.years).toBeGreaterThan(0);
    // Nobody negotiates himself downwards.
    expect(demands.wage).toBeGreaterThanOrEqual(c.snapshot().contracts[MINE]!.wage);
  });

  it("signs when the offer meets his number", () => {
    const c = career();
    const d = c.contractDemands(MINE)!;
    expect(c.offerContract(MINE, d.wage, d.years)).toEqual({ kind: "accepted" });
    expect(c.snapshot().contracts[MINE]!.wage).toBe(d.wage);
    expect(c.inbox().some((m) => m.type === InboxMessageType.ContractRenewed)).toBe(true);
  });

  it("holds out below it — and the old contract is untouched", () => {
    const c = career();
    const before = { ...c.snapshot().contracts[MINE]! };
    const d = c.contractDemands(MINE)!;

    const outcome = c.offerContract(MINE, Math.round(d.minimumWage * 0.95), d.years);
    expect(outcome.kind).toBe("countered");
    if (outcome.kind === "countered") expect(outcome.demands.minimumWage).toBe(d.minimumWage);
    expect(c.snapshot().contracts[MINE]).toEqual(before);
  });

  it("takes an insulting offer as an insult, not a counter", () => {
    const c = career();
    const d = c.contractDemands(MINE)!;
    expect(c.offerContract(MINE, Math.round(d.wage * 0.2), 3)).toEqual({ kind: "rejected", reason: "insulting" });
  });

  it("asks for more once we've told him he's a key player", () => {
    const c = career();
    const s = c.snapshot();
    const plain = c.contractDemands(MINE)!.wage;
    s.contracts[MINE] = { ...s.contracts[MINE]!, squadStatus: "key" as never };
    expect(c.contractDemands(MINE)!.wage).toBeGreaterThan(plain);
  });

  it("clears the expiry warnings once he re-signs", () => {
    const c = career();
    setExpiryIn(c, MINE, 100);
    advanceDays(c, 8);
    expect(Object.keys(c.snapshot().contractsWarned ?? {}).some((k) => k.startsWith(`${MINE}:`))).toBe(true);

    const d = c.contractDemands(MINE)!;
    c.offerContract(MINE, d.wage, 4);
    expect(Object.keys(c.snapshot().contractsWarned ?? {}).some((k) => k.startsWith(`${MINE}:`))).toBe(false);
  });
});

describe("determinism", () => {
  it("the same squad always asks for the same thing", () => {
    const a = career();
    const b = career();
    expect(a.expiringContracts(9999).map((r) => [r.playerId, r.demands?.wage])).toEqual(
      b.expiringContracts(9999).map((r) => [r.playerId, r.demands?.wage]),
    );
  });

  it("survives save/load with warnings and free agents intact", () => {
    const c = career();
    setExpiryIn(c, MINE, 3);
    advanceDays(c, 20);
    const reloaded = Career.load(JSON.parse(JSON.stringify(c.snapshot())), league);
    expect(reloaded.freeAgents().map((f) => f.playerId)).toEqual(c.freeAgents().map((f) => f.playerId));
  });
});

/**
 * A negotiated term has to be the term that is written down.
 *
 * Two separate faults made an agreed contract come out shorter than it was agreed for, and together
 * they looked like the duration having been ignored entirely — as if the player kept whatever deal he
 * had at his old club.
 */
describe("the length you agree is the length you get", () => {
  /** Days between two career dates, on the game's own calendar. */
  const daysBetween = (c: Career, from: { season: number; dayOfSeason: number }, to: { season: number; dayOfSeason: number }) => {
    const per = c.snapshot().totalDays;
    return (to.season * per + to.dayOfSeason) - (from.season * per + from.dayOfSeason);
  };

  it("gives a renewal exactly the number of seasons agreed", () => {
    const c = career();
    const per = c.snapshot().totalDays;
    const d = c.contractDemands(MINE)!;
    expect(c.offerContract(MINE, d.wage, 4).kind).toBe("accepted");

    const contract = c.snapshot().contracts[MINE]!;
    expect(daysBetween(c, c.snapshot().currentDate, contract.expiry)).toBe(4 * per);
  });

  /**
   * The one that bit hardest. Expiry used to land on day 0 of the target season, so a deal signed
   * deep into a season lost however far into it the manager already was — agree four years on the
   * last day of a window and nearly a whole one of them was never written.
   */
  it("does not shorten a deal signed in the middle of a season", () => {
    const c = career();
    const per = c.snapshot().totalDays;
    // Walk into the season before negotiating.
    advanceDays(c, Math.floor(per / 2));
    const today = { ...c.snapshot().currentDate };
    expect(today.dayOfSeason).toBeGreaterThan(0);

    const d = c.contractDemands(MINE)!;
    expect(c.offerContract(MINE, d.wage, 3).kind).toBe("accepted");
    expect(daysBetween(c, today, c.snapshot().contracts[MINE]!.expiry)).toBe(3 * per);
  });

  it("scales with the number asked for, one season at a time", () => {
    const per = career().snapshot().totalDays;
    for (const years of [1, 2, 3, 4, 5]) {
      const c = career();
      const d = c.contractDemands(MINE)!;
      expect(c.offerContract(MINE, d.wage, years).kind).toBe("accepted");
      expect(daysBetween(c, c.snapshot().currentDate, c.snapshot().contracts[MINE]!.expiry), `${years} years`).toBe(years * per);
    }
  });

  it("writes the wage that was offered, not the one he was on", () => {
    const c = career();
    const was = c.snapshot().contracts[MINE]!.wage;
    const d = c.contractDemands(MINE)!;
    const offered = d.wage + 12_345;
    expect(c.offerContract(MINE, offered, 3).kind).toBe("accepted");

    expect(c.snapshot().contracts[MINE]!.wage).toBe(offered);
    expect(c.snapshot().contracts[MINE]!.wage).not.toBe(was);
  });
});

/**
 * Expiry dates are spread through the season, not stacked on one day.
 *
 * Every deal used to land on `dayOfSeason: 0`, which turned "renew or lose him" — the intended
 * pressure — into a single date where a third of the squad walked at once. On the real Brasileirão
 * that was eleven of Flamengo's twenty-eight, best players included, with nothing the manager could
 * do about it on the day. Spread, the same eleven become eleven decisions across a year, each
 * arriving with its own 180/90/30-day warnings.
 */
describe("when contracts run out", () => {
  /** The untouched career: these tests are about the dates `createCareer` writes. */
  const fresh = () => Career.create(league, opts);

  it("does not stack a club's expiries on one day", () => {
    const c = fresh();
    const s = c.snapshot();
    const mine = s.clubs.t0!.squad.playerIds;
    const perDate = new Map<string, number>();
    for (const id of mine) {
      const e = s.contracts[id]!.expiry;
      const key = `${e.season}:${e.dayOfSeason}`;
      perDate.set(key, (perDate.get(key) ?? 0) + 1);
    }
    // Before, this was 3 dates for the whole squad — one per season, every one on day 0.
    expect(perDate.size).toBeGreaterThan(mine.length / 2);
    expect(Math.max(...perDate.values())).toBeLessThanOrEqual(2);
  });

  it("uses the season's real length, so no date is unreachable", () => {
    const c = fresh();
    const s = c.snapshot();
    for (const [id, contract] of Object.entries(s.contracts)) {
      expect(contract.expiry.dayOfSeason, id).toBeGreaterThanOrEqual(0);
      expect(contract.expiry.dayOfSeason, id).toBeLessThan(s.totalDays);
    }
  });

  it("still spreads them over the first three seasons", () => {
    const seasons = new Set(Object.values(fresh().snapshot().contracts).map((x) => x.expiry.season));
    expect([...seasons].sort()).toEqual([1, 2, 3]);
  });

  it("is deterministic — the same league and seed give the same dates", () => {
    const dates = (c: Career) =>
      Object.entries(c.snapshot().contracts)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([id, x]) => `${id}@${x.expiry.season}:${x.expiry.dayOfSeason}`);
    expect(dates(fresh())).toEqual(dates(fresh()));
  });

  it("does not correlate a player's expiry day with the season he expires in", () => {
    // Two independent hashes; if one drove both, every season-2 deal would share a day pattern.
    const s = fresh().snapshot();
    const bySeason = new Map<number, Set<number>>();
    for (const x of Object.values(s.contracts)) {
      bySeason.set(x.expiry.season, (bySeason.get(x.expiry.season) ?? new Set()).add(x.expiry.dayOfSeason));
    }
    for (const [season, days] of bySeason) expect(days.size, `season ${season}`).toBeGreaterThan(3);
  });
});
