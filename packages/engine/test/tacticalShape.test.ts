import { describe, expect, it } from "vitest";
import { Formation, MatchRules, Position, SubstitutionRules } from "@fut/domain";
import {
  MatchState,
  MatchSimulator,
  PositioningModel,
  possessionPercent,
} from "@fut/engine";
import { buildTeam } from "@fut/app-cli";

describe("Possession is a tactical choice", () => {
  it("a patient (low-tempo) side keeps more of the ball than a direct one", () => {
    const sim = new MatchSimulator();
    const patient = buildTeam({
      id: "pat", name: "Patient", shortName: "PAT", rating: 65,
      formation: Formation.F442, instructions: { tempo: 0.15, directness: 0.25 },
    });
    const direct = buildTeam({
      id: "dir", name: "Direct", shortName: "DIR", rating: 65,
      formation: Formation.F442, instructions: { tempo: 0.9, directness: 0.85 },
    });

    let patientPossession = 0;
    const runs = 24;
    for (let seed = 1; seed <= runs; seed++) {
      const r = sim.simulate({
        home: patient, away: direct, seed,
        matchRules: MatchRules.league(), substitutionRules: SubstitutionRules.brasileirao(),
      });
      patientPossession += possessionPercent(r.stats.home, r.stats.away).home;
    }
    expect(patientPossession / runs).toBeGreaterThan(51);
  });
});

describe("Relational defensive shape", () => {
  it("the defensive block slides toward the ball's flank", () => {
    const home = buildTeam({ id: "home", name: "Home", shortName: "HOM", rating: 65 });
    const away = buildTeam({ id: "away", name: "Away", shortName: "AWY", rating: 65 });
    const s = new MatchState(home, away, MatchRules.league(), SubstitutionRules.brasileirao(), undefined);
    const positioning = new PositioningModel();
    // Home is DEFENDING (away has the ball) in home's own third.
    s.possessionTeamId = away.id;
    const cb = home.startingXi.find((p) => p.position === Position.CentreBack)!;

    s.ballZone = { third: 0, lane: 2 }; // attack central
    positioning.assign(s);
    const laneCentral = s.positions.get(cb.id)!.lane;

    s.ballZone = { third: 0, lane: 0 }; // attack down home's left
    positioning.assign(s);
    const laneWide = s.positions.get(cb.id)!.lane;

    // The block shifts toward the ball, so the defender sits no further from the
    // ball's lane when the attack is wide (and shifts over for a right-sided CB).
    expect(laneWide).toBeLessThanOrEqual(laneCentral);
  });
});
