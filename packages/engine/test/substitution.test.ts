import { describe, expect, it } from "vitest";
import { MatchRules, Position, SubstitutionRules, Team, type Player } from "@fut/domain";
import { MatchEventType, MatchSimulator, SubstitutionManager } from "@fut/engine";
import { buildTeam } from "@fut/app-cli";

describe("SubstitutionManager (injected rules)", () => {
  it("enforces the maximum number of substitutions", () => {
    const mgr = new SubstitutionManager(new SubstitutionRules(5, 5, false));
    for (let i = 0; i < 5; i++) {
      expect(mgr.canSubstitute("t", 10 + i, false)).toBe(true);
      mgr.record("t", 10 + i, false);
    }
    expect(mgr.canSubstitute("t", 80, false)).toBe(false);
  });

  it("enforces the maximum number of windows (Brasileirão 5/3)", () => {
    const mgr = new SubstitutionManager(SubstitutionRules.brasileirao());
    // Three distinct minutes = three windows.
    for (const minute of [30, 60, 75]) {
      expect(mgr.canSubstitute("t", minute, false)).toBe(true);
      mgr.record("t", minute, false);
    }
    // A fourth distinct minute would open a fourth window — denied.
    expect(mgr.canSubstitute("t", 85, false)).toBe(false);
    // But another sub within an already-open window is allowed.
    expect(mgr.canSubstitute("t", 75, false)).toBe(true);
  });

  it("does not consume a window at half-time when exempt", () => {
    const mgr = new SubstitutionManager(SubstitutionRules.brasileirao());
    mgr.record("t", 45, true); // half-time, exempt
    expect(mgr.windowsUsed("t")).toBe(0);
    // Still three in-play windows available.
    for (const minute of [50, 65, 80]) {
      expect(mgr.canSubstitute("t", minute, false)).toBe(true);
      mgr.record("t", minute, false);
    }
    expect(mgr.windowsUsed("t")).toBe(3);
  });
});

/**
 * A keeper only ever replaces a keeper.
 *
 * `AiCoachController.benchReplacement` and `LiveMatch.injuryReplacement` both fell back to the ENTIRE
 * bench ranked by overall when no same-position substitute was available, and a 4-4-2's bench holds no
 * full-back, winger or central midfielder — so a fatigue substitution for any of those six starters
 * reached the fallback. Whether it then picked the reserve KEEPER depended only on whether he was the
 * best-rated man sitting there, which in a career squad he frequently is.
 *
 * Which is why the fixture below is deliberately lopsided: `buildTeam`'s own bench keeper happens to be
 * its LOWEST-rated substitute, so the flat fixture the rest of this suite uses never reached the bug
 * and cannot guard against it. A first-choice keeper behind a weak outfield squad — exactly what a
 * relegation-threatened club looks like — is the case that broke, and the case this pins.
 *
 * The spatial engine has always guarded it (`GameState.substitute`); this is the zone engine catching up.
 */
describe("substitutions respect the goalkeeper line", () => {
  /** A poor side whose only good player is the man on the bench in goal. */
  function lopsided(id: string): Team {
    const weak = buildTeam({ id, name: id, shortName: id.slice(0, 3).toUpperCase(), rating: 50 });
    const star = buildTeam({ id: `${id}-star`, name: "star", shortName: "STA", rating: 95 });
    const starKeeper = star.bench.find((p) => p.position === Position.Goalkeeper)!;
    return new Team({
      id: weak.id,
      name: weak.name,
      shortName: weak.shortName,
      coach: weak.coach,
      startingXi: [...weak.startingXi],
      bench: [starKeeper, ...weak.bench.filter((p) => p.position !== Position.Goalkeeper)],
      tactics: weak.tactics,
    });
  }

  it("never brings a keeper on for an outfielder, or the reverse", () => {
    let substitutions = 0;
    const offenders: string[] = [];
    for (let seed = 1; seed <= 120; seed++) {
      const home = lopsided("home");
      const away = lopsided("away");
      const r = new MatchSimulator().simulate({
        home,
        away,
        seed,
        matchRules: MatchRules.league(),
        substitutionRules: SubstitutionRules.brasileirao(),
      });
      const byId = new Map(
        [...home.startingXi, ...home.bench, ...away.startingXi, ...away.bench].map((p) => [p.id, p]),
      );
      const isGk = (p: Player | undefined) => p?.position === Position.Goalkeeper;
      for (const e of r.timeline) {
        if (e.type !== MatchEventType.Substitution) continue;
        substitutions++;
        const on = byId.get(e.playerId ?? "");
        const off = byId.get(e.secondaryPlayerId ?? "");
        if (on && off && isGk(on) !== isGk(off)) offenders.push(`seed ${seed} ${e.minute}': ${on.position} on for ${off.position}`);
      }
    }
    // The control: a run with no substitutions at all would pass the assertion for the wrong reason.
    expect(substitutions).toBeGreaterThan(100);
    expect(offenders).toEqual([]);
  });
});
