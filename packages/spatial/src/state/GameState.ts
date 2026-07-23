import {
  createTeamStats,
  type MatchEvent,
  type TeamStats,
} from "@fut/engine";
import { DefaultRoleProvider, type Team } from "@fut/domain";
import { TEMPO } from "../config.js";
import { FIELD, type SideDir } from "../field.js";
import { dist, type Vec2 } from "../math.js";
import type { DeadBall, Phase } from "../types.js";
import { Ball } from "./Ball.js";
import { PlayerAgent } from "./PlayerAgent.js";

const roleFallback = new DefaultRoleProvider();

/**
 * Camada 1 — Global game state. The single source of truth for the match:
 * every player body, the ball, possession, the clock, the score, accumulated
 * stats and the event log. It also exposes the cheap spatial QUERIES the higher
 * layers lean on (nearest player, defensive line, centroids). It holds no
 * behaviour of its own — layers read and mutate it.
 */
export class GameState {
  readonly agents: PlayerAgent[] = [];
  readonly ball = new Ball();

  readonly homeId: string;
  readonly awayId: string;
  private readonly byId = new Map<string, PlayerAgent>();
  private readonly teams: Record<string, PlayerAgent[]> = {};

  possessionTeamId: string;
  /** Per-team first-touch settle time (s), from the tactic's tempo. */
  readonly firstTouch: Record<string, number> = {};
  /** Non-null while play is stopped for a set piece (pause + reposition). */
  deadBall: DeadBall | null = null;
  clock = 0; // seconds
  readonly score = { home: 0, away: 0 };
  readonly stats: { home: TeamStats; away: TeamStats } = {
    home: createTeamStats(),
    away: createTeamStats(),
  };
  readonly events: MatchEvent[] = [];

  /**
   * Calibration telemetry (cheap counters; read by the diagnostic harness).
   * Not part of the match model — safe to ignore in production.
   */
  readonly telemetry = {
    decisions: 0,
    pass: 0,
    dribble: 0,
    hold: 0,
    shoot: 0,
    clear: 0,
    chip: 0,
    passComplete: 0,
    passIntercept: 0,
    passOut: 0,
    cross: 0, // lofted deliveries into the box
    aerialDuel: 0, // contested headers resolved
    header: 0, // headers won (any outcome)
    headerShot: 0, // headers on/at goal
    headerClear: 0, // defensive header clearances
    throughBall: 0, // lofted passes into space behind the line
    keeperClaim: 0, // high balls a keeper comes to claim
    offside: 0, // offside calls
    throwIn: 0, // throw-ins taken
    switchPlay: 0, // long diagonal switches of play
    shotClose: 0, // shots from < 11 m (point-blank / six-yard)
    shotMid: 0, // shots from 11–20 m
    shotFar: 0, // shots from > 20 m
    chipGkOutSum: 0, // sum of keeper-distance-from-goal at each chip (→ avg gkOut)
    goalKeeperInRange: 0, // goals conceded with the keeper within saving range (beaten by placement/roll)
    goalKeeperOut: 0, // goals conceded with the keeper OUT of range (beaten/out of position)
    goalKeeperAdvanceSum: 0, // sum of keeper distance-off-line at each conceded goal
    shotPressureSum: 0, // sum of nearest-defender distance (m) at each foot shot
    shotUnpressured: 0, // foot shots taken with the nearest defender > 4 m away
    shotLaneOpenSum: 0, // sum of shot-lane openness (0..1) at each foot shot
  };

  /** Tally a shot by distance band (calibration telemetry). */
  tallyShotDistance(d: number): void {
    if (d < 11) this.telemetry.shotClose += 1;
    else if (d <= 20) this.telemetry.shotMid += 1;
    else this.telemetry.shotFar += 1;
  }

  constructor(home: Team, away: Team) {
    this.homeId = home.id;
    this.awayId = away.id;
    this.buildTeam(home, 1);
    this.buildTeam(away, -1);
    this.possessionTeamId = home.id;
  }

  private buildTeam(team: Team, dir: SideDir): void {
    this.teams[team.id] = [];
    const ownGoalX = dir === 1 ? 0 : FIELD.LENGTH;
    for (const p of team.startingXi) {
      const slot = team.tactics.baseSlot(p.id);
      const depth = slot ? slot.depth : 0.1;
      const width = slot ? slot.width : 0.5;
      const role = (team.tactics.roleFor(p.id) ?? roleFallback.defaultRoleFor(p.position)).movement;
      // Kick-off: whole formation compressed into its own half. Width is
      // mirrored for the away side so "left/right" is team-relative.
      const widthY = dir === 1 ? width * FIELD.WIDTH : FIELD.WIDTH - width * FIELD.WIDTH;
      const home: Vec2 = { x: ownGoalX + dir * (0.06 + depth * 0.44) * FIELD.LENGTH, y: widthY };
      const agent = new PlayerAgent(p, team.id, dir, depth, width, role, home);
      this.agents.push(agent);
      this.byId.set(agent.id, agent);
      this.teams[team.id]!.push(agent);
    }
  }

  // --- Identity / lookup ----------------------------------------------------
  agent(id: string | null): PlayerAgent | undefined {
    return id ? this.byId.get(id) : undefined;
  }
  teamAgents(teamId: string): PlayerAgent[] {
    return this.teams[teamId]!;
  }
  opponentsOf(teamId: string): PlayerAgent[] {
    return this.teams[teamId === this.homeId ? this.awayId : this.homeId]!;
  }
  otherTeam(teamId: string): string {
    return teamId === this.homeId ? this.awayId : this.homeId;
  }
  statsFor(teamId: string): TeamStats {
    return teamId === this.homeId ? this.stats.home : this.stats.away;
  }
  dirOf(teamId: string): SideDir {
    return teamId === this.homeId ? 1 : -1;
  }

  // --- Possession / phase ---------------------------------------------------
  get carrier(): PlayerAgent | undefined {
    return this.agent(this.ball.ownerId);
  }
  get defendingTeamId(): string {
    return this.otherTeam(this.possessionTeamId);
  }

  /** Phase of play from a team's perspective. */
  phaseFor(teamId: string): Phase {
    if (this.ball.loose) return "transition";
    return this.possessionTeamId === teamId ? "attack" : "defend";
  }

  // --- Spatial queries ------------------------------------------------------
  nearestOfTeam(teamId: string, point: Vec2, exclude?: string): PlayerAgent | undefined {
    let best: PlayerAgent | undefined;
    let bd = Infinity;
    for (const a of this.teams[teamId]!) {
      if (a.id === exclude) continue;
      const d = dist(a.pos, point);
      if (d < bd) {
        bd = d;
        best = a;
      }
    }
    return best;
  }

  nearestOpponentDistance(a: PlayerAgent): number {
    let bd = Infinity;
    for (const o of this.opponentsOf(a.teamId)) bd = Math.min(bd, dist(o.pos, a.pos));
    return bd;
  }

  /**
   * x-coordinate of a team's deepest OUTFIELD defender — the offside line and
   * the ceiling for their keeper's depth. Returned in absolute pitch x.
   */
  lastDefenderX(teamId: string): number {
    const dir = this.dirOf(teamId);
    let line = dir === 1 ? FIELD.LENGTH : 0;
    for (const d of this.teams[teamId]!) {
      if (d.isGK) continue;
      line = dir === 1 ? Math.min(line, d.pos.x) : Math.max(line, d.pos.x);
    }
    return line;
  }

  /**
   * IDs of `teamId` players in an OFFSIDE POSITION for a pass played from
   * `ballX`: strictly ahead of the ball, the halfway line AND the opponent's
   * deepest outfielder (the offside line). Judged at the instant of the pass.
   */
  offsidePositioned(teamId: string, ballX: number): string[] {
    const dir = this.dirOf(teamId);
    const line = this.lastDefenderX(this.otherTeam(teamId)); // opponent's deepest outfielder
    const half = FIELD.LENGTH / 2;
    const ids: string[] = [];
    // Clear-daylight margin: an attacker must be beyond the line by more than
    // this to be flagged (benefit of the doubt, like a real assistant ref) —
    // marginal/level positions are onside.
    const M = 1.5;
    for (const a of this.teams[teamId]!) {
      if (a.isGK) continue;
      const ax = a.pos.x;
      const beyond = (ref: number, m: number) => (dir === 1 ? ax > ref + m : ax < ref - m);
      if (beyond(line, M) && beyond(ballX, 0.3) && beyond(half, 0)) ids.push(a.id);
    }
    return ids;
  }

  /**
   * Transfer possession to an agent (reception, tackle win or keeper claim).
   * Handles pass-completion accounting and the first-touch settle timer.
   */
  giveBall(a: PlayerAgent, firstTouch: number): void {
    if (this.ball.pendingTeamId) {
      if (a.teamId === this.ball.pendingTeamId) {
        this.statsFor(a.teamId).passesCompleted += 1;
        this.telemetry.passComplete += 1;
      } else {
        this.telemetry.passIntercept += 1;
      }
    }
    this.ball.ownerId = a.id;
    this.ball.vel = { x: 0, y: 0 };
    this.ball.z = 0;
    this.ball.vz = 0;
    this.ball.lastTouchTeamId = a.teamId;
    this.ball.clearFlightMeta();
    this.possessionTeamId = a.teamId;
    // A keeper who claims the ball holds it for a few seconds before playing
    // out; outfielders settle at the team's tempo-derived first touch.
    a.controlTimer = a.isGK ? TEMPO.keeperHold : (this.firstTouch[a.teamId] ?? firstTouch);
  }

  /** Reset every player to their kick-off formation position (own half). */
  resetKickoff(): void {
    for (const a of this.agents) {
      a.pos = { ...a.kickoffHome };
      a.vel = { x: 0, y: 0 };
      a.controlTimer = 0;
      a.objective = null;
    }
  }

  /** Average position of a team's outfielders. */
  centroid(teamId: string): Vec2 {
    let x = 0;
    let y = 0;
    let n = 0;
    for (const a of this.teams[teamId]!) {
      if (a.isGK) continue;
      x += a.pos.x;
      y += a.pos.y;
      n++;
    }
    return n ? { x: x / n, y: y / n } : { ...FIELD.CENTRE };
  }
}
