import { CardColor, MatchEventType, type MatchEvent } from "../result/MatchEvent.js";
import { type MatchState } from "../state/MatchState.js";

/** Physical severity of a foul (decided by the contest, not the referee). */
export enum FoulSeverity {
  /** A normal foul: free kick, no card. */
  Normal = "normal",
  /** A bookable offence: yellow card (second yellow → red). */
  Bookable = "bookable",
  /** A straight red offence (violent conduct / denying a clear goal chance). */
  SendingOff = "sendingOff",
}

export interface FoulRuling {
  readonly isPenalty: boolean;
  readonly card?: CardColor;
  readonly events: MatchEvent[];
}

/**
 * The referee's officiating logic — a PURE, infallible function of the rules and
 * state. It has no attributes and consumes no randomness: given a foul (a
 * physical event produced by the contest, with its severity), it ALWAYS awards
 * the correct restart and card. This keeps the referee outside the RNG stream
 * and preserves determinism.
 */
export class RefereeAdjudicator {
  /**
   * Judge a foul. Mutates the offender's booking state and team stats, and
   * returns the restart (penalty vs free kick) plus any card, as events.
   */
  judgeFoul(
    state: MatchState,
    offenderId: string,
    severity: FoulSeverity,
  ): FoulRuling {
    const offenderTeamId = state.teamIdForPlayer(offenderId)!;
    const offender = state.getPlayer(offenderId)!;
    const events: MatchEvent[] = [];

    state.statsFor(offenderTeamId).fouls += 1;
    const isPenalty = this.isInDefendingPenaltyArea(state);

    events.push({
      minute: state.minute,
      type: MatchEventType.Foul,
      teamId: offenderTeamId,
      playerId: offenderId,
      playerName: offender.name,
      zone: state.ballZone,
    });

    let card: CardColor | undefined;
    if (severity === FoulSeverity.SendingOff) {
      card = CardColor.Red;
      this.issueRed(state, offenderId, offenderTeamId, events, "violentConduct");
    } else if (severity === FoulSeverity.Bookable) {
      const ps = state.playerState(offenderId);
      ps.yellowCards += 1;
      state.statsFor(offenderTeamId).yellowCards += 1;
      if (ps.yellowCards >= 2) {
        card = CardColor.Red;
        this.issueRed(state, offenderId, offenderTeamId, events, "secondYellow");
      } else {
        card = CardColor.Yellow;
        events.push({
          minute: state.minute,
          type: MatchEventType.Card,
          teamId: offenderTeamId,
          playerId: offenderId,
          playerName: offender.name,
          params: { color: CardColor.Yellow },
        });
      }
    }

    if (isPenalty) {
      events.push({
        minute: state.minute,
        type: MatchEventType.Penalty,
        teamId: state.opponentOf(offenderTeamId),
        zone: state.ballZone,
      });
    } else {
      events.push({
        minute: state.minute,
        type: MatchEventType.FreeKick,
        teamId: state.opponentOf(offenderTeamId),
        zone: state.ballZone,
      });
    }

    return { isPenalty, card, events };
  }

  /** Offside decision for a forward pass — infallible line comparison. */
  isOffside(state: MatchState, receiverBeyondLastDefender: boolean): boolean {
    return receiverBeyondLastDefender;
  }

  private issueRed(
    state: MatchState,
    offenderId: string,
    offenderTeamId: string,
    events: MatchEvent[],
    reason: string,
  ): void {
    state.statsFor(offenderTeamId).redCards += 1;
    const player = state.getPlayer(offenderId)!;
    events.push({
      minute: state.minute,
      type: MatchEventType.Card,
      teamId: offenderTeamId,
      playerId: offenderId,
      playerName: player.name,
      params: { color: CardColor.Red, reason },
    });
    state.sendOff(offenderId);
  }

  /** True if the ball is in the defending team's penalty area. */
  private isInDefendingPenaltyArea(state: MatchState): boolean {
    const attackingSide = state.sideOf(state.possessionTeamId);
    return state.grid.isPenaltyArea(attackingSide, state.ballZone);
  }
}
