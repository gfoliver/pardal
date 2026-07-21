import {
  Mentality,
  Position,
  PositionGroup,
  positionGroup,
  type Player,
} from "@fut/domain";
import { type RandomSource } from "../random/RandomSource.js";
import { SituationAssessor, SituationKind } from "../situation/SituationAssessor.js";
import { type MatchState } from "../state/MatchState.js";
import { clamp, norm } from "../actions/probability.js";
import { type CoachController, type CoachDecision } from "./CoachController.js";

const MENTALITY_ORDER: readonly Mentality[] = [
  Mentality.VeryDefensive,
  Mentality.Defensive,
  Mentality.Balanced,
  Mentality.Attacking,
  Mentality.VeryAttacking,
];

function shift(current: Mentality, step: number): Mentality {
  const idx = MENTALITY_ORDER.indexOf(current);
  const next = clamp(idx + step, 0, MENTALITY_ORDER.length - 1);
  return MENTALITY_ORDER[next]!;
}

/**
 * AI coach. Decisions are driven purely by tactical attributes + the situational
 * objective (chase vs protect): a versatile, reactive coach adjusts early and
 * often; a rigid, passive one barely intervenes.
 */
export class AiCoachController implements CoachController {
  constructor(private readonly assessor = new SituationAssessor()) {}

  decide(state: MatchState, teamId: string, rng: RandomSource): CoachDecision[] {
    const attrs = state.teamOf(teamId).coach.attributes;
    const react = norm(attrs.reactiveness);
    const adapt = norm(attrs.adaptability);
    const obj = this.assessor.assess(state, teamId);

    // 1) Tactic change — only if strong objective and none already pending.
    if (
      !state.pendingTacticChange.has(teamId) &&
      obj.intensity > 0.5 &&
      state.minute >= 25 &&
      obj.kind !== SituationKind.Neutral
    ) {
      const current = state.tacticsFor(teamId).instructions.mentality;
      const desired =
        obj.kind === SituationKind.Chase ? shift(current, 1) : shift(current, -1);
      if (desired !== current) {
        const p = clamp(0.03 + 0.06 * adapt * react * obj.intensity, 0, 0.25);
        if (rng.chance(p)) {
          const tactics = state
            .tacticsFor(teamId)
            .withInstructions({ mentality: desired });
          return [{ kind: "tacticChange", tactics }];
        }
      }
    }

    // 2) Substitution — fatigue first, then a chasing attacking change.
    if (state.minute >= 46) {
      const fatigueSub = this.fatigueSubstitution(state, teamId, react, rng);
      if (fatigueSub) return [fatigueSub];

      if (obj.kind === SituationKind.Chase && obj.intensity > 0.7 && state.minute >= 65) {
        const attackSub = this.attackingSubstitution(state, teamId, react, rng);
        if (attackSub) return [attackSub];
      }
    }

    return [];
  }

  private fatigueSubstitution(
    state: MatchState,
    teamId: string,
    react: number,
    rng: RandomSource,
  ): CoachDecision | undefined {
    const outfield = state
      .onPitchPlayers(teamId)
      .filter((p) => positionGroup(state.fieldedPositionOf(p.id)) !== PositionGroup.Goalkeeper);
    if (outfield.length === 0) return undefined;
    const worst = outfield.reduce((a, b) =>
      state.playerState(a.id).fatigue >= state.playerState(b.id).fatigue ? a : b,
    );
    if (state.playerState(worst.id).fatigue < 0.22) return undefined;
    const replacement = this.benchReplacement(state, teamId, worst.position);
    if (!replacement) return undefined;
    if (!rng.chance(clamp(0.05 + 0.06 * react, 0, 0.25))) return undefined;
    return { kind: "substitution", outPlayerId: worst.id, inPlayerId: replacement.id };
  }

  private attackingSubstitution(
    state: MatchState,
    teamId: string,
    react: number,
    rng: RandomSource,
  ): CoachDecision | undefined {
    const attacker = this.benchByGroup(state, teamId, PositionGroup.Attack);
    if (!attacker) return undefined;
    const onDefenders = state
      .onPitchPlayers(teamId)
      .filter((p) => positionGroup(state.fieldedPositionOf(p.id)) === PositionGroup.Defence);
    if (onDefenders.length <= 3) return undefined; // keep a back line
    const out = onDefenders.reduce((a, b) => (a.overall() <= b.overall() ? a : b));
    if (!rng.chance(clamp(0.04 + 0.05 * react, 0, 0.2))) return undefined;
    return { kind: "substitution", outPlayerId: out.id, inPlayerId: attacker.id };
  }

  /** A fresh bench player, preferring the same position. */
  private benchReplacement(
    state: MatchState,
    teamId: string,
    position: Position,
  ): Player | undefined {
    const bench = state
      .teamOf(teamId)
      .bench.filter(
        (p) =>
          !state.playerState(p.id).onPitch &&
          !state.playerState(p.id).sentOff &&
          !state.playerState(p.id).injured,
      );
    if (bench.length === 0) return undefined;
    const samePosition = bench.filter((p) => p.position === position);
    const pool = samePosition.length > 0 ? samePosition : bench;
    return pool.reduce((a, b) => (a.overall() >= b.overall() ? a : b));
  }

  /** The best fresh bench player belonging to a position group. */
  private benchByGroup(
    state: MatchState,
    teamId: string,
    group: PositionGroup,
  ): Player | undefined {
    const bench = state
      .teamOf(teamId)
      .bench.filter(
        (p) =>
          !state.playerState(p.id).onPitch &&
          !state.playerState(p.id).sentOff &&
          !state.playerState(p.id).injured &&
          positionGroup(p.position) === group,
      );
    if (bench.length === 0) return undefined;
    return bench.reduce((a, b) => (a.overall() >= b.overall() ? a : b));
  }
}
