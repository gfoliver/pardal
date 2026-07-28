import { describe, expect, it } from "vitest";
import { Position } from "@fut/domain";
import type { LeagueData, PlayerData, TeamData } from "@fut/competition";
import { Career, InboxMessageType, MAX_RIVAL_CONFIDENCE } from "@fut/career";
import { OBSERVATION_STEPS, capacityFor } from "../src/scouting/ScoutingEngine.js";

function attrs(v: number) {
  return {
    physical: { pace: v, stamina: v, strength: v, agility: v },
    mental: { decisions: v, composure: v, workRate: v, teamwork: v, aggression: v, anticipation: v, positioning: v, vision: v },
    technical: { passing: v, technique: v, dribbling: v, finishing: v, shotPower: v, tackling: v, marking: v, crossing: v },
  };
}
const POS: [Position, boolean][] = [
  [Position.Goalkeeper, true], [Position.Goalkeeper, true],
  [Position.CentreBack, false], [Position.CentreBack, false], [Position.CentreBack, false], [Position.FullBack, false], [Position.FullBack, false], [Position.FullBack, false],
  [Position.CentralMidfielder, false], [Position.CentralMidfielder, false], [Position.CentralMidfielder, false], [Position.CentralMidfielder, false],
  [Position.Winger, false], [Position.Winger, false], [Position.Striker, false], [Position.Striker, false],
];
function team(id: string, r: number): TeamData {
  return {
    id, name: id, shortName: id.toUpperCase(),
    coach: { id: `${id}-c`, name: "C", age: 50, nationality: "BR", attributes: { adaptability: 60, tacticalKnowledge: 60, reactiveness: 60, composure: 60 } },
    players: POS.map(([p, gk], i) => ({ id: `${id}-p${i}`, name: `${id}-p${i}`, age: 25, nationality: "BR", position: p, ...attrs(r), ...(gk ? { goalkeeping: { reflexes: r, handling: r, positioning: r, oneOnOnes: r } } : {}) } as PlayerData)),
  };
}
const league: LeagueData = { id: "fic", name: "Fic", teams: [76, 72, 68, 64].map((r, i) => team(`t${i}`, r)) };
const opts = { leagueId: "fic", managedClubId: "t0", seed: 9 };

/** A player at another club. */
const RIVAL = "t1-p0";
const MINE = "t0-p0";

const career = () => Career.create(league, opts);

/** Absolute day, matching how the career schedules future events. */
const dayOf = (c: Career) => {
  const s = c.snapshot();
  return s.currentDate.season * (s.totalDays || 1) + s.currentDate.dayOfSeason;
};

/**
 * Push the calendar forward `days` days.
 *
 * The clock only moves on match days (`advance` quick-sims one), so this walks
 * match day to match day and rolls the season over when it runs out — which is
 * what a manager watching a player for two months actually does.
 */
const advanceDays = (c: Career, days: number) => {
  const target = dayOf(c) + days;
  let guard = 0;
  while (dayOf(c) < target && guard++ < 500) {
    const stop = c.peekNextStop();
    if (stop === "seasonEnd") c.rolloverSeason();
    // An unanswered offer halts the calendar outright — the manager has to
    // answer it before time moves. (Phase 3 gives offers a deadline instead.)
    else if (stop === "decision") for (const o of c.pendingOffers()) c.respondOffer(o.id, false);
    else c.advance();
  }
};

describe("the fog", () => {
  it("tells us nothing about an unwatched player — not even his rating", () => {
    const c = career();
    const row = c.transferTargets().find((r) => r.playerId === RIVAL)!;
    expect(row.confidence).toBe(0);
    expect(row.overall).toBeUndefined();
    expect(row.overallGrade).toBeUndefined();
    expect(row.value).toBeUndefined();
    expect(row.potential).toBeUndefined();
    // Public record is still public.
    expect(row.name).toBeTruthy();
    expect(row.age).toBeGreaterThan(0);
  });

  it("never lists our own players as targets, and knows them outright", () => {
    const c = career();
    expect(c.transferTargets().some((r) => r.playerId === MINE)).toBe(false);
    expect(c.confidenceIn(MINE)).toBe(100);
  });

  it("caps a rival's player below certainty however long we watch", () => {
    const c = career();
    let guard = 0;
    while (c.confidenceIn(RIVAL) < MAX_RIVAL_CONFIDENCE && guard++ < 10) {
      c.scout(RIVAL);
      advanceDays(c, 40);
    }
    expect(c.confidenceIn(RIVAL)).toBe(MAX_RIVAL_CONFIDENCE);
    expect(c.scoutRefusal(RIVAL)).toBe("nothingLeftToLearn");
  });
});

/**
 * The audit the whole model stands on. Every surface that can name a rival's
 * player is swept, and any exact figure below the knowledge threshold is a leak
 * — which is exactly how the player-detail screen was caught still handing out
 * true ratings after the market list had been fogged.
 */
describe("no exact figure escapes below the threshold", () => {
  it("keeps every rival's numbers behind their confidence, on every surface", () => {
    const c = career();
    // A spread of knowledge: some unseen, one watched once, one watched twice.
    c.scout(RIVAL);
    advanceDays(c, OBSERVATION_STEPS[0]!.days + 2);
    c.scout(RIVAL);
    advanceDays(c, OBSERVATION_STEPS[1]!.days + 2);
    const once = "t2-p0";
    c.scout(once);
    advanceDays(c, OBSERVATION_STEPS[0]!.days + 2);

    const leaks: string[] = [];
    for (const row of c.transferTargets()) {
      const id = row.playerId;
      const confidence = c.confidenceIn(id);
      const detail = c.playerDetail(id)!;

      // Below 60 there is no exact rating anywhere.
      if (confidence < 60) {
        if (row.overall !== undefined) leaks.push(`${id}: market overall at ${confidence}`);
        if (detail.overall !== undefined) leaks.push(`${id}: detail overall at ${confidence}`);
        if (detail.currentAbility !== undefined) leaks.push(`${id}: currentAbility at ${confidence}`);
        if (detail.potentialAbility !== undefined) leaks.push(`${id}: potentialAbility at ${confidence}`);
      }
      // With nothing observed there is nothing at all.
      if (confidence === 0) {
        if (row.value !== undefined) leaks.push(`${id}: value at 0`);
        if (row.potential !== undefined) leaks.push(`${id}: potential at 0`);
        if (c.playerAttributes(id).length > 0) leaks.push(`${id}: attributes at 0`);
      }
      // A rival's money is never certain, however long we watch.
      if (row.value?.exact) leaks.push(`${id}: exact value at ${confidence}`);
      // Nor are his terms our business.
      if (detail.contract) leaks.push(`${id}: contract exposed`);
      for (const a of c.playerAttributes(id)) {
        if (a.estimate.exact) leaks.push(`${id}: exact ${a.name} at ${confidence}`);
      }
    }
    expect(leaks).toEqual([]);
  });

  it("shows our own players outright — the fog stops at the door", () => {
    const c = career();
    const detail = c.playerDetail(MINE)!;
    expect(detail.overall).toBeDefined();
    expect(detail.currentAbility).toBeDefined();
    expect(detail.value?.exact).toBe(true);
    expect(detail.contract).toBeDefined();
    expect(c.playerAttributes(MINE).every((a) => a.estimate.exact)).toBe(true);
  });
});

describe("observation costs time", () => {
  it("reveals nothing the day a scout is sent", () => {
    const c = career();
    c.scout(RIVAL);
    expect(c.confidenceIn(RIVAL)).toBe(0);
    expect(c.scoutingView().watching).toHaveLength(1);
  });

  it("files a report once the days have passed, and frees the slot", () => {
    const c = career();
    c.scout(RIVAL);
    advanceDays(c, OBSERVATION_STEPS[0]!.days + 2);

    expect(c.confidenceIn(RIVAL)).toBe(OBSERVATION_STEPS[0]!.to);
    expect(c.scoutingView().watching).toHaveLength(0);
    expect(c.inbox().some((m) => m.type === InboxMessageType.ScoutReport && m.params.playerId === RIVAL)).toBe(true);
  });

  it("opens the first tier of knowledge with that report", () => {
    const c = career();
    c.scout(RIVAL);
    advanceDays(c, OBSERVATION_STEPS[0]!.days + 2);

    const row = c.transferTargets().find((r) => r.playerId === RIVAL)!;
    expect(row.overallGrade).toBeTruthy(); // a letter, not a number
    expect(row.overall).toBeUndefined();
    expect(row.value!.exact).toBe(false);
  });

  it("narrows what we know with each further report", () => {
    const c = career();
    const widths: number[] = [];
    for (const step of OBSERVATION_STEPS) {
      c.scout(RIVAL);
      advanceDays(c, step.days + 2);
      const v = c.transferTargets().find((r) => r.playerId === RIVAL)!.value!;
      widths.push(v.high - v.low);
    }
    expect(widths[0]).toBeGreaterThan(widths[1]!);
    expect(widths[1]).toBeGreaterThan(widths[2]!);
  });

  it("costs more for each rung — knowing someone well is an investment", () => {
    const days = OBSERVATION_STEPS.map((s) => s.days);
    expect(days[1]).toBeGreaterThan(days[0]!);
    expect(days[2]).toBeGreaterThan(days[1]!);
  });
});

describe("capacity forces a choice", () => {
  it("scales with the club's standing", () => {
    expect(capacityFor(10)).toBe(2);
    expect(capacityFor(90)).toBe(4);
  });

  it("refuses a new assignment once every scout is out, with a reason", () => {
    const c = career();
    const rivals = c.transferTargets().map((r) => r.playerId);
    const cap = c.scoutingView().capacity;
    for (let i = 0; i < cap; i++) c.scout(rivals[i]!);

    expect(c.scoutingView().used).toBe(cap);
    expect(c.scoutRefusal(rivals[cap]!)).toBe("atCapacity");
    c.scout(rivals[cap]!);
    expect(c.scoutingView().used).toBe(cap); // the extra assignment did not take
  });

  it("refuses to double up on someone already watched", () => {
    const c = career();
    c.scout(RIVAL);
    expect(c.scoutRefusal(RIVAL)).toBe("alreadyWatching");
    c.scout(RIVAL);
    expect(c.scoutingView().watching).toHaveLength(1);
  });

  it("refuses our own players outright", () => {
    expect(career().scoutRefusal(MINE)).toBe("ownPlayer");
  });

  it("gives the slot back when an assignment is cancelled, and teaches nothing", () => {
    const c = career();
    c.scout(RIVAL);
    advanceDays(c, 5); // part-way through
    c.cancelScout(c.scoutingView().watching[0]!.id);

    expect(c.scoutingView().used).toBe(0);
    expect(c.confidenceIn(RIVAL)).toBe(0); // no partial credit
  });
});

describe("determinism and persistence", () => {
  it("survives a save/load mid-observation and still reports on time", () => {
    const c = career();
    c.scout(RIVAL);
    advanceDays(c, 3);

    const reloaded = Career.load(JSON.parse(JSON.stringify(c.snapshot())), league);
    expect(reloaded.scoutingView().watching).toHaveLength(1);
    advanceDays(reloaded, OBSERVATION_STEPS[0]!.days);
    expect(reloaded.confidenceIn(RIVAL)).toBe(OBSERVATION_STEPS[0]!.to);
  });

  it("two careers from the same seed learn exactly the same things", () => {
    const run = () => {
      const c = career();
      c.scout(RIVAL);
      advanceDays(c, 15);
      return c.transferTargets().map((r) => [r.playerId, r.confidence, r.value?.mid, r.potential?.mid]);
    };
    expect(run()).toEqual(run());
  });

  it("carries a legacy save's scouted players over as hard-won knowledge", () => {
    const c = career();
    const snap = JSON.parse(JSON.stringify(c.snapshot()));
    // A pre-model save: a flat list of revealed players, no scouting slice.
    snap.scoutedPlayerIds = [RIVAL];
    delete snap.scouting;

    const loaded = Career.load(snap, league);
    expect(loaded.confidenceIn(RIVAL)).toBe(MAX_RIVAL_CONFIDENCE);
    expect(loaded.transferTargets().find((r) => r.playerId === RIVAL)!.overall).toBeDefined();
  });
});
