import { describe, expect, it } from "vitest";
import {
  Formation,
  MatchRules,
  Position,
  positionGroup,
  PositionGroup,
  RoleKey,
  SubstitutionRules,
} from "@fut/domain";
import {
  MatchEventType,
  MatchState,
  MatchSimulator,
  PositioningModel,
} from "@fut/engine";
import { buildTeam } from "@fut/app-cli";

function state(homeFormation: Formation, homeRoleByPosition?: Partial<Record<Position, RoleKey>>) {
  const home = buildTeam({
    id: "home", name: "Home", shortName: "HOM", rating: 65,
    formation: homeFormation, roleByPosition: homeRoleByPosition,
  });
  const away = buildTeam({ id: "away", name: "Away", shortName: "AWY", rating: 65 });
  return new MatchState(home, away, MatchRules.league(), SubstitutionRules.brasileirao(), undefined);
}

describe("Off-ball runs", () => {
  it("runners advance further up the pitch as the ball is carried forward", () => {
    const s = state(Formation.F442);
    const positioning = new PositioningModel();
    // A central midfielder has room to make a forward run (a striker is already
    // pinned at the top of the pitch).
    const midfielder = s.homeTeam.startingXi.find(
      (p) => p.position === Position.CentralMidfielder,
    )!;

    s.possessionTeamId = s.homeTeam.id;
    s.ballZone = { third: 1, lane: 2 }; // ball deep in own half
    positioning.assign(s);
    const deep = s.positions.get(midfielder.id)!.third;

    s.ballZone = { third: 4, lane: 2 }; // ball in the final third
    positioning.assign(s);
    const advanced = s.positions.get(midfielder.id)!.third;

    expect(advanced).toBeGreaterThan(deep);
  });

  it("keeps a presence in the central attacking zone even with a false 9", () => {
    const s = state(Formation.F433, { [Position.Striker]: RoleKey.FalseNine });
    s.possessionTeamId = s.homeTeam.id;
    s.ballZone = { third: 4, lane: 2 };
    new PositioningModel().assign(s);

    const central = s.homeTeam.startingXi.filter((p) => {
      const z = s.positions.get(p.id);
      return z !== undefined && z.third === 4 && z.lane === 2;
    });
    expect(central.length).toBeGreaterThan(0);
  });

  it("lets midfielders score via infiltration in a false-9 system", () => {
    const sim = new MatchSimulator();
    const home = buildTeam({
      id: "home", name: "Home", shortName: "HOM", rating: 70,
      formation: Formation.F433, roleByPosition: { [Position.Striker]: RoleKey.FalseNine },
    });
    const away = buildTeam({ id: "away", name: "Away", shortName: "AWY", rating: 58 });

    let midGoals = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const r = sim.simulate({
        home, away, seed,
        matchRules: MatchRules.league(),
        substitutionRules: SubstitutionRules.brasileirao(),
      });
      for (const e of r.timeline) {
        if (e.type !== MatchEventType.Goal || e.teamId !== home.id || !e.playerId) continue;
        const scorer = home.startingXi.find((p) => p.id === e.playerId);
        if (scorer && positionGroup(scorer.position) === PositionGroup.Midfield) midGoals++;
      }
    }
    expect(midGoals).toBeGreaterThan(0);
  });
});
