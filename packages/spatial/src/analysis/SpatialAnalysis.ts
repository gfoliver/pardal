import { MAPS } from "../config.js";
import { FIELD, type SideDir } from "../field.js";
import { clamp, dist, pointToSegment, type Vec2 } from "../math.js";
import type { GameState } from "../state/GameState.js";
import { Grid } from "./Grid.js";

/**
 * Camada 2 — Spatial analysis. Rebuilds influence/space-control fields from the
 * current game state (at the analysis cadence, ~20 Hz). Higher layers query it
 * for open space, territorial control and passing-lane safety instead of
 * reasoning about raw player positions — this is what makes positioning
 * emergent rather than scripted.
 *
 * `control` is stored HOME-positive: a cell's value is (home influence − away
 * influence). A team's own control is that value times its direction sign, so a
 * positive number always means "my team dominates this cell".
 */
export class SpatialAnalysis {
  private readonly control = new Grid(MAPS.cell);

  constructor(private readonly state: GameState) {}

  /** Rebuild the fields from the current positions. */
  rebuild(): void {
    this.control.clear();
    for (const a of this.state.agents) {
      // Players ahead of the ball in their attacking direction project a little
      // more influence (they are arriving into that space).
      const sign = a.teamId === this.state.homeId ? 1 : -1;
      const amp = a.isGK ? 0.5 : 1;
      this.control.splat(a.pos, sign * amp, MAPS.sigma);
    }
  }

  /** Signed control at a point from a team's perspective (+ = my team dominates). */
  controlFor(teamId: string, p: Vec2): number {
    const sign = teamId === this.state.homeId ? 1 : -1;
    return sign * this.control.sample(p);
  }

  /**
   * Passing-lane safety in [0, 1]: 1 = clear lane, →0 = an opponent sits on it.
   * Opponents near the segment (weighted by how central and how close) subtract.
   */
  laneSafety(from: Vec2, to: Vec2, teamId: string): number {
    let danger = 0;
    for (const o of this.state.opponentsOf(teamId)) {
      const seg = pointToSegment(o.pos, from, to);
      // Only opponents between the passer and target (0<t<1) and near the line.
      if (seg.t <= 0.02 || seg.t >= 0.98) continue;
      danger += Math.max(0, 1 - seg.dist / 4.5);
    }
    return clamp(1 - danger, 0, 1);
  }

  /**
   * Find an open supporting position for a teammate around an anchor (usually
   * the ball), preferring cells the team controls and that are forward. Sampled
   * over a coarse ring so it stays cheap. Returns a world position.
   */
  bestSupportCell(teamId: string, anchor: Vec2, dir: SideDir, minR: number, maxR: number): Vec2 {
    let best = anchor;
    let bestScore = -Infinity;
    const step = MAPS.cell;
    for (let ry = -maxR; ry <= maxR; ry += step) {
      for (let rx = -maxR; rx <= maxR; rx += step) {
        const r = Math.sqrt(rx * rx + ry * ry);
        if (r < minR || r > maxR) continue;
        const p: Vec2 = {
          x: clamp(anchor.x + rx, 2, FIELD.LENGTH - 2),
          y: clamp(anchor.y + ry, 2, FIELD.WIDTH - 2),
        };
        const control = this.controlFor(teamId, p);
        const forwardness = dir * (p.x - anchor.x); // reward getting ahead of the ball
        const lane = this.laneSafety(anchor, p, teamId);
        const score = control * 0.5 + forwardness * 0.05 + lane * 0.8;
        if (score > bestScore) {
          bestScore = score;
          best = p;
        }
      }
    }
    return best;
  }
}
