import { type Player } from "@fut/domain";
import { type RandomSource } from "../random/RandomSource.js";
import { MatchEventType, type MatchEvent } from "../result/MatchEvent.js";
import { type MatchState } from "../state/MatchState.js";
import { spotKickGoalProbability } from "../actions/spotKick.js";

export interface ShootoutResult {
  readonly homeGoals: number;
  readonly awayGoals: number;
  readonly winnerTeamId: string;
  readonly events: MatchEvent[];
}

/**
 * Resolves a penalty shootout deterministically (seeded). Standard best-of-five
 * with a clinch short-circuit, then sudden death. Takers are the best finishers
 * on the pitch; each kick uses the opposing keeper.
 */
export class PenaltyShootoutResolver {
  resolve(state: MatchState, rng: RandomSource): ShootoutResult {
    const homeId = state.homeTeam.id;
    const awayId = state.awayTeam.id;
    const homeTakers = this.takers(state, homeId);
    const awayTakers = this.takers(state, awayId);

    const events: MatchEvent[] = [];
    let home = 0;
    let away = 0;
    let takenHome = 0;
    let takenAway = 0;
    let hIdx = 0;
    let aIdx = 0;

    const kick = (teamId: string, taker: Player, keeperTeamId: string): boolean => {
      const keeper = state.teamOf(keeperTeamId).goalkeeper();
      const scored = rng.chance(spotKickGoalProbability(taker, keeper));
      events.push({
        minute: state.minute,
        type: MatchEventType.ShootoutKick,
        teamId,
        playerId: taker.id,
        playerName: taker.name,
        params: { scored },
      });
      return scored;
    };

    const decided = (): boolean => {
      const remH = Math.max(0, 5 - takenHome);
      const remA = Math.max(0, 5 - takenAway);
      return home > away + remA || away > home + remH;
    };

    // Best-of-five, alternating, stopping as soon as the result is settled.
    for (let k = 0; k < 10 && !decided(); k++) {
      if (k % 2 === 0) {
        if (kick(homeId, homeTakers[hIdx++ % homeTakers.length]!, awayId)) home++;
        takenHome++;
      } else {
        if (kick(awayId, awayTakers[aIdx++ % awayTakers.length]!, homeId)) away++;
        takenAway++;
      }
    }

    // Sudden death: one pair at a time until they differ.
    while (home === away) {
      const h = kick(homeId, homeTakers[hIdx++ % homeTakers.length]!, awayId);
      const a = kick(awayId, awayTakers[aIdx++ % awayTakers.length]!, homeId);
      if (h) home++;
      if (a) away++;
    }

    return {
      homeGoals: home,
      awayGoals: away,
      winnerTeamId: home > away ? homeId : awayId,
      events,
    };
  }

  private takers(state: MatchState, teamId: string): Player[] {
    return [...state.onPitchPlayers(teamId)].sort(
      (a, b) =>
        b.technical.finishing +
        b.mental.composure -
        (a.technical.finishing + a.mental.composure),
    );
  }
}
