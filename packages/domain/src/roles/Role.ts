import { OnBallAction, PositionGroup } from "../types.js";

/**
 * Off-ball movement tendencies of a role. Values are biases roughly in
 * [-1, 1]; the engine's `PositioningModel` interprets them relative to the
 * ball position and phase of play.
 */
export interface RoleMovement {
  /** + pushes the player forward when the team has the ball. */
  readonly attackingBias: number;
  /** + makes the player drop/hold when the team loses the ball. */
  readonly defensiveBias: number;
  /** + hugs the touchline (wide); - tucks inside. */
  readonly widthBias: number;
  /** + stays high on the last line; - drops deep to build play. */
  readonly depthBias: number;
  /** 0..1: how often the player makes forward off-ball runs / infiltrations. */
  readonly runFrequency: number;
}

/**
 * A pre-defined tactical function attached to a player, Football Manager style.
 * A `Role` is a plug-in strategy (OCP): it only carries data — movement
 * tendencies and on-ball decision multipliers — that the engine interprets.
 */
export interface Role {
  readonly key: string;
  /** Position groups this role is compatible with. */
  readonly positions: readonly PositionGroup[];
  readonly movement: RoleMovement;
  /** Multipliers applied to base action weights (default 1 when omitted). */
  readonly decisionWeights: Partial<Record<OnBallAction, number>>;
}
