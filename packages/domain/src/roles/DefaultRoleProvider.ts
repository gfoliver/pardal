import { Position } from "../types.js";
import { getRole, RoleKey } from "./library.js";
import { type Role } from "./Role.js";

/**
 * Supplies a sensible default role per position. This powers "simple mode"
 * (Brasfoot-style): a user picks only the lineup and the roles are filled in
 * automatically, so the engine always receives complete tactics.
 */
export class DefaultRoleProvider {
  defaultRoleFor(position: Position): Role {
    return getRole(DEFAULT_ROLE_BY_POSITION[position]);
  }
}

const DEFAULT_ROLE_BY_POSITION: Record<Position, RoleKey> = {
  [Position.Goalkeeper]: RoleKey.Goalkeeper,
  [Position.CentreBack]: RoleKey.Stopper,
  [Position.FullBack]: RoleKey.DefensiveFullBack,
  [Position.WingBack]: RoleKey.WingBack,
  [Position.DefensiveMidfielder]: RoleKey.BallWinningMidfielder,
  [Position.CentralMidfielder]: RoleKey.BoxToBox,
  [Position.AttackingMidfielder]: RoleKey.AttackingMidfielder,
  [Position.Winger]: RoleKey.Winger,
  [Position.Striker]: RoleKey.Poacher,
};
