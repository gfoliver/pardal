import { describe, expect, it } from "vitest";
import { MatchRules, Mentality, RoleKey, SubstitutionRules } from "@fut/domain";
import {
  MatchEventType,
  MatchSimulator,
  possessionPercent,
  type MatchConfig,
} from "@fut/engine";
import { buildTeam } from "@fut/app-cli";

/**
 * Statistical guardrails ("balancing guided by tests"). These lock the engine's
 * output into a realistic envelope over many matches, so future changes can't
 * silently regress the balance. Ranges are intentionally generous.
 */
describe("Engine calibration (realistic output envelope)", () => {
  const N = 40;
  const sim = new MatchSimulator();

  const acc = {
    goals: 0,
    shots: 0,
    passes: 0,
    passesCompleted: 0,
    fouls: 0,
    offsides: 0,
    corners: 0,
    reds: 0,
    possHome: 0,
  };

  for (let seed = 1; seed <= N; seed++) {
    const config: MatchConfig = {
      home: buildTeam({ id: "home", name: "Home", shortName: "HOM", rating: 65 }),
      away: buildTeam({ id: "away", name: "Away", shortName: "AWY", rating: 65 }),
      seed,
      matchRules: MatchRules.league(),
      substitutionRules: SubstitutionRules.brasileirao(),
    };
    const r = sim.simulate(config);
    for (const s of [r.stats.home, r.stats.away]) {
      acc.goals += s.goals;
      acc.shots += s.shots;
      acc.passes += s.passes;
      acc.passesCompleted += s.passesCompleted;
      acc.fouls += s.fouls;
      acc.offsides += s.offsides;
      acc.corners += s.corners;
      acc.reds += s.redCards;
    }
    acc.possHome += possessionPercent(r.stats.home, r.stats.away).home;
  }

  const perTeam = (x: number) => x / (N * 2);

  it("goals per team are in a realistic range", () => {
    expect(perTeam(acc.goals)).toBeGreaterThan(0.6);
    expect(perTeam(acc.goals)).toBeLessThan(2.5);
  });

  it("shots per team are in a realistic range", () => {
    expect(perTeam(acc.shots)).toBeGreaterThan(7);
    expect(perTeam(acc.shots)).toBeLessThan(24);
  });

  it("pass completion is realistic (70–90%)", () => {
    const passAcc = acc.passesCompleted / acc.passes;
    expect(passAcc).toBeGreaterThan(0.7);
    expect(passAcc).toBeLessThan(0.9);
  });

  it("corners per team are in a realistic range", () => {
    expect(perTeam(acc.corners)).toBeGreaterThan(1.5);
    expect(perTeam(acc.corners)).toBeLessThan(9);
  });

  it("fouls and offsides occur at plausible rates", () => {
    expect(perTeam(acc.fouls)).toBeGreaterThan(3);
    expect(perTeam(acc.fouls)).toBeLessThan(16);
    expect(perTeam(acc.offsides)).toBeGreaterThan(0.2);
    expect(perTeam(acc.offsides)).toBeLessThan(5);
  });

  it("red cards are rare", () => {
    expect(perTeam(acc.reds)).toBeLessThan(0.8);
  });

  it("possession is balanced for evenly-matched teams", () => {
    const avgHome = acc.possHome / N;
    expect(avgHome).toBeGreaterThan(42);
    expect(avgHome).toBeLessThan(58);
  });
});

describe("Roles change on-pitch behaviour", () => {
  const sim = new MatchSimulator();

  function totalShotsWithForwardRole(role: RoleKey): number {
    let shots = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const r = sim.simulate({
        home: buildTeam({
          id: "home",
          name: "Home",
          shortName: "HOM",
          rating: 65,
          forwardRole: role,
        }),
        away: buildTeam({ id: "away", name: "Away", shortName: "AWY", rating: 65 }),
        seed,
        matchRules: MatchRules.league(),
        substitutionRules: SubstitutionRules.brasileirao(),
      });
      shots += r.stats.home.shots;
    }
    return shots;
  }

  it("a Poacher shoots more than a deep-lying playmaker forward", () => {
    const poacherShots = totalShotsWithForwardRole(RoleKey.Poacher);
    const playmakerShots = totalShotsWithForwardRole(RoleKey.DeepLyingPlaymaker);
    expect(poacherShots).toBeGreaterThan(playmakerShots);
  });
});

describe("Team tactics change on-pitch behaviour", () => {
  const sim = new MatchSimulator();

  function totalShotsWithMentality(mentality: Mentality): number {
    let shots = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const r = sim.simulate({
        home: buildTeam({
          id: "home",
          name: "Home",
          shortName: "HOM",
          rating: 65,
          mentality,
        }),
        away: buildTeam({ id: "away", name: "Away", shortName: "AWY", rating: 65 }),
        seed,
        matchRules: MatchRules.league(),
        substitutionRules: SubstitutionRules.brasileirao(),
      });
      shots += r.stats.home.shots;
    }
    return shots;
  }

  it("a very attacking side shoots more than a very defensive one", () => {
    const attacking = totalShotsWithMentality(Mentality.VeryAttacking);
    const defensive = totalShotsWithMentality(Mentality.VeryDefensive);
    expect(attacking).toBeGreaterThan(defensive);
  });
});

describe("Assists", () => {
  it("credits an assist on at least some goals", () => {
    const sim = new MatchSimulator();
    let assisted = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const r = sim.simulate({
        home: buildTeam({ id: "home", name: "Home", shortName: "HOM", rating: 78 }),
        away: buildTeam({ id: "away", name: "Away", shortName: "AWY", rating: 55 }),
        seed,
        matchRules: MatchRules.league(),
        substitutionRules: SubstitutionRules.brasileirao(),
      });
      for (const e of r.timeline) {
        if (e.type === MatchEventType.Goal && e.secondaryPlayerId) assisted++;
      }
    }
    expect(assisted).toBeGreaterThan(0);
  });
});
