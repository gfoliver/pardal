import { OnBallAction, Position } from "../types.js";
import { type Role } from "./Role.js";

/** Stable identifiers for the built-in roles. */
export enum RoleKey {
  Goalkeeper = "goalkeeper",
  Stopper = "stopper",
  BallPlayingDefender = "ballPlayingDefender",
  DefensiveFullBack = "defensiveFullBack",
  WingBack = "wingBack",
  BallWinningMidfielder = "ballWinningMidfielder",
  DeepLyingPlaymaker = "deepLyingPlaymaker",
  BoxToBox = "boxToBox",
  AttackingMidfielder = "attackingMidfielder",
  Winger = "winger",
  InsideForward = "insideForward",
  WideMidfielder = "wideMidfielder",
  TargetMan = "targetMan",
  Poacher = "poacher",
  FalseNine = "falseNine",
  InfiltratingForward = "infiltratingForward",
}

const roles: Record<RoleKey, Role> = {
  [RoleKey.Goalkeeper]: {
    key: RoleKey.Goalkeeper,
    positions: [Position.Goalkeeper],
    movement: { attackingBias: -1, defensiveBias: 1, widthBias: 0, depthBias: -1, runFrequency: 0 },
    decisionWeights: {
      [OnBallAction.Clear]: 1.6,
      [OnBallAction.Pass]: 1.1,
      [OnBallAction.Dribble]: 0.02,
      [OnBallAction.Shoot]: 0.01,
      [OnBallAction.HoldUp]: 0.05,
      [OnBallAction.Cross]: 0.02,
    },
  },
  [RoleKey.Stopper]: {
    key: RoleKey.Stopper,
    positions: [Position.CentreBack],
    movement: { attackingBias: -0.6, defensiveBias: 1, widthBias: -0.2, depthBias: -0.6, runFrequency: 0.05 },
    decisionWeights: { [OnBallAction.Clear]: 1.3, [OnBallAction.Pass]: 0.9 },
  },
  [RoleKey.BallPlayingDefender]: {
    key: RoleKey.BallPlayingDefender,
    positions: [Position.CentreBack],
    movement: { attackingBias: -0.4, defensiveBias: 0.9, widthBias: -0.2, depthBias: -0.6, runFrequency: 0.1 },
    decisionWeights: { [OnBallAction.Pass]: 1.3, [OnBallAction.Clear]: 0.8 },
  },
  [RoleKey.DefensiveFullBack]: {
    key: RoleKey.DefensiveFullBack,
    positions: [Position.FullBack, Position.WingBack],
    movement: { attackingBias: -0.2, defensiveBias: 0.8, widthBias: 0.7, depthBias: -0.4, runFrequency: 0.2 },
    decisionWeights: { [OnBallAction.Pass]: 1.1, [OnBallAction.Cross]: 0.9 },
  },
  [RoleKey.WingBack]: {
    key: RoleKey.WingBack,
    positions: [Position.WingBack, Position.FullBack],
    movement: { attackingBias: 0.6, defensiveBias: 0.4, widthBias: 1, depthBias: 0.2, runFrequency: 0.45 },
    decisionWeights: { [OnBallAction.Cross]: 1.6, [OnBallAction.Dribble]: 1.1 },
  },
  [RoleKey.BallWinningMidfielder]: {
    key: RoleKey.BallWinningMidfielder,
    positions: [Position.DefensiveMidfielder, Position.CentralMidfielder],
    movement: { attackingBias: -0.1, defensiveBias: 0.9, widthBias: -0.1, depthBias: -0.3, runFrequency: 0.2 },
    decisionWeights: { [OnBallAction.Pass]: 1, [OnBallAction.Dribble]: 0.7 },
  },
  [RoleKey.DeepLyingPlaymaker]: {
    key: RoleKey.DeepLyingPlaymaker,
    positions: [Position.DefensiveMidfielder, Position.CentralMidfielder],
    movement: { attackingBias: 0.1, defensiveBias: 0.5, widthBias: -0.2, depthBias: -0.4, runFrequency: 0.15 },
    decisionWeights: { [OnBallAction.Pass]: 1.5, [OnBallAction.Dribble]: 0.9 },
  },
  [RoleKey.BoxToBox]: {
    key: RoleKey.BoxToBox,
    positions: [Position.CentralMidfielder, Position.DefensiveMidfielder],
    movement: { attackingBias: 0.4, defensiveBias: 0.5, widthBias: 0, depthBias: 0.1, runFrequency: 0.6 },
    decisionWeights: { [OnBallAction.Pass]: 1.1, [OnBallAction.Dribble]: 1.1, [OnBallAction.Shoot]: 1.1 },
  },
  [RoleKey.AttackingMidfielder]: {
    key: RoleKey.AttackingMidfielder,
    positions: [Position.AttackingMidfielder, Position.CentralMidfielder],
    movement: { attackingBias: 0.7, defensiveBias: 0.2, widthBias: 0, depthBias: 0.4, runFrequency: 0.75 },
    decisionWeights: { [OnBallAction.Pass]: 1.2, [OnBallAction.Shoot]: 1.2, [OnBallAction.Dribble]: 1.2 },
  },
  [RoleKey.Winger]: {
    key: RoleKey.Winger,
    positions: [Position.Winger],
    movement: { attackingBias: 0.6, defensiveBias: 0.3, widthBias: 0.85, depthBias: 0.42, runFrequency: 0.78 },
    decisionWeights: { [OnBallAction.Cross]: 1.7, [OnBallAction.Dribble]: 1.3, [OnBallAction.Shoot]: 0.6 },
  },
  [RoleKey.InsideForward]: {
    key: RoleKey.InsideForward,
    positions: [Position.Winger, Position.Striker],
    movement: { attackingBias: 0.85, defensiveBias: 0.15, widthBias: 0.5, depthBias: 0.7, runFrequency: 0.85 },
    decisionWeights: { [OnBallAction.Shoot]: 1.4, [OnBallAction.Dribble]: 1.3, [OnBallAction.Cross]: 0.6 },
  },
  [RoleKey.WideMidfielder]: {
    key: RoleKey.WideMidfielder,
    positions: [Position.Winger, Position.CentralMidfielder],
    movement: { attackingBias: 0.3, defensiveBias: 0.6, widthBias: 0.9, depthBias: 0.1, runFrequency: 0.35 },
    decisionWeights: { [OnBallAction.Cross]: 1.2, [OnBallAction.Pass]: 1.1, [OnBallAction.Dribble]: 1 },
  },
  [RoleKey.TargetMan]: {
    key: RoleKey.TargetMan,
    positions: [Position.Striker],
    movement: { attackingBias: 0.8, defensiveBias: 0.1, widthBias: -0.2, depthBias: 0.6, runFrequency: 0.2 },
    decisionWeights: { [OnBallAction.HoldUp]: 1.6, [OnBallAction.Shoot]: 1.1, [OnBallAction.Pass]: 1.1, [OnBallAction.Dribble]: 0.6 },
  },
  [RoleKey.Poacher]: {
    key: RoleKey.Poacher,
    positions: [Position.Striker],
    movement: { attackingBias: 0.9, defensiveBias: 0, widthBias: -0.1, depthBias: 0.9, runFrequency: 0.9 },
    decisionWeights: { [OnBallAction.Shoot]: 1.6, [OnBallAction.HoldUp]: 0.6, [OnBallAction.Pass]: 0.8 },
  },
  [RoleKey.FalseNine]: {
    key: RoleKey.FalseNine,
    positions: [Position.Striker, Position.AttackingMidfielder],
    movement: { attackingBias: 0.5, defensiveBias: 0.3, widthBias: -0.1, depthBias: -0.5, runFrequency: 0.5 },
    decisionWeights: { [OnBallAction.Pass]: 1.5, [OnBallAction.Dribble]: 1.1, [OnBallAction.Shoot]: 0.9, [OnBallAction.HoldUp]: 0.8 },
  },
  [RoleKey.InfiltratingForward]: {
    key: RoleKey.InfiltratingForward,
    positions: [Position.Striker, Position.Winger],
    movement: { attackingBias: 1, defensiveBias: 0, widthBias: 0, depthBias: 1, runFrequency: 1 },
    decisionWeights: { [OnBallAction.Shoot]: 1.3, [OnBallAction.Dribble]: 1.2, [OnBallAction.HoldUp]: 0.7 },
  },
};

/** Look up a role by key. Throws on an unknown key (programmer error). */
export function getRole(key: RoleKey | string): Role {
  const role = roles[key as RoleKey];
  if (!role) throw new Error(`Unknown role: ${key}`);
  return role;
}

/** All built-in roles (read-only). */
export function allRoles(): readonly Role[] {
  return Object.values(roles);
}

/**
 * The roles that make sense in a given position — a poacher is a striker's job,
 * a wing-back a full-back's. This is what a tactics screen offers once the
 * manager has decided where a player is playing.
 */
export function rolesFor(position: Position): readonly Role[] {
  return allRoles().filter((r) => r.positions.includes(position));
}
