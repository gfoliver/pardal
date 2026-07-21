import {
  DefaultRoleProvider,
  OnBallAction,
  type Player,
  type Role,
} from "@fut/domain";
import { type TeamSide } from "../pitch/PitchGrid.js";
import { type RandomSource } from "../random/RandomSource.js";
import {
  SituationKind,
  type SituationObjective,
} from "../situation/SituationAssessor.js";
import { type MatchState } from "../state/MatchState.js";
import { pressureOnCarrier } from "../state/queries.js";
import { norm } from "../actions/probability.js";

type Weights = Record<OnBallAction, number>;

/**
 * Chooses the ball carrier's on-ball action via attribute/role/tactics/situation
 * weighted sampling. Marking pressure directly shifts the weights (e.g. under
 * heavy pressure a low-composure carrier is pushed away from dribbling and
 * toward safe passes/clearances).
 */
export class DecisionEngine {
  private readonly roleFallback = new DefaultRoleProvider();

  choose(
    state: MatchState,
    carrier: Player,
    objective: SituationObjective,
    rng: RandomSource,
  ): OnBallAction {
    const side = state.sideOf(state.possessionTeamId);
    const advancement = state.grid.advancement(side, state.ballZone);
    const wide = state.ballZone.lane !== state.grid.centerLane;
    const role =
      state.tacticsFor(state.possessionTeamId).roleFor(carrier.id) ??
      this.roleFallback.defaultRoleFor(state.fieldedPositionOf(carrier.id));

    const weights = this.baseWeights(advancement, wide);
    this.applyRole(weights, role);
    this.applyTacticalStyle(weights, state.tacticsFor(state.possessionTeamId).instructions);
    this.applyObjective(weights, objective);
    this.applyPressure(weights, pressureOnCarrier(state), carrier);
    this.applyInfiltration(weights, state, role, advancement, side);

    return rng.weighted(
      (Object.keys(weights) as OnBallAction[]).map((action) => ({
        item: action,
        weight: Math.max(0, weights[action]),
      })),
    );
  }

  /**
   * Infiltration into central/half-space areas turns wide players and runners
   * into shooting threats (not crossers) — this is what makes wide, single-
   * striker shapes create central chances instead of funnelling to one target.
   */
  private applyInfiltration(
    weights: Weights,
    state: MatchState,
    role: Role,
    advancement: number,
    side: TeamSide,
  ): void {
    const offCenter = Math.abs(state.ballZone.lane - state.grid.centerLane);
    // A wide forward who has cut into the half-space high up is a shooter, not a
    // crosser (he keeps crossing only when he actually holds the touchline).
    if (role.movement.widthBias >= 0.8 && advancement >= 0.6 && offCenter <= 1) {
      weights[OnBallAction.Shoot] *= 1.9;
      weights[OnBallAction.Cross] *= 0.55;
    }
    // A late-arriving runner in the box (e.g. the third-man run into a false 9's
    // vacated space) finishes the move.
    if (state.grid.isPenaltyArea(side, state.ballZone) && role.movement.runFrequency >= 0.5) {
      weights[OnBallAction.Shoot] *= 1.8;
    }
  }

  private baseWeights(advancement: number, wide: boolean): Weights {
    return {
      [OnBallAction.Pass]: 1,
      [OnBallAction.Dribble]: 0.5 + advancement * 0.5,
      [OnBallAction.Shoot]:
        advancement >= 0.66
          ? advancement * advancement * 0.8
          : advancement >= 0.5
            ? advancement * 0.06
            : 0, // no shots from one's own half
      [OnBallAction.Cross]: wide && advancement >= 0.6 ? advancement * 0.9 : 0.05,
      [OnBallAction.HoldUp]: 0.25 + advancement * 0.3,
      [OnBallAction.Clear]: advancement < 0.34 ? 0.5 * (1 - advancement) : 0.05,
      [OnBallAction.PassBack]: 0.2,
    };
  }

  private applyRole(weights: Weights, role: Role): void {
    for (const action of Object.keys(weights) as OnBallAction[]) {
      const mult = role.decisionWeights[action];
      if (mult !== undefined) weights[action] *= mult;
    }
  }

  /** Team style: directness, tempo and width bias the vertical vs safe choice. */
  private applyTacticalStyle(
    weights: Weights,
    instr: { directness: number; tempo: number; width: number },
  ): void {
    const d = instr.directness - 0.5; // [-0.5, 0.5]
    const t = instr.tempo - 0.5;
    const w = instr.width - 0.5;
    weights[OnBallAction.Shoot] *= 1 + d * 0.4 + t * 0.3;
    weights[OnBallAction.Cross] *= 1 + w * 0.8 + d * 0.3;
    weights[OnBallAction.Dribble] *= 1 + t * 0.3;
    weights[OnBallAction.PassBack] *= Math.max(0.2, 1 - d * 0.5 - t * 0.3);
    weights[OnBallAction.HoldUp] *= Math.max(0.2, 1 - t * 0.3);
  }

  private applyObjective(weights: Weights, obj: SituationObjective): void {
    const i = obj.intensity;
    if (obj.kind === SituationKind.Chase) {
      weights[OnBallAction.Shoot] *= 1 + 0.6 * i;
      weights[OnBallAction.Dribble] *= 1 + 0.4 * i;
      weights[OnBallAction.Cross] *= 1 + 0.3 * i;
      weights[OnBallAction.HoldUp] *= 1 - 0.3 * i;
      weights[OnBallAction.PassBack] *= 1 - 0.6 * i;
      weights[OnBallAction.Clear] *= 1 - 0.3 * i;
    } else if (obj.kind === SituationKind.Protect) {
      weights[OnBallAction.PassBack] *= 1 + 0.8 * i;
      weights[OnBallAction.HoldUp] *= 1 + 0.5 * i;
      weights[OnBallAction.Pass] *= 1 + 0.2 * i;
      weights[OnBallAction.Shoot] *= 1 - 0.3 * i;
      weights[OnBallAction.Dribble] *= 1 - 0.4 * i;
      weights[OnBallAction.Cross] *= 1 - 0.2 * i;
    }
  }

  private applyPressure(
    weights: Weights,
    pressure: number,
    carrier: Player,
  ): void {
    const resist = norm(carrier.mental.composure);
    const eff = pressure * (1 - 0.5 * resist);
    weights[OnBallAction.Dribble] *= 1 - 0.6 * eff;
    weights[OnBallAction.HoldUp] *= 1 - 0.5 * eff;
    weights[OnBallAction.Shoot] *= 1 - 0.3 * eff;
    weights[OnBallAction.Pass] *= 1 + 0.2 * eff;
    weights[OnBallAction.Clear] *= 1 + 0.4 * eff;
    weights[OnBallAction.PassBack] *= 1 + 0.5 * eff;
  }
}
