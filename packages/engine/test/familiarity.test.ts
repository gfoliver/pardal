import { describe, expect, it } from "vitest";
import { MatchRules, SubstitutionRules } from "@fut/domain";
import { MatchSimulator } from "@fut/engine";
import { buildTeam } from "@fut/app-cli";

describe("Tactic familiarity (zone engine)", () => {
  it("a side unfamiliar with its own tactic completes fewer passes than an identical, drilled side", () => {
    const sim = new MatchSimulator();
    const rusty = buildTeam({ id: "rusty", name: "Rusty", shortName: "RUS", rating: 65, instructions: { familiarity: 0.2 } });
    const drilled = buildTeam({ id: "drilled", name: "Drilled", shortName: "DRI", rating: 65 }); // no familiarity → fully drilled

    let rustyAcc = 0;
    let drilledAcc = 0;
    const runs = 24;
    for (let seed = 1; seed <= runs; seed++) {
      const r = sim.simulate({ home: rusty, away: drilled, seed, matchRules: MatchRules.league(), substitutionRules: SubstitutionRules.brasileirao() });
      rustyAcc += r.stats.home.passes > 0 ? r.stats.home.passesCompleted / r.stats.home.passes : 0;
      drilledAcc += r.stats.away.passes > 0 ? r.stats.away.passesCompleted / r.stats.away.passes : 0;
    }
    expect(rustyAcc / runs).toBeLessThan(drilledAcc / runs);
  });
});
