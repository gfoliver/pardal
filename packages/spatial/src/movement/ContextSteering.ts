import { STEERING } from "../config.js";
import { FIELD } from "../field.js";
import { dot, fromAngle, norm, sub, type Vec2 } from "../math.js";
import type { GameState } from "../state/GameState.js";
import type { PlayerAgent } from "../state/PlayerAgent.js";

/**
 * Context steering (Fray, Game AI Pro 2). Instead of summing attraction/
 * repulsion forces — which cancel out and trap agents in local minima (the
 * classic clustering/oscillation) — we score a ring of direction slots by
 * INTEREST (alignment with the goal direction) minus DANGER (opponents,
 * crowding team-mates, the touchline) and move in the best free slot. Agents
 * flow AROUND each other instead of piling up.
 */
export class ContextSteering {
  private readonly dirs: Vec2[];

  constructor(private readonly state: GameState) {
    this.dirs = [];
    for (let i = 0; i < STEERING.slots; i++) {
      this.dirs.push(fromAngle((2 * Math.PI * i) / STEERING.slots));
    }
  }

  /**
   * Choose a unit movement direction toward `target`. `avoidOpponents` is off
   * for engaging objectives (press/mark/chase) so a defender still runs AT the
   * ball, but always on for off-ball movement so players find space.
   */
  choose(agent: PlayerAgent, target: Vec2, avoidOpponents: boolean): Vec2 {
    const toTarget = norm(sub(target, agent.pos));
    if (toTarget.x === 0 && toTarget.y === 0) return { x: 0, y: 0 };

    const interest = new Array<number>(STEERING.slots);
    const danger = new Array<number>(STEERING.slots).fill(0);

    for (let i = 0; i < STEERING.slots; i++) {
      interest[i] = Math.max(0, dot(this.dirs[i]!, toTarget));
    }

    // Team-mate crowding is always a danger (anti-clustering / separation). A
    // generous radius means a team-mate within personal space creates danger
    // strong enough to override the target pull, so players peel apart instead
    // of stacking on the same square.
    for (const mate of this.state.teamAgents(agent.teamId)) {
      if (mate === agent) continue;
      this.addDanger(danger, agent.pos, mate.pos, STEERING.separationRadius, STEERING.separationWeight);
    }
    if (avoidOpponents) {
      for (const opp of this.state.opponentsOf(agent.teamId)) {
        this.addDanger(danger, agent.pos, opp.pos, STEERING.dangerRadius, 1);
      }
    }
    // Touchlines repel so players don't hug the paint.
    this.edgeDanger(danger, agent.pos);

    // Blend the surviving slots weighted by (interest − danger). Blending —
    // rather than picking a single argmax slot — avoids the quantisation
    // tie-break that would otherwise round every ambiguous direction to the
    // lowest-index slot (+x), a systematic bias favouring the +x-attacking team.
    let vx = 0;
    let vy = 0;
    for (let i = 0; i < STEERING.slots; i++) {
      const score = interest[i]! - danger[i]!;
      if (score <= 0) continue;
      vx += this.dirs[i]!.x * score;
      vy += this.dirs[i]!.y * score;
    }
    const blended = norm({ x: vx, y: vy });
    // Fall back to the straight-line direction if every slot was vetoed.
    return blended.x === 0 && blended.y === 0 ? toTarget : blended;
  }

  private addDanger(danger: number[], from: Vec2, hazard: Vec2, radius: number, weight: number, power = 1): void {
    const to = sub(hazard, from);
    const d = Math.hypot(to.x, to.y);
    if (d >= radius || d < 1e-4) return;
    const falloff = Math.pow(1 - d / radius, power) * weight;
    const dirTo = { x: to.x / d, y: to.y / d };
    for (let i = 0; i < danger.length; i++) {
      danger[i] = danger[i]! + Math.max(0, dot(this.dirs[i]!, dirTo)) * falloff;
    }
  }

  private edgeDanger(danger: number[], pos: Vec2): void {
    const margin = 4;
    if (pos.y < margin) this.addDanger(danger, pos, { x: pos.x, y: pos.y - 2 }, margin, 1.2);
    if (pos.y > FIELD.WIDTH - margin) this.addDanger(danger, pos, { x: pos.x, y: pos.y + 2 }, margin, 1.2);
    if (pos.x < margin) this.addDanger(danger, pos, { x: pos.x - 2, y: pos.y }, margin, 1.2);
    if (pos.x > FIELD.LENGTH - margin) this.addDanger(danger, pos, { x: pos.x + 2, y: pos.y }, margin, 1.2);
  }
}
