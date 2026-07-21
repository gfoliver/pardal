import { type Player } from "@fut/domain";
import { type RandomSource } from "../random/RandomSource.js";
import { zone, type Zone } from "../pitch/Zone.js";
import { type MatchState } from "../state/MatchState.js";

/** Move the ball to a specific zone and set the carrier. */
export function giveBall(state: MatchState, carrier: Player, z: Zone): void {
  state.ballCarrierId = carrier.id;
  state.ballZone = z;
}

/** Advance the ball one third toward the possession team's attacking end. */
export function advancedZone(state: MatchState, steps = 1): Zone {
  const side = state.sideOf(state.possessionTeamId);
  const dir = state.grid.direction(side);
  const third = state.grid.clampThird(state.ballZone.third + dir * steps);
  return zone(third, state.ballZone.lane);
}

/** Zone one third toward the possession team's own goal. */
export function retreatedZone(state: MatchState): Zone {
  const side = state.sideOf(state.possessionTeamId);
  const dir = state.grid.direction(side);
  const third = state.grid.clampThird(state.ballZone.third - dir * 1);
  return zone(third, state.ballZone.lane);
}

/**
 * Turn the ball over to the opponent. The new carrier is a defender near the
 * ball if possible, otherwise any on-pitch player of the new team.
 */
export function turnover(state: MatchState, rng: RandomSource): void {
  const newTeamId = state.opponentOf(state.possessionTeamId);
  const players = state.onPitchPlayers(newTeamId);
  if (players.length === 0) return;
  // The winner is a defender near the ball if possible (Chebyshev ≤ 1), else the
  // closest available — and the ball MOVES to them (no teleport/detachment).
  const near = players.filter((p) => {
    const z = state.positions.get(p.id);
    return (
      z !== undefined &&
      Math.abs(z.third - state.ballZone.third) <= 1 &&
      Math.abs(z.lane - state.ballZone.lane) <= 1
    );
  });
  const carrier = near.length > 0 ? rng.pick(near) : rng.pick(players);
  state.possessionTeamId = newTeamId;
  state.ballCarrierId = carrier.id;
  state.ballZone = state.positions.get(carrier.id) ?? state.ballZone;
  state.lastPassId = undefined;
  state.lastPassTeamId = undefined;
  state.lastPassType = undefined;
}

/** Reset to a kickoff for the given team (after a goal). */
export function kickoff(state: MatchState, teamId: string): void {
  state.possessionTeamId = teamId;
  const players = state.onPitchPlayers(teamId);
  const midfielder = players[Math.floor(players.length / 2)] ?? players[0];
  if (midfielder) state.ballCarrierId = midfielder.id;
  state.ballZone = state.grid.center();
  state.lastPassId = undefined;
  state.lastPassTeamId = undefined;
  state.lastPassType = undefined;
}
