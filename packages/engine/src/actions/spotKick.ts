import { ATTRIBUTE_MAX, Goalkeeper, type Player } from "@fut/domain";
import { type RandomSource } from "../random/RandomSource.js";
import { MatchEventType, type MatchEvent } from "../result/MatchEvent.js";
import { type MatchState } from "../state/MatchState.js";
import { clamp, norm } from "./probability.js";
import { kickoff } from "./effects.js";

/** Probability a spot kick is scored, given taker and keeper. */
export function spotKickGoalProbability(
  taker: Player,
  keeper: Goalkeeper | undefined,
): number {
  const takerSkill =
    taker.technical.finishing * 0.5 +
    taker.mental.composure * 0.3 +
    taker.technical.shotPower * 0.2;
  const keeperSkill = keeper
    ? keeper.goalkeeping.reflexes * 0.6 + keeper.goalkeeping.positioning * 0.4
    : 0.3 * ATTRIBUTE_MAX;
  // Penalties heavily favour the taker.
  return clamp(0.6 + (norm(takerSkill) - norm(keeperSkill)) * 0.4, 0.4, 0.92);
}

/** Best available penalty taker on the pitch for a team. */
export function bestPenaltyTaker(state: MatchState, teamId: string): Player {
  const players = state.onPitchPlayers(teamId);
  return players.reduce((best, p) =>
    p.technical.finishing + p.mental.composure >
    best.technical.finishing + best.mental.composure
      ? p
      : best,
  );
}

/**
 * Resolve an in-play penalty kick awarded to `attackingTeamId`. Emits the
 * outcome and restarts play (kickoff to the conceding team on a goal, otherwise
 * the ball goes to the defending side).
 */
export function resolveInPlayPenalty(
  state: MatchState,
  rng: RandomSource,
  attackingTeamId: string,
): MatchEvent[] {
  const defendingTeamId = state.opponentOf(attackingTeamId);
  const taker = bestPenaltyTaker(state, attackingTeamId);
  const keeper = state.teamOf(defendingTeamId).goalkeeper();
  const events: MatchEvent[] = [];

  state.statsFor(attackingTeamId).shots += 1;
  state.statsFor(attackingTeamId).shotsOnTarget += 1;

  if (rng.chance(spotKickGoalProbability(taker, keeper))) {
    state.addGoal(attackingTeamId);
    events.push({
      minute: state.minute,
      type: MatchEventType.Goal,
      teamId: attackingTeamId,
      playerId: taker.id,
      playerName: taker.name,
      params: { penalty: true, chanceType: "penalty" },
    });
    kickoff(state, defendingTeamId);
  } else {
    events.push({
      minute: state.minute,
      type: MatchEventType.Shot,
      teamId: attackingTeamId,
      playerId: taker.id,
      playerName: taker.name,
      params: { penalty: true, onTarget: true, saved: true },
    });
    // Keeper claims it.
    state.possessionTeamId = defendingTeamId;
    const gk = keeper ?? state.onPitchPlayers(defendingTeamId)[0]!;
    state.ballCarrierId = gk.id;
    state.ballZone = state.grid.center();
  }
  return events;
}
