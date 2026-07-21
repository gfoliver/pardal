import { describe, expect, it } from "vitest";
import { MatchRules, SubstitutionRules } from "@fut/domain";
import { MatchEventType, MatchSimulator } from "@fut/engine";
import { buildTeam } from "@fut/app-cli";

function run(seed: number, subRules: SubstitutionRules) {
  return new MatchSimulator().simulate({
    home: buildTeam({ id: "home", name: "Home", shortName: "HOM", rating: 65 }),
    away: buildTeam({ id: "away", name: "Away", shortName: "AWY", rating: 65 }),
    seed,
    matchRules: MatchRules.league(),
    substitutionRules: subRules,
  });
}

describe("Injuries", () => {
  it("occur at a realistic rate across a season (not exaggerated)", () => {
    const matches = 80;
    let injuries = 0;
    for (let seed = 1; seed <= matches; seed++) {
      const r = run(seed, SubstitutionRules.brasileirao());
      injuries += r.timeline.filter((e) => e.type === MatchEventType.Injury).length;
    }
    const perMatch = injuries / matches; // both teams combined
    expect(perMatch).toBeGreaterThan(0.1);
    expect(perMatch).toBeLessThan(1.1);
  });

  it("an injury with substitutions available triggers a forced substitution", () => {
    // Find a seed where an injury happens while a sub window is still open.
    let sawForcedSub = false;
    for (let seed = 1; seed <= 120 && !sawForcedSub; seed++) {
      const r = run(seed, SubstitutionRules.brasileirao());
      sawForcedSub = r.timeline.some(
        (e) => e.type === MatchEventType.Substitution && e.params?.injury === true,
      );
    }
    expect(sawForcedSub).toBe(true);
  });

  it("with no substitutions allowed, an injury leaves the team a man down", () => {
    // No substitutions permitted → an injured player cannot be replaced.
    const noSubs = new SubstitutionRules(0, 0, false);
    let sawUnreplacedInjury = false;
    for (let seed = 1; seed <= 120 && !sawUnreplacedInjury; seed++) {
      const r = run(seed, noSubs);
      const injuries = r.timeline.filter((e) => e.type === MatchEventType.Injury);
      const subs = r.timeline.filter((e) => e.type === MatchEventType.Substitution);
      if (injuries.length > 0 && subs.length === 0) sawUnreplacedInjury = true;
    }
    expect(sawUnreplacedInjury).toBe(true);
  });
});
