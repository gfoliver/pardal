import { describe, expect, it } from "vitest";
import {
  MatchRules,
  PositionGroup,
  positionGroup,
  SubstitutionRules,
} from "@fut/domain";
import {
  CardColor,
  FoulSeverity,
  MatchState,
  RefereeAdjudicator,
} from "@fut/engine";
import { buildTeam } from "@fut/app-cli";

function freshState(): MatchState {
  const home = buildTeam({ id: "home", name: "Home", shortName: "HOM", rating: 60 });
  const away = buildTeam({ id: "away", name: "Away", shortName: "AWY", rating: 60 });
  return new MatchState(
    home,
    away,
    MatchRules.league(),
    SubstitutionRules.brasileirao(),
    undefined,
  );
}

function anAwayDefenderId(state: MatchState): string {
  const defender = state
    .onPitchPlayers(state.awayTeam.id)
    .find((p) => positionGroup(p.position) === PositionGroup.Defence)!;
  return defender.id;
}

describe("RefereeAdjudicator (infallible rules)", () => {
  it("awards a penalty for a foul in the defending penalty area", () => {
    const state = freshState();
    const referee = new RefereeAdjudicator();
    state.possessionTeamId = state.homeTeam.id;
    state.ballZone = { third: 4, lane: 2 }; // attacking third, central = penalty area
    const ruling = referee.judgeFoul(state, anAwayDefenderId(state), FoulSeverity.Normal);
    expect(ruling.isPenalty).toBe(true);
  });

  it("awards a free kick (not a penalty) for a wide foul", () => {
    const state = freshState();
    const referee = new RefereeAdjudicator();
    state.possessionTeamId = state.homeTeam.id;
    state.ballZone = { third: 4, lane: 0 }; // deep but wide (touchline)
    const ruling = referee.judgeFoul(state, anAwayDefenderId(state), FoulSeverity.Normal);
    expect(ruling.isPenalty).toBe(false);
  });

  it("turns a second yellow into a red and sends the player off", () => {
    const state = freshState();
    const referee = new RefereeAdjudicator();
    state.possessionTeamId = state.homeTeam.id;
    state.ballZone = { third: 2, lane: 2 };
    const offender = anAwayDefenderId(state);

    const first = referee.judgeFoul(state, offender, FoulSeverity.Bookable);
    expect(first.card).toBe(CardColor.Yellow);
    expect(state.playerState(offender).sentOff).toBe(false);

    const second = referee.judgeFoul(state, offender, FoulSeverity.Bookable);
    expect(second.card).toBe(CardColor.Red);
    expect(state.playerState(offender).sentOff).toBe(true);
    expect(
      state.onPitchPlayers(state.awayTeam.id).some((p) => p.id === offender),
    ).toBe(false);
  });

  it("issues a straight red for a sending-off offence", () => {
    const state = freshState();
    const referee = new RefereeAdjudicator();
    state.possessionTeamId = state.homeTeam.id;
    const offender = anAwayDefenderId(state);
    const ruling = referee.judgeFoul(state, offender, FoulSeverity.SendingOff);
    expect(ruling.card).toBe(CardColor.Red);
    expect(state.playerState(offender).sentOff).toBe(true);
  });

  it("detects offside via a pure line comparison", () => {
    const state = freshState();
    const referee = new RefereeAdjudicator();
    expect(referee.isOffside(state, true)).toBe(true);
    expect(referee.isOffside(state, false)).toBe(false);
  });
});
