import { KINEMATICS, TEMPO } from "../config.js";
import { dist, scale, type Vec2 } from "../math.js";
import type { GameState } from "../state/GameState.js";
import type { PlayerAgent } from "../state/PlayerAgent.js";
import type { ObjectiveKind } from "../types.js";
import { ContextSteering } from "./ContextSteering.js";

/** Objectives where the player engages a target directly (no opponent avoidance). */
const ENGAGING: ReadonlySet<ObjectiveKind> = new Set<ObjectiveKind>([
  "press",
  "markMan",
  "chaseLoose",
  "keeper",
]);

/**
 * Effort per objective (fraction of top speed). Only the ball-carrier, the
 * presser and ball-chasers go near flat-out; everyone else cruises/jogs — real
 * teams don't have 20 players sprinting at once. This is the main lever that
 * calms the frantic "everyone flying at the ball" look (and models that a side
 * couldn't sustain all-out pressing without exhausting itself).
 */
const INTENSITY: Record<ObjectiveKind, number> = {
  onBall: 0.95, // a player driving with the ball goes for it
  chaseLoose: 1.0,
  press: 0.78, // close down briskly but not at teleport speed
  attackDepth: 0.92, // a genuine sprint in behind / on the counter
  support: 0.72,
  markMan: 0.72,
  cover: 0.6,
  provideWidth: 0.62,
  holdShape: 0.5, // jog to keep shape
  keeper: 0.82, // comes off the line in a 1-v-1, but not recklessly
};

/**
 * Turns each agent's objective into a DESIRED VELOCITY via context steering
 * (direction) and an Arrive profile (speed). The physics layer then integrates
 * toward it under acceleration and turn-rate limits. Runs at the analysis
 * cadence; physics interpolates between updates.
 */
export class MovementSystem {
  private readonly steering: ContextSteering;

  constructor(private readonly state: GameState) {
    this.steering = new ContextSteering(state);
  }

  update(): void {
    for (const a of this.state.agents) {
      const obj = a.objective;
      if (!obj) {
        a.desiredVel = { x: 0, y: 0 };
        continue;
      }
      const avoidOpponents = !ENGAGING.has(obj.kind); // onBall & off-ball find space; press/mark/chase engage
      const direction = this.steering.choose(a, obj.target, avoidOpponents);

      // Arrive: ease down within the slow radius so players settle rather than
      // orbit the target. Cruise speed scales with the objective's urgency —
      // but a player far from their target still hustles a bit more so shape
      // recovers, blending the base effort up toward full over long distances.
      const d = dist(a.pos, obj.target);
      const effort = Math.min(1, INTENSITY[obj.kind] + Math.max(0, d - 12) * 0.02);
      const arrive = d < KINEMATICS.arriveRadius ? d / KINEMATICS.arriveRadius : 1;
      let speed = a.maxSpeed * effort * arrive;

      // A carrier settling/carrying the ball moves at a controlled carry pace.
      if (a.id === this.state.ball.ownerId && a.controlTimer > 0) speed = Math.min(speed, TEMPO.carrySpeed);
      // Keepers are calmer unless the ball is close.
      if (a.isGK && d < 1.5) speed = Math.min(speed, 2.5);

      a.desiredVel = scale(direction, speed);
    }
  }
}
