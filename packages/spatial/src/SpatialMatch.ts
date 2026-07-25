import type { MatchEvent, TeamStats } from "@fut/engine";
import type { Formation, Position, Team, TeamInstructions } from "@fut/domain";
import { MatchEngine } from "./MatchEngine.js";
import type { AgentShape, SpatialPlayerView, SpatialSnapshot } from "./types.js";

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

  // --- in-match management (forwarded to the engine) ----------------------
  subsRemaining(teamId: string): number {
    return this.engine.subsRemaining(teamId);
  }
  onPitch(teamId: string): { id: string; name: string; position: string; stamina: number }[] {
    return this.engine.onPitch(teamId);
  }
  bench(teamId: string): { id: string; name: string; position: string }[] {
    return this.engine.bench(teamId);
  }
  requestSub(teamId: string, outId: string, inId: string): boolean {
    return this.engine.requestSub(teamId, outId, inId);
  }
  setInstructions(teamId: string, patch: Partial<TeamInstructions>): void {
    this.engine.setInstructions(teamId, patch);
  }
  instructionsOf(teamId: string): TeamInstructions | undefined {
    return this.engine.instructionsOf(teamId);
  }
  /** The side's live shape — cells, roles, fitness (see {@link AgentShape}). */
  shape(teamId: string): AgentShape[] {
    return this.engine.shape(teamId);
  }
  setFormation(teamId: string, formation: Formation): boolean {
    return this.engine.setFormation(teamId, formation);
  }
  movePlayer(playerId: string, depth: number, width: number): boolean {
    return this.engine.movePlayer(playerId, depth, width);
  }
  swapPlayers(aId: string, bId: string): boolean {
    return this.engine.swapPlayers(aId, bId);
  }
  setRole(playerId: string, roleKey: string): boolean {
    return this.engine.setRole(playerId, roleKey);
  }
  setFieldedPosition(playerId: string, position: Position): boolean {
    return this.engine.setFieldedPosition(playerId, position);
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
      stamina: a.stamina,
    }));
    return {
      minute: this.engine.minute,
      status: this.engine.status === "kickoff" ? "kickoff" : this.engine.finished ? "finished" : this.engine.status,
      homeScore: st.score.home,
      awayScore: st.score.away,
      possessionTeamId: st.possessionTeamId,
      players,
      ball: { x: st.ball.pos.x, y: st.ball.pos.y, z: st.ball.z },
    };
  }
}
