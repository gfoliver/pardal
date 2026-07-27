import {
  ATTRIBUTE_MAX,
  DefaultRoleProvider,
  familiarityOf,
  OnBallAction,
  Position,
  PositionGroup,
  positionGroup,
  type Player,
  type Role,
} from "@fut/domain";
import { zone } from "../pitch/Zone.js";
import { type TeamSide } from "../pitch/PitchGrid.js";
import { FoulSeverity } from "../referee/RefereeAdjudicator.js";
import { MatchEventType, type MatchEvent } from "../result/MatchEvent.js";
import { type MatchState } from "../state/MatchState.js";
import {
  contestingDefenders,
  defendersBetween,
  defendersInBallZone,
  defendersInZone,
  nearestMarker,
  passOptions,
  pressureOnCarrier,
} from "../state/queries.js";
import { type ActionResolver, type ResolutionContext } from "./ActionResolver.js";
import { advancedZone, giveBall, kickoff, retreatedZone, turnover } from "./effects.js";
import { clamp, duel, eff, norm } from "./probability.js";
import { resolveInPlayPenalty } from "./spotKick.js";

function attackingSide(state: MatchState): TeamSide {
  return state.sideOf(state.possessionTeamId);
}

function advancement(state: MatchState): number {
  return state.grid.advancement(attackingSide(state), state.ballZone);
}

function carrierOf(state: MatchState): Player {
  return state.getPlayer(state.ballCarrierId)!;
}

const roleProvider = new DefaultRoleProvider();

/** The role a player is performing (assigned role, or default for the position). */
function roleOf(state: MatchState, teamId: string, playerId: string): Role {
  return (
    state.tacticsFor(teamId).roleFor(playerId) ??
    roleProvider.defaultRoleFor(state.fieldedPositionOf(playerId))
  );
}

/**
 * The player to credit with an assist for a goal, or undefined. A goalkeeper's
 * distribution (long clearance / goal kick) does not count as an assist.
 */
function creditedAssist(
  state: MatchState,
  teamId: string,
  shooterId: string,
): string | undefined {
  const id = state.lastPassId;
  if (state.lastPassTeamId !== teamId || !id || id === shooterId) return undefined;
  const passer = state.getPlayer(id);
  if (!passer || passer.isGoalkeeper()) return undefined;
  return id;
}

/** Chance a beaten defender commits a foul, from their aggression. */
function foulChance(defender: Player): number {
  return clamp(0.14 + norm(defender.mental.aggression) * 0.18, 0, 0.45);
}

/** The physical severity of a committed foul (RNG event; the referee only judges). */
function decideSeverity(
  state: MatchState,
  rng: { next(): number },
  defender: Player,
): FoulSeverity {
  const adv = advancement(state);
  const roll = rng.next();
  const sendOff = 0.005 + norm(defender.mental.aggression) * 0.008;
  const book = 0.08 + adv * 0.14;
  if (roll < sendOff) return FoulSeverity.SendingOff;
  if (roll < sendOff + book) return FoulSeverity.Bookable;
  return FoulSeverity.Normal;
}

/** Restart with a goal kick / keeper possession for the defending team. */
function goalKickRestart(state: MatchState, defendingTeamId: string): void {
  state.possessionTeamId = defendingTeamId;
  const gk = state.teamOf(defendingTeamId).goalkeeper() ??
    state.onPitchPlayers(defendingTeamId)[0]!;
  const side = state.sideOf(defendingTeamId);
  giveBall(state, gk, zone(state.grid.ownThird(side), 1));
}

/** Give a corner to the attacking team (ball wide in the attacking third). */
function cornerRestart(state: MatchState, attackingTeamId: string): void {
  const side = state.sideOf(attackingTeamId);
  const wide = state.ballZone.lane <= state.grid.centerLane ? 0 : state.grid.lanes - 1;
  const players = state.onPitchPlayers(attackingTeamId);
  // A wide/attacking player takes the corner — never the goalkeeper.
  const taker =
    players.find((p) => positionGroup(state.fieldedPositionOf(p.id)) === PositionGroup.Attack) ??
    players.find((p) => !p.isGoalkeeper()) ??
    carrierOf(state);
  state.possessionTeamId = attackingTeamId;
  giveBall(state, taker, zone(state.grid.attackingThird(side), wide));
}

/** TEMP instrumentation for pass-accuracy root-cause analysis. */
export const PASS_DEBUG = {
  on: false,
  n: 0,
  interceptors: 0,
  pressure: 0,
  longBalls: 0,
  support: 0,
  successP: 0,
  reset(): void {
    this.n = this.interceptors = this.pressure = this.longBalls = this.support = this.successP = 0;
  },
};

class PassResolver implements ActionResolver {
  resolve(ctx: ResolutionContext): MatchEvent[] {
    const { state, rng, referee } = ctx;
    const teamId = state.possessionTeamId;
    const side = attackingSide(state);
    const carrier = carrierOf(state);
    const options = passOptions(state);
    if (options.length === 0) return [];

    const instr = state.tacticsFor(teamId).instructions;
    // How much the team seeks penetration vs safe retention. A patient (low
    // tempo) / low-directness side plays sideways/back to keep the ball; a
    // direct / high-tempo side prioritises forward balls.
    const penetrationDrive = 0.3 + instr.directness * 0.6 + instr.tempo * 0.4;
    const chosen = rng.weighted(
      options.map((p) => {
        const z = state.positions.get(p.id) ?? state.grid.center();
        const defendersHere = defendersInZone(state, z).length;
        const openness = 1 / (1 + defendersHere);
        const forwardness = state.grid.advancement(side, z);
        const inFinalThird = state.grid.isFinalThird(side, z);
        let focus = 1;
        // Focal point of the attack: any receiver in the central final-third
        // area (the striker, or a runner/AM infiltrating it), not only a Striker.
        const fieldedHere = state.fieldedPositionOf(p.id);
        if (
          state.grid.isPenaltyArea(side, z) ||
          fieldedHere === Position.Striker ||
          fieldedHere === Position.AttackingMidfielder
        ) {
          if (inFinalThird) focus *= 1.15;
        }
        // A through ball to a runner who has infiltrated (near-)open space.
        if (inFinalThird && defendersHere <= 1 && roleOf(state, teamId, p.id).movement.runFrequency >= 0.5) {
          focus *= 1.5;
        }
        // Proximity: strongly prefer connected (nearby) receivers so the ball
        // advances zone-by-zone instead of teleporting across the pitch. Gaps
        // between lines (no midfield) leave only risky long options.
        const dist = Math.abs(z.third - state.ballZone.third) + Math.abs(z.lane - state.ballZone.lane);
        const proximity = 1 / (1 + dist * dist * 0.35);
        return {
          item: { p, z },
          weight: openness * (0.35 + forwardness * penetrationDrive) * focus * proximity,
        };
      }),
    );
    const receiver = chosen.p;
    const targetZone = chosen.z;
    state.statsFor(teamId).passes += 1;

    // Offside: forward pass into the attacking third with a mistimed run.
    const attackingThird = state.grid.attackingThird(side);
    if (
      targetZone.third === attackingThird &&
      referee.isOffside(state, rng.chance(0.07))
    ) {
      state.statsFor(teamId).offsides += 1;
      const ev: MatchEvent = {
        minute: state.minute,
        type: MatchEventType.Offside,
        teamId,
        playerId: receiver.id,
        playerName: receiver.name,
        zone: targetZone,
      };
      turnover(state, rng);
      return [ev];
    }

    const passScore = eff(
      state,
      carrier,
      carrier.technical.passing * 0.5 +
        carrier.mental.vision * 0.3 +
        carrier.technical.technique * 0.2,
    );
    const interceptors = defendersInZone(state, targetZone);
    // A long ball is riskier: opponents in the transit corridor can cut it out,
    // and distance itself reduces accuracy.
    const passDist =
      Math.abs(targetZone.third - state.ballZone.third) +
      Math.abs(targetZone.lane - state.ballZone.lane);
    // Only genuine long balls carry extra risk (short/medium build-up is safe).
    const longBall = passDist >= 3;
    const transit = longBall ? defendersBetween(state, state.ballZone, targetZone).length : 0;
    const successP = clamp(
      0.94 -
        interceptors.length * 0.05 -
        pressureOnCarrier(state) * 0.04 +
        (norm(passScore) - 0.5) * 0.44 +
        // Patient (low-tempo) sides keep it safe and complete more; direct sides risk more.
        (0.5 - instr.tempo) * 0.12 -
        transit * 0.1 -
        (longBall ? (passDist - 2) * 0.04 : 0) +
        // A side unfamiliar with its own tactic is a little less crisp on the
        // ball — small and symmetric, so quick-simmed and watched matches agree
        // in kind (the same instructions feed both engines).
        (familiarityOf(instr) - 1) * 0.03,
      0.5,
      0.97,
    );
    if (PASS_DEBUG.on) {
      const support = state
        .onPitchPlayers(teamId)
        .filter((p) => {
          if (p.id === carrier.id) return false;
          const z = state.positions.get(p.id);
          return (
            z !== undefined &&
            Math.abs(z.third - state.ballZone.third) <= 1 &&
            Math.abs(z.lane - state.ballZone.lane) <= 1
          );
        }).length;
      PASS_DEBUG.n += 1;
      PASS_DEBUG.interceptors += interceptors.length;
      PASS_DEBUG.pressure += pressureOnCarrier(state);
      PASS_DEBUG.longBalls += longBall ? 1 : 0;
      PASS_DEBUG.support += support;
      PASS_DEBUG.successP += successP;
    }
    if (rng.chance(successP)) {
      state.statsFor(teamId).passesCompleted += 1;
      giveBall(state, receiver, targetZone);
      state.lastPassId = carrier.id;
      state.lastPassTeamId = teamId;
      state.lastPassType = "pass";
      return [];
    }
    // Intercepted.
    turnover(state, rng);
    return [];
  }
}

class DribbleResolver implements ActionResolver {
  resolve(ctx: ResolutionContext): MatchEvent[] {
    const { state, rng, referee } = ctx;
    const teamId = state.possessionTeamId;
    const defendingTeamId = state.opponentOf(teamId);
    const carrier = carrierOf(state);
    const marker = nearestMarker(state);

    const attackScore = eff(
      state,
      carrier,
      carrier.technical.dribbling * 0.4 +
        carrier.physical.agility * 0.3 +
        carrier.physical.pace * 0.3,
    );
    const defScore = marker
      ? eff(
          state,
          marker,
          marker.technical.tackling * 0.4 +
            marker.physical.strength * 0.3 +
            marker.mental.positioning * 0.3,
        ) +
        (contestingDefenders(state).length - 1) * 3
      : 4;

    if (rng.chance(duel(attackScore, defScore))) {
      giveBall(state, carrier, advancedZone(state, 1));
      return [];
    }

    if (marker && rng.chance(foulChance(marker))) {
      const severity = decideSeverity(state, rng, marker);
      const ruling = referee.judgeFoul(state, marker.id, severity);
      const events = [...ruling.events];
      if (ruling.isPenalty) {
        events.push(...resolveInPlayPenalty(state, rng, teamId));
      }
      // Non-penalty free kick: attacking team simply keeps possession.
      return events;
    }

    // Clean tackle.
    state.statsFor(defendingTeamId).tackles += 1;
    const ev: MatchEvent = {
      minute: state.minute,
      type: MatchEventType.Tackle,
      teamId: defendingTeamId,
      playerId: marker?.id,
      playerName: marker?.name,
      zone: state.ballZone,
    };
    turnover(state, rng);
    return [ev];
  }
}

class ShotResolver implements ActionResolver {
  resolve(ctx: ResolutionContext): MatchEvent[] {
    const { state, rng } = ctx;
    const teamId = state.possessionTeamId;
    const defendingTeamId = state.opponentOf(teamId);
    const shooter = carrierOf(state);
    const events: MatchEvent[] = [];

    state.statsFor(teamId).shots += 1;
    const shotSkill = eff(
      state,
      shooter,
      shooter.technical.finishing * 0.4 +
        shooter.mental.composure * 0.3 +
        shooter.technical.shotPower * 0.2 +
        shooter.technical.technique * 0.1,
    );
    const adv = advancement(state);
    const pressure = defendersInBallZone(state).length;
    // Shots from wide angles are lower quality; penalty scales with how far
    // off-centre the shot is taken.
    const offCenter = Math.abs(state.ballZone.lane - state.grid.centerLane);
    const onTargetP = clamp(
      0.4 + norm(shotSkill) * 0.4 - pressure * 0.06 - (1 - adv) * 0.2 - offCenter * 0.08,
      0.05,
      0.85,
    );

    if (!rng.chance(onTargetP)) {
      events.push({
        minute: state.minute,
        type: MatchEventType.Shot,
        teamId,
        playerId: shooter.id,
        playerName: shooter.name,
        zone: state.ballZone,
        params: { onTarget: false },
      });
      if (defendersInBallZone(state).length > 0 && rng.chance(0.3)) {
        state.statsFor(teamId).corners += 1;
        events.push({ minute: state.minute, type: MatchEventType.Corner, teamId });
        cornerRestart(state, teamId);
      } else {
        events.push({
          minute: state.minute,
          type: MatchEventType.GoalKick,
          teamId: defendingTeamId,
        });
        goalKickRestart(state, defendingTeamId);
      }
      return events;
    }

    state.statsFor(teamId).shotsOnTarget += 1;
    const keeper = state.teamOf(defendingTeamId).goalkeeper();
    const gkSkill = keeper
      ? keeper.goalkeeping.reflexes * 0.5 +
        keeper.goalkeeping.positioning * 0.3 +
        keeper.goalkeeping.handling * 0.2
      : 0.3 * ATTRIBUTE_MAX;
    const goalP = clamp(
      0.4 + (norm(shotSkill) - norm(gkSkill)) * 0.5 - pressure * 0.05 - offCenter * 0.07,
      0.03,
      0.85,
    );

    if (rng.chance(goalP)) {
      state.addGoal(teamId);
      const assistId = creditedAssist(state, teamId, shooter.id);
      const assist = assistId ? state.getPlayer(assistId) : undefined;
      const chanceType = !assistId
        ? "solo"
        : state.lastPassType === "cross"
          ? "cross"
          : "openPlay";
      events.push({
        minute: state.minute,
        type: MatchEventType.Goal,
        teamId,
        playerId: shooter.id,
        playerName: shooter.name,
        secondaryPlayerId: assistId,
        secondaryPlayerName: assist?.name,
        zone: state.ballZone,
        params: { chanceType },
      });
      kickoff(state, defendingTeamId);
      return events;
    }

    // Woodwork: a rare, dramatic near-miss.
    if (rng.chance(0.05)) {
      events.push({
        minute: state.minute,
        type: MatchEventType.Shot,
        teamId,
        playerId: shooter.id,
        playerName: shooter.name,
        zone: state.ballZone,
        params: { onTarget: true, woodwork: true },
      });
      goalKickRestart(state, defendingTeamId);
      return events;
    }

    events.push({
      minute: state.minute,
      type: MatchEventType.Shot,
      teamId,
      playerId: shooter.id,
      playerName: shooter.name,
      zone: state.ballZone,
      params: { onTarget: true, saved: true },
    });
    if (rng.chance(0.2)) {
      state.statsFor(teamId).corners += 1;
      events.push({ minute: state.minute, type: MatchEventType.Corner, teamId });
      cornerRestart(state, teamId);
    } else {
      goalKickRestart(state, defendingTeamId);
    }
    return events;
  }
}

class CrossResolver implements ActionResolver {
  resolve(ctx: ResolutionContext): MatchEvent[] {
    const { state, rng } = ctx;
    const teamId = state.possessionTeamId;
    const side = attackingSide(state);
    const crosser = carrierOf(state);
    const events: MatchEvent[] = [];

    const attackers = state
      .onPitchPlayers(teamId)
      .filter(
        (p) =>
          positionGroup(state.fieldedPositionOf(p.id)) === PositionGroup.Attack &&
          p.id !== crosser.id,
      );
    // A cross targets a central striker if there is one; else any attacker.
    const strikers = attackers.filter(
      (p) => state.fieldedPositionOf(p.id) === Position.Striker,
    );
    const forwards = strikers.length > 0 ? strikers : attackers;
    const target =
      forwards.length > 0
        ? forwards.reduce((b, p) =>
            p.technical.finishing + p.physical.strength >
            b.technical.finishing + b.physical.strength
              ? p
              : b,
          )
        : crosser;

    const box = zone(state.grid.attackingThird(side), state.grid.centerLane);
    const defenders = defendersInZone(state, box).length;
    const crossScore = eff(
      state,
      crosser,
      crosser.technical.crossing * 0.6 + crosser.technical.technique * 0.4,
    );
    // Crosses are tracked separately from the pass-accuracy metric.
    const successP = clamp(0.24 + norm(crossScore) * 0.4 - defenders * 0.07, 0.08, 0.62);

    if (rng.chance(successP)) {
      // The cross reaches its target → a first-time finish (header/cut-back).
      const defendingTeamId = state.opponentOf(teamId);
      const keeper = state.teamOf(defendingTeamId).goalkeeper();
      const gkSkill = keeper
        ? keeper.goalkeeping.reflexes * 0.5 +
          keeper.goalkeeping.positioning * 0.3 +
          keeper.goalkeeping.handling * 0.2
        : 0.3 * ATTRIBUTE_MAX;
      const finishSkill = eff(
        state,
        target,
        target.technical.finishing * 0.5 +
          target.physical.strength * 0.3 +
          target.mental.composure * 0.2,
      );
      state.statsFor(teamId).shots += 1;
      const onTargetP = clamp(0.38 + norm(finishSkill) * 0.32 - defenders * 0.06, 0.1, 0.82);
      if (rng.chance(onTargetP)) {
        state.statsFor(teamId).shotsOnTarget += 1;
        const goalP = clamp(
          0.3 + (norm(finishSkill) - norm(gkSkill)) * 0.45 - defenders * 0.05,
          0.03,
          0.8,
        );
        if (rng.chance(goalP)) {
          state.addGoal(teamId);
          events.push({
            minute: state.minute,
            type: MatchEventType.Goal,
            teamId,
            playerId: target.id,
            playerName: target.name,
            secondaryPlayerId: crosser.id,
            secondaryPlayerName: crosser.name,
            zone: box,
            params: { chanceType: "cross" },
          });
          kickoff(state, defendingTeamId);
          return events;
        }
        events.push({
          minute: state.minute,
          type: MatchEventType.Shot,
          teamId,
          playerId: target.id,
          playerName: target.name,
          zone: box,
          params: { onTarget: true, saved: true, cross: true },
        });
      } else {
        events.push({
          minute: state.minute,
          type: MatchEventType.Shot,
          teamId,
          playerId: target.id,
          playerName: target.name,
          zone: box,
          params: { onTarget: false, cross: true },
        });
      }
      // Rebound: corner or cleared.
      if (rng.chance(0.35)) {
        state.statsFor(teamId).corners += 1;
        events.push({ minute: state.minute, type: MatchEventType.Corner, teamId });
        cornerRestart(state, teamId);
      } else {
        goalKickRestart(state, defendingTeamId);
      }
      return events;
    }
    if (rng.chance(0.3)) {
      state.statsFor(teamId).corners += 1;
      events.push({ minute: state.minute, type: MatchEventType.Corner, teamId });
      cornerRestart(state, teamId);
    } else {
      turnover(state, rng);
    }
    return events;
  }
}

class HoldUpResolver implements ActionResolver {
  resolve(ctx: ResolutionContext): MatchEvent[] {
    const { state, rng, referee } = ctx;
    const teamId = state.possessionTeamId;
    const defendingTeamId = state.opponentOf(teamId);
    const carrier = carrierOf(state);
    const marker = nearestMarker(state);
    const pressure = pressureOnCarrier(state);

    if (marker && rng.chance(clamp(0.08 + pressure * 0.12, 0, 0.4))) {
      // Drew a foul (usually minor).
      const severity =
        rng.next() < 0.12 ? FoulSeverity.Bookable : FoulSeverity.Normal;
      const ruling = referee.judgeFoul(state, marker.id, severity);
      const events = [...ruling.events];
      if (ruling.isPenalty) events.push(...resolveInPlayPenalty(state, rng, teamId));
      return events;
    }

    const holdScore = eff(
      state,
      carrier,
      carrier.physical.strength * 0.4 +
        carrier.mental.composure * 0.3 +
        carrier.technical.technique * 0.3,
    );
    if (rng.chance(clamp(0.55 + norm(holdScore) * 0.4, 0, 0.9))) {
      return []; // Retained; no zone change.
    }

    state.statsFor(defendingTeamId).tackles += 1;
    const ev: MatchEvent = {
      minute: state.minute,
      type: MatchEventType.Tackle,
      teamId: defendingTeamId,
      playerId: marker?.id,
      playerName: marker?.name,
      zone: state.ballZone,
    };
    turnover(state, rng);
    return [ev];
  }
}

class ClearResolver implements ActionResolver {
  resolve(ctx: ResolutionContext): MatchEvent[] {
    const { state, rng } = ctx;
    const teamId = state.possessionTeamId;
    state.ballZone = zone(state.grid.centerThird, state.ballZone.lane);
    if (rng.chance(0.45)) {
      const mids = state
        .onPitchPlayers(teamId)
        .filter((p) => positionGroup(state.fieldedPositionOf(p.id)) === PositionGroup.Midfield);
      const receiver = mids.length > 0 ? rng.pick(mids) : carrierOf(state);
      giveBall(state, receiver, state.grid.center());
    } else {
      turnover(state, rng);
    }
    return [];
  }
}

class PassBackResolver implements ActionResolver {
  resolve(ctx: ResolutionContext): MatchEvent[] {
    const { state, rng } = ctx;
    const teamId = state.possessionTeamId;
    const side = attackingSide(state);
    const candidates = state
      .onPitchPlayers(teamId)
      .filter((p) => p.id !== state.ballCarrierId);
    // Deepest teammate (closest to own goal).
    const target = candidates.reduce((deepest, p) => {
      const zp = state.positions.get(p.id) ?? state.grid.center();
      const zd = state.positions.get(deepest.id) ?? state.grid.center();
      return state.grid.advancement(side, zp) < state.grid.advancement(side, zd)
        ? p
        : deepest;
    }, candidates[0]!);

    state.statsFor(teamId).passes += 1;
    if (rng.chance(0.96)) {
      state.statsFor(teamId).passesCompleted += 1;
      giveBall(state, target, retreatedZone(state));
    } else {
      turnover(state, rng);
    }
    return [];
  }
}

/** Registry of resolvers keyed by action (OCP: add without touching the loop). */
export function createResolverRegistry(): Record<OnBallAction, ActionResolver> {
  return {
    [OnBallAction.Pass]: new PassResolver(),
    [OnBallAction.Dribble]: new DribbleResolver(),
    [OnBallAction.Shoot]: new ShotResolver(),
    [OnBallAction.Cross]: new CrossResolver(),
    [OnBallAction.HoldUp]: new HoldUpResolver(),
    [OnBallAction.Clear]: new ClearResolver(),
    [OnBallAction.PassBack]: new PassBackResolver(),
  };
}
