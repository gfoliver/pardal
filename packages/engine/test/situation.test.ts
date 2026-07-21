import { describe, expect, it } from "vitest";
import { MatchRules, SubstitutionRules, TieContext } from "@fut/domain";
import { MatchState, SituationAssessor, SituationKind } from "@fut/engine";
import { buildTeam } from "@fut/app-cli";

function stateWith(tie: TieContext | undefined): MatchState {
  const home = buildTeam({ id: "home", name: "Home", shortName: "HOM", rating: 60 });
  const away = buildTeam({ id: "away", name: "Away", shortName: "AWY", rating: 60 });
  const state = new MatchState(
    home,
    away,
    MatchRules.knockout(),
    SubstitutionRules.brasileirao(),
    tie,
  );
  state.minute = 80;
  return state;
}

describe("SituationAssessor", () => {
  it("uses the isolated score in a league-style match", () => {
    const state = stateWith(undefined);
    state.score.home = 0;
    state.score.away = 1; // home trailing
    const assessor = new SituationAssessor();
    expect(assessor.assess(state, state.homeTeam.id).kind).toBe(SituationKind.Chase);
    expect(assessor.assess(state, state.awayTeam.id).kind).toBe(SituationKind.Protect);
  });

  it("uses the AGGREGATE in a two-legged tie, not the isolated score", () => {
    // Home lost the first leg 0-2; leading 1-0 on the day is still not enough.
    const state = stateWith(new TieContext(0, 2));
    state.score.home = 1; // winning on the day
    state.score.away = 0;
    const assessor = new SituationAssessor();
    // Aggregate: home 1, away 2 → home must still chase, away protects.
    expect(assessor.assess(state, state.homeTeam.id).kind).toBe(SituationKind.Chase);
    expect(assessor.assess(state, state.awayTeam.id).kind).toBe(SituationKind.Protect);
  });

  it("lets a team protect a comfortable aggregate even when drawing on the day", () => {
    // Home won the first leg 2-0; a 0-0 on the day is a good result.
    const state = stateWith(new TieContext(2, 0));
    state.score.home = 0;
    state.score.away = 0;
    const assessor = new SituationAssessor();
    expect(assessor.assess(state, state.homeTeam.id).kind).toBe(SituationKind.Protect);
    expect(assessor.assess(state, state.awayTeam.id).kind).toBe(SituationKind.Chase);
  });
});
