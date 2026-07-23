import { MatchEventType, type RandomSource } from "@fut/engine";
import { DUEL, TEMPO } from "../config.js";
import { FIELD } from "../field.js";
import { clamp, dist, type Vec2 } from "../math.js";
import type { GameState } from "../state/GameState.js";

/**
 * Possession contests (tackles). A defender who gets within tackle range of the
 * carrier attempts to win the ball; success is a function of tackling vs the
 * carrier's dribbling/composure. A cooldown ensures pressing mostly CONTAINS
 * the carrier (forcing a pass) rather than winning the ball every frame, so
 * possessions can build.
 */
export class Contest {
  private cooldown = 0;

  constructor(
    private readonly state: GameState,
    private readonly rng: RandomSource,
    /** Called when a failed challenge is a foul: (fouled team, location). */
    private readonly onFoul: (fouledTeamId: string, at: Vec2) => void,
  ) {}

  update(dt: number): void {
    if (this.cooldown > 0) this.cooldown -= dt;
    const carrier = this.state.carrier;
    if (!carrier || this.cooldown > 0) return;
    if (carrier.isGK) return; // don't tackle the keeper holding the ball

    // Keeper smother: a keeper that has come off its line snuffs out a 1-v-1 if
    // it gets right up to the attacker near its goal.
    const defTeam = this.state.otherTeam(carrier.teamId);
    const gk = this.state.teamAgents(defTeam).find((a) => a.isGK);
    if (gk && carrier.controlTimer <= 0) {
      const dir = this.state.dirOf(defTeam);
      const goal = { x: dir === 1 ? 0 : FIELD.LENGTH, y: FIELD.WIDTH / 2 };
      if (dist(carrier.pos, goal) < 20 && dist(gk.pos, carrier.pos) < 1.9) {
        this.cooldown = DUEL.tackleCooldown;
        const smother = clamp(0.35 + gk.reflexes * 0.45, 0.2, 0.85);
        if (this.rng.chance(smother)) this.state.giveBall(gk, TEMPO.firstTouch);
        return; // committed to the smother this beat
      }
    }

    for (const o of this.state.opponentsOf(carrier.teamId)) {
      if (o.isGK) continue;
      if (dist(o.pos, carrier.pos) > DUEL.tackleRadius) continue;
      this.cooldown = DUEL.tackleCooldown;
      const tackle = o.tackling * 0.6 + o.anticipation * 0.4;
      const evade = carrier.dribbling * 0.6 + carrier.composure * 0.4;
      const p = clamp(DUEL.tackleBase + (tackle - evade) * DUEL.tackleSkill, DUEL.tackleMin, DUEL.tackleMax);
      if (this.rng.chance(p)) {
        this.state.statsFor(o.teamId).tackles += 1;
        this.state.events.push({
          minute: Math.floor(this.state.clock / 60),
          type: MatchEventType.Tackle,
          teamId: o.teamId,
          playerId: o.id,
          playerName: o.player.name,
        });
        this.state.giveBall(o, TEMPO.firstTouch);
      } else if (this.rng.chance(DUEL.foulOnMiss * (0.6 + o.player.mental.aggression / 99))) {
        // A mistimed challenge fouls the carrier → free kick / penalty.
        this.onFoul(carrier.teamId, { ...carrier.pos });
      }
      return; // one attempt per cooldown
    }
  }
}
