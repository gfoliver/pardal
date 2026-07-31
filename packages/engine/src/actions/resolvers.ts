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
  challengingDefender,
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

/**
 * Chance a beaten defender commits a foul, from their aggression.
 *
 * CALIBRATED TOWARD THE SPATIAL ENGINE. In a multiplayer league the two engines
 * split the fixture list — CPU-vs-CPU here, anything with a human in spatial — while
 * sharing one table, one scorers list and one SUSPENSION ledger. So the discipline
 * rates have to agree, or a manager's suspensions depend on who was on their
 * schedule. Measured before: 5.23 fouls per team per match here against 8.21 in
 * spatial, a 12.9-sigma gap.
 *
 * Spatial gets there differently — ~170 contests a match at a ~3.5% foul rate each,
 * where this engine has ~34 at a much higher rate — so the shapes cannot be
 * reconciled, only the outcome. Raising the per-contest rate is the lever available;
 * note it also converts "clean tackle, turnover" into "foul, keep possession", which
 * is why shots are watched after every change to this number.
 */
function foulChance(defender: Player): number {
  return clamp(0.206 + norm(defender.mental.aggression) * 0.265, 0, 0.62);
}

/**
 * The physical severity of a committed foul (RNG event; the referee only judges).
 *
 * Uses the SAME law as the spatial engine (`MatchEngine.onFoul`): aggression-weighted
 * for both the booking and the sending-off. It used to weight bookings by pitch
 * POSITION instead (`0.08 + advancement * 0.14`), which is a different theory of
 * refereeing and produced 0.153 yellows per foul against spatial's 0.242. Sharing a
 * suspension ledger between the two engines means sharing the law that fills it —
 * not just its average, but WHICH players collect cards, and that should be the
 * aggressive ones in both engines rather than whoever defends deep in one of them.
 */
function decideSeverity(rng: { next(): number }, defender: Player): FoulSeverity {
  const aggr = norm(defender.mental.aggression);
  const roll = rng.next();
  const sendOff = 0.003 + aggr * 0.005;
  const book = 0.115 + aggr * 0.145;
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
    const passScore = eff(
      state,
      carrier,
      carrier.technical.passing * 0.5 +
        carrier.mental.vision * 0.3 +
        carrier.technical.technique * 0.2,
    );
    /**
     * How ambitious this side's passing is: instructions, PLUS the carrier's own
     * ability to execute a penetrative ball.
     *
     * Target selection used to be entirely quality-blind — a rating-62 side picked
     * exactly as forward a pass as a rating-80 one and merely completed it slightly
     * less often. That was the last link in the chain that kept a better team from
     * out-shooting a worse one: with more possession it simply passed sideways more,
     * spending 9.2% of its action-steps shooting against the weaker side's 9.7%,
     * because the ball never got far enough up the pitch for `baseWeights` to start
     * choosing shots (shot weight scales with advancement SQUARED).
     *
     * A better passer sees and hits the forward ball — so quality belongs in the
     * choice, not only in the execution. This is what turns possession into
     * territory, and territory is what turns into shots.
     */
    const penetrationDrive =
      (0.3 + instr.directness * 0.6 + instr.tempo * 0.4) * (0.55 + norm(passScore) * 0.95);
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

    // Offside: forward pass into the attacking third with a mistimed run.
    //
    // A flat rate, where spatial does a real line check — so this can only be
    // matched on frequency, never on mechanism (no run timing, no anticipation; a
    // player's attributes never enter). 0.07 gave 1.60 offsides per team per match
    // against spatial's 3.60, a 10-sigma gap, and a shared league counts them in one
    // column.
    const attackingThird = state.grid.attackingThird(side);
    if (
      targetZone.third === attackingThird &&
      referee.isOffside(state, rng.chance(0.157))
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

    // Counted only once the flag has stayed down. An offside is a whistle, not an
    // attempted pass, and counting it as one coupled two unrelated numbers: this
    // engine records ~68 "passes" a match (they are action-steps) against spatial's
    // ~299 real ones, so matching the two engines' ABSOLUTE offside counts made each
    // offside 4.4x heavier here, and pass completion became a tax on whoever played
    // into the final third most. It inverted the familiarity invariant — the drilled
    // side, which progresses more, completed FEWER passes than the rusty one.
    state.statsFor(teamId).passes += 1;

    const interceptors = defendersInZone(state, targetZone);
    /**
     * How good those interceptors are, as a multiplier around 1 (1 = league
     * average-ish, >1 = a better defence).
     *
     * Until this existed, a pass was made harder by the NUMBER of opponents in the
     * target zone and never by their quality — so a world-class defence and a poor
     * one were interchangeable everywhere except a dribble duel and the keeper. That
     * is the structural reason a stronger side gained far fewer points here than in
     * the spatial engine: only its attack counted. Now the defending side's marking
     * and anticipation scale the interception penalty, which is what lets a good
     * defence actually be good.
     *
     * As a RATIO against the passer, so it is exactly 1.0 at equal quality. The first
     * version divided by a fixed 0.65 reference, which made the penalty 32% heavier
     * than the original flat value at rating 80 — so the change got absorbed into
     * recalibration instead of becoming a response to the rating gap, which was the
     * entire point of adding it.
     */
    const interceptQuality =
      interceptors.length === 0
        ? 1
        : (0.6 +
            interceptors.reduce(
              (sum, d) =>
                sum + norm(d.technical.marking * 0.5 + d.mental.anticipation * 0.3 + d.mental.positioning * 0.2),
              0,
            ) /
              interceptors.length) /
          (0.6 + norm(passScore));
    // A long ball is riskier: opponents in the transit corridor can cut it out,
    // and distance itself reduces accuracy.
    const passDist =
      Math.abs(targetZone.third - state.ballZone.third) +
      Math.abs(targetZone.lane - state.ballZone.lane);
    // Only genuine long balls carry extra risk (short/medium build-up is safe).
    const longBall = passDist >= 3;
    const transit = longBall ? defendersBetween(state, state.ballZone, targetZone).length : 0;
    /**
     * How hard this pass is, as a FAILURE rate — then scaled by the passer.
     *
     * This was an additive bonus on a base of 0.94, clamped at 0.97, and the clamp
     * silently ate the entire thing: a rating-80 midfielder computed 1.098 and a
     * rating-62 one 1.018, so BOTH sat at the ceiling and completed passes at
     * identical rates. Even a rating-45 side reached 0.942. Passing quality was
     * invisible across the whole realistic range.
     *
     * That was the structural reason a better team did not out-shoot a worse one
     * here the way it does in the spatial engine (measured: 18 rating points bought
     * 1.10x the shots against spatial's 3.18x). Shot selection was never the
     * problem — `baseWeights` already scales shooting with `advancement` — the
     * problem was that a better side never REACHED the final third more often,
     * because it lost the ball just as readily on the way.
     *
     * Multiplying the failure rate cannot saturate: a better passer misplaces a
     * fixed FRACTION fewer, so the advantage survives at every difficulty and
     * compounds along a possession chain, which is exactly where territory comes
     * from.
     */
    const difficulty =
      0.082 +
      interceptors.length * 0.032 * interceptQuality +
      pressureOnCarrier(state) * 0.04 +
      transit * 0.1 +
      (longBall ? (passDist - 2) * 0.04 : 0) -
      // Patient (low-tempo) sides keep it safe and complete more; direct sides risk more.
      (0.5 - instr.tempo) * 0.12 -
      // A side unfamiliar with its own tactic is a little less crisp on the
      // ball — small and symmetric, so quick-simmed and watched matches agree
      // in kind (the same instructions feed both engines).
      (familiarityOf(instr) - 1) * 0.03;
    /**
     * The passer's error multiplier: below 1 for a better passer, above for a worse
     * one, applied to the difficulty above.
     *
     * The slope was tried at 2.4 (double this) to widen the response to a rating gap,
     * pinning the parity point so no recalibration would be needed. It does not work
     * in this formulation: with a squad's passing scores spread from a keeper's ~0.5
     * to a midfielder's ~0.86, doubling the slope pushes the good passers into the
     * lower clamp — which is exactly the saturation bug this model was written to
     * escape — and pass completion fell from 82% to 71%, against spatial's 84%.
     * Re-pinning to hold completion required a coefficient that made the multiplier
     * negative for a good passer. The bought improvement was +0.02 on the rating
     * climb; the cost was the engine's passing realism. Left at 1.19.
     */
    const passQuality = clamp(1.6 - norm(passScore) * 1.19, 0.3, 1.6);
    const successP = clamp(1 - Math.max(0.01, difficulty) * passQuality, 0.35, 0.995);
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
    const marker = challengingDefender(state, rng);

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
      const severity = decideSeverity(rng, marker);
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
    const closing = defendersInBallZone(state);
    const pressure = closing.length;
    /**
     * WHO is closing you down, not just how many — as a ratio against the shooter,
     * so at equal quality it is exactly 1.0 and none of the calibrated averages move.
     *
     * The pressure term counted bodies and ignored their ability, so a world-class
     * centre-back put a striker off his shot no better than a poor one. Being one of
     * the last quality-blind channels left, it was also one of the last places a
     * better team could gain ground on a worse one.
     */
    const closingQuality =
      pressure === 0
        ? 1
        : (0.6 +
            closing.reduce(
              (sum, d) =>
                sum + norm(d.technical.marking * 0.5 + d.mental.positioning * 0.3 + d.physical.strength * 0.2),
              0,
            ) /
              pressure) /
          (0.6 + norm(shotSkill));
    // Shots from wide angles are lower quality; penalty scales with how far
    // off-centre the shot is taken.
    const offCenter = Math.abs(state.ballZone.lane - state.grid.centerLane);
    // The BASE moves, the skill coefficient does not — and that distinction is the
    // whole point. Zone put 49% of shots on target against spatial's 35%; lowering
    // the base shifts the level while leaving `norm(shotSkill) * 0.4` intact, so a
    // better finisher keeps exactly the same edge over a worse one. Scaling the
    // coefficient instead would have closed the same gap by flattening the response
    // to player quality, which is the one thing calibration must not do.
    const onTargetP = clamp(
      0.21 + norm(shotSkill) * 0.4 - pressure * 0.06 * closingQuality - (1 - adv) * 0.2 - offCenter * 0.08,
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
      ? // Through `eff()`, like every outfielder. It was raw, so the keeper alone
        // never tired — which put a systematic negative drift into
        // `shotSkill − gkSkill` as a match wore on, invisible while the
        // coefficient was small and immediately visible when it was widened
        // (goals fell from 1.22 to 0.90 a team). A keeper who does not fatigue is
        // also just wrong.
        eff(
          state,
          keeper,
          keeper.goalkeeping.reflexes * 0.5 +
            keeper.goalkeeping.positioning * 0.3 +
            keeper.goalkeeping.handling * 0.2,
        )
      : 0.3 * ATTRIBUTE_MAX;
    /**
     * The BASE sets the absolute conversion level; the DIFFERENTIAL is where a
     * better team's advantage lives, and the two are independent here in a way worth
     * exploiting.
     *
     * The differential was widened from 0.5 to 0.95 deliberately, and it is the one
     * change that could not have been made by measuring a mirrored fixture: with
     * equal teams `shotSkill − gkSkill` is ~0, so this coefficient has NO effect on
     * any of the calibrated averages. It only bites as the rating gap opens.
     *
     * It is here because this engine cannot give a better side more shots. Its
     * action budget is a fixed 270 steps a match split near-evenly whatever the
     * quality gap — 18 rating points buy 1.10x the shots here against the spatial
     * engine's 3.18x — and four separate structural improvements (a squared duel,
     * quality-weighted interception, a non-saturating pass model, quality-driven
     * pass selection) each failed to move that. So volume is not available, and the
     * only honest way left to reproduce spatial's OUTCOME — points gained per rating
     * point — is to make each shot count more for the better side.
     *
     * That is a deliberate divergence in mechanism to converge on behaviour, and it
     * is acceptable precisely because this engine only ever plays CPU against CPU: a
     * human's own fixtures always run in spatial, so nobody experiences these shots.
     */
    const goalP = clamp(
      0.435 + (norm(shotSkill) - norm(gkSkill)) * 0.95 - pressure * 0.05 - offCenter * 0.07,
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
    const inBox = defendersInZone(state, box);
    const defenders = inBox.length;
    const crossScore = eff(
      state,
      crosser,
      crosser.technical.crossing * 0.6 + crosser.technical.technique * 0.4,
    );
    // Who is defending the box, not just how many — a ratio, so 1.0 at equal quality.
    const boxQuality =
      defenders === 0
        ? 1
        : (0.6 +
            inBox.reduce(
              (sum, d) => sum + norm(d.technical.marking * 0.6 + d.physical.strength * 0.4),
              0,
            ) /
              defenders) /
          (0.6 + norm(crossScore));
    // Crosses are tracked separately from the pass-accuracy metric.
    const successP = clamp(0.24 + norm(crossScore) * 0.4 - defenders * 0.07 * boxQuality, 0.08, 0.62);

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
          // Differential widened alongside the open-play shot path, and for the same
          // reason — see `goalP` in ShotResolver. Neutral at equal quality.
          0.3 + (norm(finishSkill) - norm(gkSkill)) * 0.85 - defenders * 0.05,
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
    const marker = challengingDefender(state, rng);
    const pressure = pressureOnCarrier(state);

    if (marker && rng.chance(clamp(0.126 + pressure * 0.188, 0, 0.62))) {
      // Drew a foul. Severity now goes through the same law as every other foul
      // (see `decideSeverity`) instead of a flat 12% booking with no red possible —
      // a foul is a foul, and the suspension ledger a league shares should not
      // depend on which resolver happened to award it.
      const severity = decideSeverity(rng, marker);
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
    // Holding the ball up is a contest, so the man competing for it counts. A ratio
    // again: 1.0 at equal quality, and it only separates the sides as the gap opens.
    const holdContest = marker
      ? (0.6 + norm(holdScore)) /
        (0.6 + norm(marker.technical.tackling * 0.5 + marker.physical.strength * 0.5))
      : 1.15;
    if (rng.chance(clamp(0.55 + norm(holdScore) * 0.4 * holdContest, 0, 0.9))) {
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
