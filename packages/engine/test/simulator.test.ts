import { describe, expect, it } from "vitest";
import { MatchRules, SubstitutionRules } from "@fut/domain";
import { DecidedBy, MatchSimulator, type MatchConfig } from "@fut/engine";
import { buildTeam } from "@fut/app-cli";

function leagueConfig(seed: number, homeRating = 65, awayRating = 65): MatchConfig {
  return {
    home: buildTeam({ id: "home", name: "Home FC", shortName: "HOM", rating: homeRating }),
    away: buildTeam({ id: "away", name: "Away FC", shortName: "AWY", rating: awayRating }),
    seed,
    matchRules: MatchRules.league(),
    substitutionRules: SubstitutionRules.brasileirao(),
  };
}

describe("MatchSimulator determinism", () => {
  it("produces identical results for the same seed and input", () => {
    const sim = new MatchSimulator();
    const a = sim.simulate(leagueConfig(42));
    const b = sim.simulate(leagueConfig(42));
    expect(a).toEqual(b);
  });

  it("produces a stable golden result for a fixed seed", () => {
    const sim = new MatchSimulator();
    const r = sim.simulate(leagueConfig(42));
    expect({
      score: `${r.homeScore}-${r.awayScore}`,
      shots: [r.stats.home.shots, r.stats.away.shots],
      timelineLength: r.timeline.length,
    }).toMatchSnapshot();
  });
});

describe("MatchSimulator sanity (attributes matter)", () => {
  it("the much stronger team wins the majority of matches", () => {
    const sim = new MatchSimulator();
    let strongWins = 0;
    const runs = 24;
    for (let seed = 1; seed <= runs; seed++) {
      const r = sim.simulate(leagueConfig(seed, 88, 42));
      if (r.homeScore > r.awayScore) strongWins++;
    }
    expect(strongWins).toBeGreaterThan(runs / 2);
  });

  it("keeps goals within a realistic range", () => {
    const sim = new MatchSimulator();
    for (let seed = 1; seed <= 10; seed++) {
      const r = sim.simulate(leagueConfig(seed));
      expect(r.homeScore + r.awayScore).toBeLessThanOrEqual(12);
    }
  });
});

describe("Knockout format (injected MatchRules/TieContext)", () => {
  function knockoutConfig(seed: number): MatchConfig {
    return {
      ...leagueConfig(seed),
      matchRules: MatchRules.knockout(),
    };
  }

  it("always yields a winner (never a draw)", () => {
    const sim = new MatchSimulator();
    for (let seed = 1; seed <= 30; seed++) {
      const r = sim.simulate(knockoutConfig(seed));
      expect(r.outcome.decidedBy).not.toBe(DecidedBy.Draw);
      expect(r.outcome.winnerTeamId).toBeDefined();
    }
  });

  it("resolves at least one tie via a penalty shootout", () => {
    const sim = new MatchSimulator();
    let sawShootout = false;
    for (let seed = 1; seed <= 60 && !sawShootout; seed++) {
      const r = sim.simulate(knockoutConfig(seed));
      if (r.outcome.decidedBy === DecidedBy.Shootout) {
        sawShootout = true;
        expect(r.shootoutScore).toBeDefined();
        expect(r.shootoutScore!.home).not.toBe(r.shootoutScore!.away);
      }
    }
    expect(sawShootout).toBe(true);
  });
});
