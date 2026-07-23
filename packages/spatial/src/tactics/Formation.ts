import { FORMATION } from "../config.js";
import { attackGoalX, FIELD, type SideDir } from "../field.js";
import { clamp, type Vec2 } from "../math.js";
import type { PlayerAgent } from "../state/PlayerAgent.js";
import type { TacticalProfile } from "./TacticalProfile.js";

/**
 * Situation-Based Strategic Positioning (SBSP). The team holds its formation as
 * a single BLOCK that slides around the pitch with the ball. The DEPTH of the
 * block is phase-dependent:
 *
 *  • Attacking (in possession) the whole side moves up as a block that FOLLOWS
 *    THE BALL — even the defenders leave the back line to keep the team
 *    compact and support play. Mentality only nudges this.
 *  • Defending it drops into a compact block whose height is set by the
 *    line-height / pressing instructions (a low block vs a high line).
 *
 * Lateral position always shifts toward the ball's side to keep the block
 * ball-oriented.
 */
export class Formation {
  /** Where the block's deepest line sits (metres up-pitch from own goal). */
  private static blockLine(ballAdv: number, profile: TacticalProfile, attacking: boolean): { lineAdv: number; blockLen: number } {
    if (attacking) {
      // The block trails the ball up the pitch; mentality is a mild nudge only.
      const lineAdv = clamp(ballAdv - FORMATION.attackTrail + profile.attackBias * 6, 6, 62);
      return { lineAdv, blockLen: FORMATION.attackBlockLen };
    }
    // Defending: line height sets how high we sit; pressing makes us compact.
    const lineCap = 12 + profile.lineHeight * 34; // 12 (deep) … 46 (very high line)
    const lineAdv = clamp(Math.min(ballAdv - 4, lineCap), 10, 48);
    return { lineAdv, blockLen: FORMATION.teamLengthMax * (0.78 - profile.pressing * 0.14) };
  }

  /**
   * Strategic (home) position for the current ball position.
   */
  static homePosition(agent: PlayerAgent, ball: Vec2, profile: TacticalProfile, attacking: boolean): Vec2 {
    const dir = agent.dir;
    const advance = (x: number) => (dir === 1 ? x : FIELD.LENGTH - x);
    const inv = (adv: number) => (dir === 1 ? adv : FIELD.LENGTH - adv);

    // Depth: player sits at their relative position within a block that follows
    // the ball (attacking) or holds a line (defending).
    const { lineAdv, blockLen } = Formation.blockLine(advance(ball.x), profile, attacking);
    const depthFrac = clamp((agent.baseDepth - 0.12) / (0.88 - 0.12), 0, 1);
    const homeX = inv(lineAdv + depthFrac * blockLen);

    // Lateral: formation channel (width-scaled) shifted toward the ball's side.
    const spread = 0.5 + profile.width * 1.0;
    const baseY = FIELD.WIDTH / 2 + (agent.baseWidth - 0.5) * FIELD.WIDTH * spread * dir;
    const attrY = FORMATION.attrY * (attacking ? 1 : 1.15);
    const homeY = clamp(baseY + attrY * (ball.y - FIELD.CENTRE.y), baseY - FORMATION.clipY, baseY + FORMATION.clipY);

    return {
      x: clamp(homeX, 2, FIELD.LENGTH - 2),
      y: clamp(homeY, 2, FIELD.WIDTH - 2),
    };
  }

  /** Convenience: the x of a side's own goal line. */
  static ownGoalX(dir: SideDir): number {
    return dir === 1 ? 0 : FIELD.LENGTH;
  }

  /** Convenience: the x of the goal a side attacks. */
  static attackGoalX(dir: SideDir): number {
    return attackGoalX(dir);
  }
}
