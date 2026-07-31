import { describe, expect, it } from "vitest";
import { MatchRules, SubstitutionRules } from "@fut/domain";
import { MatchSimulator, possessionPercent } from "@fut/engine";
import { buildTeam } from "@fut/app-cli";

/**
 * Keeps the zone engine standing where the spatial engine stands.
 *
 * A multiplayer league splits its fixture list between the two engines — CPU-vs-CPU
 * here, anything involving a human in spatial — while sharing ONE table, one scorers
 * list and one suspension ledger. So a divergence between them is not a cosmetic
 * difference between two simulations; it is a manager's league position depending on
 * who happened to be on their schedule. Discipline is the sharpest case: before this
 * was calibrated, yellows ran 2.3x higher in spatial off the same fixture, so a
 * human-heavy schedule collected suspensions at over twice the rate.
 *
 * The bounds below are deliberately GENEROUS. Slight divergence in the engine that
 * only ever plays CPU-vs-CPU is acceptable; a drift back to 2x is not. They are
 * checks on the zone engine only — the spatial figures are constants measured once
 * (`npm run balance:parity`, n=60), because a spatial match costs ~6.4 s against
 * this engine's ~15 ms and running it here would make the suite unusable.
 *
 * When these fail: `npx tsx packages/app-cli/src/zoneCalibrate.ts` shows every axis
 * against its target and its noise, which is the tool for fixing it. Re-measure the
 * spatial constants only if the SPATIAL engine changed.
 */

/** Spatial, mirror 4-4-2 rating 80, per team per match, n=60. */
const SPATIAL = {
  goals: 1.27,
  shots: 13.46,
  onTarget: 4.74,
  fouls: 8.21,
  yellow: 1.99,
  red: 0.25,
  offsides: 3.6,
  /**
   * Pass completion, as a percentage. Loosest bound of the set, deliberately: this
   * sits ~5 points below spatial and both figures are realistic for football, so it
   * is a parity difference on a stats-page number rather than a defect. It is tracked
   * because it drifted 82% -> 76% across several changes while nothing was watching
   * — it lived in a "derived" print line instead of a checked target.
   */
  completionPct: 84,
} as const;

const RATING = 80;
const mk = (id: string, rating = RATING) =>
  buildTeam({ id, name: id, shortName: id.toUpperCase().slice(0, 3), rating });

function zoneAverages(n: number, awayRating = RATING) {
  const sim = new MatchSimulator();
  const acc = {
    goals: 0, shots: 0, onTarget: 0, fouls: 0, yellow: 0, red: 0, offsides: 0,
    poss: 0, homePoints: 0, homeGd: 0, passes: 0, completed: 0,
  };
  for (let seed = 1; seed <= n; seed++) {
    const r = sim.simulate({
      home: mk("home"),
      away: mk("away", awayRating),
      seed,
      matchRules: MatchRules.league(),
      substitutionRules: SubstitutionRules.brasileirao(),
    });
    for (const s of [r.stats.home, r.stats.away]) {
      acc.goals += s.goals; acc.shots += s.shots; acc.onTarget += s.shotsOnTarget;
      acc.fouls += s.fouls; acc.yellow += s.yellowCards; acc.red += s.redCards;
      acc.offsides += s.offsides;
      acc.passes += s.passes; acc.completed += s.passesCompleted;
    }
    acc.poss += possessionPercent(r.stats.home, r.stats.away).home;
    const h = r.stats.home.goals;
    const a = r.stats.away.goals;
    acc.homePoints += h > a ? 3 : h === a ? 1 : 0;
    acc.homeGd += h - a;
  }
  const per = (x: number) => x / (n * 2);
  return {
    goals: per(acc.goals), shots: per(acc.shots), onTarget: per(acc.onTarget),
    fouls: per(acc.fouls), yellow: per(acc.yellow), red: per(acc.red),
    offsides: per(acc.offsides),
    completionPct: (acc.completed / acc.passes) * 100,
    possession: acc.poss / n,
    homePpm: acc.homePoints / n,
    homeGd: acc.homeGd / n,
  };
}

describe("zone/spatial parity for a shared league", () => {
  const zone = zoneAverages(400);

  // Tolerances per axis, as a fraction of the spatial value. Discipline is tightest
  // because it decides suspensions; the rest only decorates a stats page.
  const bounds: [keyof typeof SPATIAL, number][] = [
    ["goals", 0.2],
    ["shots", 0.2],
    ["onTarget", 0.25],
    ["fouls", 0.25],
    ["yellow", 0.25],
    ["red", 0.45],
    ["offsides", 0.3],
    ["completionPct", 0.12],
  ];

  for (const [key, tol] of bounds) {
    it(`${key} stays within ${(tol * 100).toFixed(0)}% of spatial`, () => {
      const got = zone[key];
      const want = SPATIAL[key];
      const drift = Math.abs(got - want) / want;
      expect(
        drift,
        `zone ${key} = ${got.toFixed(2)}, spatial = ${want.toFixed(2)} (${(drift * 100).toFixed(0)}% off)`,
      ).toBeLessThan(tol);
    });
  }

  it("is symmetric in a mirrored fixture — no phantom home or away edge", () => {
    // Equal teams must produce equal results. This catches a whole class of mistake
    // that a per-axis average hides, and it is also the control for the rating test
    // below: a slope measured off a biased baseline means nothing.
    expect(Math.abs(zone.homeGd), `home GD ${zone.homeGd.toFixed(3)}`).toBeLessThan(0.12);
    expect(Math.abs(zone.possession - 50)).toBeLessThan(2);
  });

  it("gives better teams more points, and keeps doing so as the gap widens", () => {
    // The property that matters most and the one a constant cannot fake: if this
    // flattens, every calibration above is worthless because the league stops
    // rewarding squad quality. Measured monotonic at n=3000: 1.31 / 1.72 / 2.06 /
    // 2.32 points per match at gaps of 0 / 6 / 12 / 18 — a climb of 1.01 against the
    // spatial engine's 1.19. The floor below therefore has real headroom above it,
    // while still catching a regression toward the 0.68 this sat at before the
    // conversion differential, keeper fatigue and quality-aware shot selection.
    const ppm = [0, 6, 12, 18].map((gap) => zoneAverages(250, RATING - gap).homePpm);
    for (let i = 1; i < ppm.length; i++) {
      expect(
        ppm[i]!,
        `ppm by rating gap: ${ppm.map((p) => p.toFixed(2)).join(" ")}`,
      ).toBeGreaterThan(ppm[i - 1]! - 0.08); // monotone, with slack for sampling
    }
    // ...and the total climb is real, not a rounding wobble.
    expect(ppm[3]! - ppm[0]!, `climb ${(ppm[3]! - ppm[0]!).toFixed(2)}`).toBeGreaterThan(0.7);
  });
});
