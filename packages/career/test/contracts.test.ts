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

const career = () => Career.create(league, opts);
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
    expect(c.snapshot().contracts[MINE]).toBeUndefined();
    expect(c.freeAgents().some((f) => f.playerId === MINE)).toBe(true);
    expect(c.inbox().some((m) => m.type === InboxMessageType.ContractLapsed)).toBe(true);
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
