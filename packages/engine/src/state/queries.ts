import { type Player } from "@fut/domain";
import { sameZone, type Zone } from "../pitch/Zone.js";
import { type MatchState } from "./MatchState.js";

/** On-pitch opponents of the possession team occupying a specific zone. */
export function defendersInZone(state: MatchState, z: Zone): Player[] {
  const defendingTeamId = state.opponentOf(state.possessionTeamId);
  return state.onPitchPlayers(defendingTeamId).filter((p) => {
    const pos = state.positions.get(p.id);
    return pos !== undefined && sameZone(pos, z);
  });
}

/** Opponents in the ball's exact zone (immediate blockers). */
export function defendersInBallZone(state: MatchState): Player[] {
  return defendersInZone(state, state.ballZone);
}

/**
 * Opponents contesting the ball: those within one zone (Chebyshev ≤ 1) of the
 * ball. On a fine grid the exact zone is often empty, so the duel is decided by
 * this small neighbourhood — the players who can realistically challenge.
 */
export function contestingDefenders(state: MatchState): Player[] {
  const defendingTeamId = state.opponentOf(state.possessionTeamId);
  const ball = state.ballZone;
  return state.onPitchPlayers(defendingTeamId).filter((p) => {
    const pos = state.positions.get(p.id);
    return (
      pos !== undefined &&
      Math.abs(pos.third - ball.third) <= 1 &&
      Math.abs(pos.lane - ball.lane) <= 1
    );
  });
}

/**
 * Pressure on the ball carrier in [0, 1]: opponents in the exact zone weigh
 * most, those in the surrounding zones less, amplified by the pressing setting.
 */
export function pressureOnCarrier(state: MatchState): number {
  const inZone = defendersInBallZone(state).length;
  const contesting = contestingDefenders(state).length;
  const ring = Math.max(0, contesting - inZone);
  const defendingTeamId = state.opponentOf(state.possessionTeamId);
  const pressing = state.tacticsFor(defendingTeamId).instructions.pressing;
  const raw = inZone * 0.45 + ring * 0.18 + pressing * 0.15;
  return Math.min(1, raw);
}

/** The strongest tackler/marker among the contesting defenders, if any. */
export function nearestMarker(state: MatchState): Player | undefined {
  const markers = contestingDefenders(state);
  if (markers.length === 0) return undefined;
  return markers.reduce((best, p) =>
    p.technical.tackling + p.technical.marking >
    best.technical.tackling + best.technical.marking
      ? p
      : best,
  );
}

/**
 * Opponents sitting in the bands the ball travels through on a pass (the transit
 * corridor, exclusive of the end zones). These are the players who can cut out a
 * line-breaking or long vertical ball — i.e. the midfield the pass must beat.
 */
export function defendersBetween(state: MatchState, from: Zone, to: Zone): Player[] {
  const defendingTeamId = state.opponentOf(state.possessionTeamId);
  const loThird = Math.min(from.third, to.third);
  const hiThird = Math.max(from.third, to.third);
  const midLane = (from.lane + to.lane) / 2;
  return state.onPitchPlayers(defendingTeamId).filter((p) => {
    const z = state.positions.get(p.id);
    return (
      z !== undefined &&
      z.third > loThird &&
      z.third < hiThird &&
      Math.abs(z.lane - midLane) <= 1.5
    );
  });
}

/**
 * Numerical balance in the sector around the ball, from the attacking team's
 * view: (attackers − defenders) within one zone of the ball. Positive means the
 * attack has overloaded the area (support, space); negative means it is
 * outnumbered (a packed block, or too few attackers up front). This is what
 * makes every choice a trade-off — pack the defence and you're short up front.
 */
export function sectorBalance(state: MatchState): number {
  const attackTeamId = state.possessionTeamId;
  const defendTeamId = state.opponentOf(attackTeamId);
  const ball = state.ballZone;
  const near = (p: Player): boolean => {
    const z = state.positions.get(p.id);
    return (
      z !== undefined &&
      Math.abs(z.third - ball.third) <= 1 &&
      Math.abs(z.lane - ball.lane) <= 1
    );
  };
  const attackers = state.onPitchPlayers(attackTeamId).filter(near).length;
  const defenders = state.onPitchPlayers(defendTeamId).filter(near).length;
  return attackers - defenders;
}

/** Candidate pass receivers: on-pitch teammates other than the carrier. */
export function passOptions(state: MatchState): Player[] {
  const teamId = state.possessionTeamId;
  return state
    .onPitchPlayers(teamId)
    .filter((p) => p.id !== state.ballCarrierId);
}
