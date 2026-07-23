import type { MatchEvent, TeamStats } from "@fut/engine";
import type { Team } from "@fut/domain";
import { MatchEngine } from "./MatchEngine.js";
import type { SpatialPlayerView, SpatialSnapshot } from "./types.js";

export interface SpatialConfig {
  home: Team;
  away: Team;
  seed: number;
  regulationMinutes?: number;
}

/**
 * Public facade over the layered {@link MatchEngine}. Preserves the interface
 * the app + i18n report already consume — `tick`, `snapshot`, `events`,
 * `stats`, `score` — while all behaviour lives in the emergent architecture
 * behind it. Screen coordinates: x = across (0..100), y = along (0..100, home
 * defends the bottom).
 */
export class SpatialMatch {
  private readonly engine: MatchEngine;

  constructor(config: SpatialConfig) {
    this.engine = new MatchEngine(config.home, config.away, config.seed, config.regulationMinutes ?? 90);
  }

  tick(dt: number): MatchEvent[] {
    return this.engine.tick(dt);
  }

  get finished(): boolean {
    return this.engine.finished;
  }
  get events(): readonly MatchEvent[] {
    return this.engine.events;
  }
  get stats(): { home: TeamStats; away: TeamStats } {
    return this.engine.stats;
  }
  get score(): { home: number; away: number } {
    return this.engine.score;
  }
  get minute(): number {
    return this.engine.minute;
  }

  snapshot(): SpatialSnapshot {
    const st = this.engine.state;
    // Raw engine metres — the frontend projects these with the SAME transform
    // it uses for the pitch geometry, so the display is coordinate-faithful.
    const players: SpatialPlayerView[] = st.agents.map((a) => ({
      id: a.id,
      teamId: a.teamId,
      pos: a.player.position,
      x: a.pos.x,
      y: a.pos.y,
      hasBall: a.id === st.ball.ownerId,
    }));
    return {
      minute: this.engine.minute,
      status: this.engine.status === "kickoff" ? "kickoff" : this.engine.finished ? "finished" : this.engine.status,
      homeScore: st.score.home,
      awayScore: st.score.away,
      possessionTeamId: st.possessionTeamId,
      players,
      ball: { x: st.ball.pos.x, y: st.ball.pos.y },
    };
  }
}
