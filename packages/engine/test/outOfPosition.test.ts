import { describe, expect, it } from "vitest";
import { MatchRules, Position, SubstitutionRules, Team } from "@fut/domain";
import { MatchState } from "@fut/engine";
import { buildTeam } from "@fut/app-cli";

/** Rebuild a team fielding one striker out of position at centre-back. */
function teamWithStrikerAtCentreBack(): { team: Team; strikerId: string } {
  const base = buildTeam({ id: "home", name: "Home", shortName: "HOM", rating: 65 });
  const striker = base.startingXi.find((p) => p.position === Position.Striker)!;
  const tactics = base.tactics.withPosition(striker.id, Position.CentreBack);
  const team = new Team({
    id: base.id,
    name: base.name,
    shortName: base.shortName,
    coach: base.coach,
    startingXi: base.startingXi,
    bench: base.bench,
    tactics,
  });
  return { team, strikerId: striker.id };
}

describe("Out-of-position fielding (engine)", () => {
  it("tracks the fielded position and applies a familiarity debuff", () => {
    const { team, strikerId } = teamWithStrikerAtCentreBack();
    const away = buildTeam({ id: "away", name: "Away", shortName: "AWY", rating: 65 });
    const state = new MatchState(
      team,
      away,
      MatchRules.league(),
      SubstitutionRules.brasileirao(),
      undefined,
    );

    expect(state.fieldedPositionOf(strikerId)).toBe(Position.CentreBack);
    expect(state.familiarityOf(strikerId)).toBeLessThan(1);

    // A player fielded in his natural position has no debuff.
    const naturalStriker = away.startingXi.find((p) => p.position === Position.Striker)!;
    expect(state.familiarityOf(naturalStriker.id)).toBe(1);
  });
});
