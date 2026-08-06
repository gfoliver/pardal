import { describe, expect, it } from "vitest";
import { Position } from "@fut/domain";
import type { LeagueData, PlayerData, TeamData } from "@fut/competition";
import { Career, InboxMessageType, MAX_RIVAL_CONFIDENCE } from "@fut/career";
import { OBSERVATION_STEPS, capacityFor } from "../src/scouting/ScoutingEngine.js";

function attrs(v: number) {
  return {
    physical: { pace: v, stamina: v, strength: v, agility: v },
    mental: { decisions: v, composure: v, workRate: v, teamwork: v, aggression: v, anticipation: v, positioning: v, vision: v, offTheBall: v },
    technical: { passing: v, technique: v, dribbling: v, finishing: v, shotPower: v, tackling: v, marking: v, crossing: v, firstTouch: v, heading: v },
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
    players: POS.map(([p, gk], i) => ({ id: `${id}-p${i}`, name: `${id}-p${i}`, age: 25, nationality: "BR", position: p, ...attrs(r), ...(gk ? { goalkeeping: { reflexes: r, handling: r, positioning: r, oneOnOnes: r } } : {}) })),
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
    else if (c.pendingOffers().length > 0) for (const o of c.pendingOffers()) c.respondOffer(o.id, false);
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

  it("draws no development chart at all for a player nobody has watched", () => {
    /*
     * The last place the fog leaked, and it leaked a whole career. `playerHistory` handed back the raw
     * rows for ANY player, so a rival at zero confidence had his exact rating for every past season
     * printed under a chart while the rest of the screen showed "?".
     */
    const c = career();
    c.simulateSeason();
    c.rolloverSeason();
    expect(c.confidenceIn(RIVAL)).toBe(0);
    expect(c.playerHistory(RIVAL)).toEqual([]);
    // Ours is on the record, because we do not need a scout to read our own past.
    expect(c.playerHistory(MINE).length).toBeGreaterThan(0);
  });

  it("gives a watched rival's history as bands, never as exact figures", () => {
    const c = career();
    c.simulateSeason();
    c.rolloverSeason();
    c.scout(RIVAL);
    advanceDays(c, OBSERVATION_STEPS[0]!.byDay + 2);

    const history = c.playerHistory(RIVAL);
    expect(history.length).toBeGreaterThan(0);
    for (const season of history) {
      // A band, and one that actually contains the guess — the screen prints a figure only on `exact`.
      expect(season.overall.exact).toBe(false);
      expect(season.overall.low).toBeLessThanOrEqual(season.overall.mid);
      expect(season.overall.high).toBeGreaterThanOrEqual(season.overall.mid);
      expect(season.overall.high).toBeGreaterThan(season.overall.low);
    }
    // Our own comes back exact, so the same chart can state a number where one is owed.
    expect(c.playerHistory(MINE).every((s) => s.overall.exact)).toBe(true);
  });

  /*
   * There is deliberately no test that each season is blurred on its OWN seed, and the reason is worth
   * recording: it is not observable from the public output. `estimateOf` builds the band as
   * `low = min(mid - margin, truth)` and `high = max(mid + margin, truth)`, and `mid` never lands further
   * than `margin` from the truth — so every band is exactly `2 * margin` wide whatever the offset was.
   * A test asserting the widths differ passes or fails by accident; the per-season seed is visible only
   * to someone holding the true ratings. Two attempts at such a test were written and both were wrong
   * about their own subject before this was measured.
   */

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
    // A spread of knowledge: most unseen, one at the second rung, one at the first.
    c.scout(RIVAL);
    advanceDays(c, OBSERVATION_STEPS[1]!.byDay + 2);
    const once = "t2-p0";
    c.scout(once);
    advanceDays(c, OBSERVATION_STEPS[0]!.byDay + 2);

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
        /*
         * The DERIVED surfaces, and the reason they are listed separately: this audit swept
         * `playerAttributes` — the source — and passed, while `playerDetail().attrs` collapsed the same
         * twenty-four numbers into six for the radar and fell back to the TRUE value on every lookup that
         * missed. Sweeping the input is not sweeping the output.
         */
        if (detail.attrs !== undefined) leaks.push(`${id}: radar attrs at 0`);
        if (detail.attrsPotential !== undefined) leaks.push(`${id}: radar potential at 0`);
        if (c.playerHistory(id).length > 0) leaks.push(`${id}: season history at 0`);
      }
      /*
       * A rival's radar must never arrive WITHOUT its band.
       *
       * The band is what stops the chart stating a figure on hover. Six midpoints with nothing around
       * them is the same claim as six measurements, which is what the tooltip printed at the 30% tier —
       * "72" for an attribute known give or take twenty.
       */
      if (detail.attrs && (detail.attrsLow === undefined || detail.attrsHigh === undefined)) {
        leaks.push(`${id}: radar attrs stated as fact at ${confidence}`);
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
    // And his radar carries NO band, which is what lets the hover state a figure. The absence is the
    // signal, so it has to be asserted rather than assumed.
    expect(detail.attrs).toBeDefined();
    expect(detail.attrsLow).toBeUndefined();
    expect(detail.attrsHigh).toBeUndefined();
  });

  it("gives a partly-watched rival a radar band wide enough to see", () => {
    // The 30% rung: every attribute is a guess give or take twenty, and the chart has to say so. This is
    // the case that was reported — the hover printed one confident number.
    const c = career();
    c.scout(RIVAL);
    advanceDays(c, OBSERVATION_STEPS[0]!.byDay + 2);
    expect(c.confidenceIn(RIVAL)).toBe(OBSERVATION_STEPS[0]!.to);

    const detail = c.playerDetail(RIVAL)!;
    expect(detail.attrs).toBeDefined();
    expect(detail.attrsLow).toBeDefined();
    expect(detail.attrsHigh).toBeDefined();
    for (const key of ["fin", "tec", "pas", "des", "fis", "vel"] as const) {
      expect(detail.attrsHigh![key]).toBeGreaterThan(detail.attrsLow![key]);
      // The guess sits inside its own band, or the shape would be drawn outside what the hover claims.
      expect(detail.attrs![key]).toBeGreaterThanOrEqual(detail.attrsLow![key]);
      expect(detail.attrs![key]).toBeLessThanOrEqual(detail.attrsHigh![key]);
    }
  });
});

describe("observation costs time", () => {
  it("reveals nothing the day a scout is sent", () => {
    const c = career();
    c.scout(RIVAL);
    expect(c.confidenceIn(RIVAL)).toBe(0);
    expect(c.scoutingView().watching).toHaveLength(1);
  });

  /**
   * The scout STAYS on him. A landed report used to end the assignment, so reaching 90%
   * meant spotting three reports and re-issuing twice — and every day the manager took to
   * notice was a day of observation thrown away.
   */
  it("files a report once the days have passed, and keeps watching", () => {
    const c = career();
    c.scout(RIVAL);
    advanceDays(c, OBSERVATION_STEPS[0]!.byDay + 2);

    expect(c.confidenceIn(RIVAL)).toBe(OBSERVATION_STEPS[0]!.to);
    expect(c.inbox().some((m) => m.type === InboxMessageType.ScoutReport && m.params.playerId === RIVAL)).toBe(true);
    const still = c.scoutingView().watching;
    expect(still).toHaveLength(1);
    expect(still[0]!.nextConfidence).toBe(OBSERVATION_STEPS[1]!.to);
  });

  it("opens the first tier of knowledge with that report", () => {
    const c = career();
    c.scout(RIVAL);
    advanceDays(c, OBSERVATION_STEPS[0]!.byDay + 2);

    const row = c.transferTargets().find((r) => r.playerId === RIVAL)!;
    expect(row.overallGrade).toBeTruthy(); // a letter, not a number
    expect(row.overall).toBeUndefined();
    expect(row.value!.exact).toBe(false);
  });

  /** One uninterrupted watch walks the whole ladder, narrowing as it goes. */
  it("narrows what we know at each rung, without being sent out again", () => {
    const c = career();
    c.scout(RIVAL);
    const widths: number[] = [];
    for (const [i, step] of OBSERVATION_STEPS.entries()) {
      advanceDays(c, step.byDay - (i === 0 ? 0 : OBSERVATION_STEPS[i - 1]!.byDay) + 2);
      expect(c.confidenceIn(RIVAL)).toBe(step.to);
      const v = c.transferTargets().find((r) => r.playerId === RIVAL)!.value!;
      widths.push(v.high - v.low);
    }
    expect(widths[0]).toBeGreaterThan(widths[1]!);
    expect(widths[1]).toBeGreaterThan(widths[2]!);
    // Ends complete, and the slot is finally free.
    expect(c.scoutingView().watching).toHaveLength(0);
    expect(c.scoutRefusal(RIVAL)).toBe("nothingLeftToLearn");
  });

  it("costs more for each rung — knowing someone well is an investment", () => {
    // The GAPS, since `byDay` is cumulative: a cumulative ladder rises whatever the
    // per-rung cost does, so asserting on it directly would prove nothing.
    const gaps = OBSERVATION_STEPS.map((s, i) => s.byDay - (i === 0 ? 0 : OBSERVATION_STEPS[i - 1]!.byDay));
    expect(gaps[1]).toBeGreaterThan(gaps[0]!);
    expect(gaps[2]).toBeGreaterThan(gaps[1]!);
  });

  /**
   * Coming back to a player he gave up on costs only what is still owed. Otherwise
   * cancelling would be punished twice — once by losing the days in progress, and again by
   * having to buy the whole rung from scratch.
   */
  it("charges a resumed observation only the days it still owes", () => {
    const c = career();
    c.scout(RIVAL);
    advanceDays(c, OBSERVATION_STEPS[0]!.byDay + 2);
    c.cancelScout(c.scoutingView().watching[0]!.id);
    expect(c.confidenceIn(RIVAL)).toBe(OBSERVATION_STEPS[0]!.to); // banked knowledge stays

    c.scout(RIVAL);
    const owed = c.scoutingView().watching[0]!.daysLeft;
    expect(owed).toBe(OBSERVATION_STEPS[1]!.byDay - OBSERVATION_STEPS[0]!.byDay);
    expect(owed).toBeLessThan(OBSERVATION_STEPS[1]!.byDay);
  });
});

describe("capacity, and the line behind it", () => {
  it("scales with the club's standing, six to ten", () => {
    // Every Brasileirão club used to land on three or four, because squad-average reputations all sit
    // between about 55 and 85 and the old formula had saturated well below that.
    expect(capacityFor(10)).toBe(6);
    expect(capacityFor(62)).toBe(7);
    expect(capacityFor(90)).toBe(10);
  });

  it("queues a request made while every scout is out, instead of refusing it", () => {
    const c = career();
    const rivals = c.transferTargets().map((r) => r.playerId);
    const cap = c.scoutingView().capacity;
    for (let i = 0; i < cap; i++) c.scout(rivals[i]!);
    expect(c.scoutingView().used).toBe(cap);

    // Not a refusal: he wanted this player watched, and "no" only asked him to come back later and
    // remember why.
    expect(c.scoutRefusal(rivals[cap]!)).toBe(null);
    expect(c.scoutWouldQueue()).toBe(true);
    c.scout(rivals[cap]!);
    c.scout(rivals[cap + 1]!);

    expect(c.scoutingView().used).toBe(cap); // no extra scout appeared
    expect(c.scoutingView().queued.map((q) => q.playerId)).toEqual([rivals[cap], rivals[cap + 1]]);
    expect(c.scoutingView().queued.map((q) => q.position)).toEqual([1, 2]);
  });

  it("will not queue the same player twice, or queue one already being watched", () => {
    const c = career();
    const rivals = c.transferTargets().map((r) => r.playerId);
    const cap = c.scoutingView().capacity;
    for (let i = 0; i < cap; i++) c.scout(rivals[i]!);

    c.scout(rivals[cap]!);
    expect(c.scoutRefusal(rivals[cap]!)).toBe("alreadyQueued");
    c.scout(rivals[cap]!);
    expect(c.scoutingView().queued).toHaveLength(1);
    expect(c.scoutRefusal(rivals[0]!)).toBe("alreadyWatching");
  });

  it("starts the next in line the moment a slot is cancelled, not on the next tick", () => {
    const c = career();
    const rivals = c.transferTargets().map((r) => r.playerId);
    const cap = c.scoutingView().capacity;
    for (let i = 0; i < cap; i++) c.scout(rivals[i]!);
    c.scout(rivals[cap]!);

    c.cancelScout(c.scoutingView().watching[0]!.id);

    // Cancelling one observation to let the queue through is one gesture, not one gesture and a wait.
    expect(c.scoutingView().used).toBe(cap);
    expect(c.scoutingView().queued).toHaveLength(0);
    expect(c.scoutingView().watching.map((w) => w.playerId)).toContain(rivals[cap]);
  });

  it("picks the queue up as reports finish the ladder", () => {
    const c = career();
    const rivals = c.transferTargets().map((r) => r.playerId);
    const cap = c.scoutingView().capacity;
    for (let i = 0; i < cap; i++) c.scout(rivals[i]!);
    c.scout(rivals[cap]!);

    // Long enough for every running observation to reach the top rung and release its slot.
    advanceDays(c, OBSERVATION_STEPS[OBSERVATION_STEPS.length - 1]!.byDay + 14);
    expect(c.scoutingView().queued).toHaveLength(0);
    expect(c.confidenceIn(rivals[cap]!)).toBeGreaterThan(0);
  });

  it("lets a queued player be taken back out of the line", () => {
    const c = career();
    const rivals = c.transferTargets().map((r) => r.playerId);
    const cap = c.scoutingView().capacity;
    for (let i = 0; i < cap; i++) c.scout(rivals[i]!);
    c.scout(rivals[cap]!);

    c.unqueueScout(rivals[cap]!);
    expect(c.scoutingView().queued).toHaveLength(0);
    expect(c.confidenceIn(rivals[cap]!)).toBe(0);
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
    // No `advanceDays` here, and that is now forced rather than lazy: the calendar only moves on match
    // days, about a week apart, and the first rung is five days — so there is no reachable moment that
    // is part-way through a first look. Cancelling before the next fixture is the only "early" there is.
    const c = career();
    c.scout(RIVAL);
    c.cancelScout(c.scoutingView().watching[0]!.id);

    expect(c.scoutingView().used).toBe(0);
    expect(c.confidenceIn(RIVAL)).toBe(0); // no partial credit
  });
});

describe("determinism and persistence", () => {
  it("survives a save/load before its first report, and still files it", () => {
    // Reloaded BEFORE any day passes. It used to advance three days first, which worked only because
    // the first rung was ten days away; at five days, and with the calendar moving a week at a time,
    // "three days in" is really "past the first two rungs" and the test was measuring the wrong thing.
    const c = career();
    c.scout(RIVAL);

    const reloaded = Career.load(JSON.parse(JSON.stringify(c.snapshot())), league);
    expect(reloaded.scoutingView().watching).toHaveLength(1);
    advanceDays(reloaded, OBSERVATION_STEPS[0]!.byDay);
    expect(reloaded.confidenceIn(RIVAL)).toBeGreaterThanOrEqual(OBSERVATION_STEPS[0]!.to);
  });

  it("keeps a queue across a save/load", () => {
    const c = career();
    const rivals = c.transferTargets().map((r) => r.playerId);
    const cap = c.scoutingView().capacity;
    for (let i = 0; i < cap; i++) c.scout(rivals[i]!);
    c.scout(rivals[cap]!);

    const reloaded = Career.load(JSON.parse(JSON.stringify(c.snapshot())), league);
    expect(reloaded.scoutingView().queued.map((q) => q.playerId)).toEqual([rivals[cap]]);
  });

  it("loads a save written before the queue existed, and gives it the new capacity", () => {
    // The one place backward compatibility is not optional. `capacity` used to be stored beside the
    // assignments; a save still carrying the old value must not keep watching three players.
    const c = career();
    c.scout(RIVAL);
    const raw = JSON.parse(JSON.stringify(c.snapshot()));
    delete raw.scouting.queue;
    raw.scouting.capacity = 3;

    const reloaded = Career.load(raw, league);
    expect(reloaded.scoutingView().queued).toEqual([]);
    expect(reloaded.scoutingView().capacity).toBeGreaterThan(3);
    expect(reloaded.scoutingView().watching).toHaveLength(1);
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
