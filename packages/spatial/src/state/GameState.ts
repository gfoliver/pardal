import {
  createTeamStats,
  type MatchEvent,
  type TeamStats,
} from "@fut/engine";
import { DefaultRoleProvider, type Player, positionGroup, type Team } from "@fut/domain";
import { TEMPO } from "../config.js";
import { FIELD, type SideDir } from "../field.js";
import { dist, type Vec2 } from "../math.js";
import type { DeadBall, Line, Phase } from "../types.js";
import { Ball } from "./Ball.js";
import { type AgentCell, PlayerAgent } from "./PlayerAgent.js";

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
  /** Unused bench players per team (available to bring on). */
  private readonly benches: Record<string, Player[]> = {};

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
    shotBigChance: 0, // shots from < 16 m, unpressured, down an open lane
    keeperSave: 0, // on-target shots the keeper kept out (any outcome)
    keeperSaveCaught: 0, // …of which held cleanly rather than parried
    /**
     * WHO IS INVOLVED — ball receptions, pass attempts and shots per band of the
     * shape. Real football's distribution is lopsided the other way from what an
     * engine tends to produce: a centre-back touches the ball far more often than
     * a striker does, because possession is worked through the back and midfield.
     * A forward-heavy touch share means the attack is being played THROUGH the
     * attackers instead of built by the side.
     */
    touches: { gk: 0, def: 0, mid: 0, fwd: 0 } as Record<Line, number>,
    passesBy: { gk: 0, def: 0, mid: 0, fwd: 0 } as Record<Line, number>,
    shotsBy: { gk: 0, def: 0, mid: 0, fwd: 0 } as Record<Line, number>,
    /**
     * …and the same by the position each player is FIELDED at, because a band is
     * too coarse to compare with real football: "attack" holds wingers as well as
     * strikers, and a winger legitimately touches the ball far more often than a
     * centre-forward. Centre-back versus striker is the comparison that means
     * something (real football ≈ 2–3 touches for the defender to the striker's one).
     */
    touchesByPos: {} as Record<string, number>,
    /**
     * WHICH WAY THE BALL GOES, and how long a side keeps it. Real football plays
     * roughly a third of its passes square or backwards, in spells averaging
     * several passes; a side that only ever plays forward is not building, it is
     * forcing, and the ball comes straight back.
     */
    tackleAttempt: 0, // challenges committed to (won or not)
    /**
     * Passes attempted and completed by the third of the pitch they were played
     * FROM (own third, middle, final third). Real football's completion falls away
     * sharply up the pitch — around 92% at the back, 85% in midfield, under 70% in
     * the final third, because that is where the bodies are. A flat completion rate
     * means the crowded end of the pitch is not crowded.
     */
    passByThird: [0, 0, 0],
    passCompleteByThird: [0, 0, 0],
    passForward: 0, // gained more than 3 m up-pitch
    passSquare: 0, // within 3 m either way
    passBack: 0, // lost more than 3 m
    possessionSpells: 0, // times the ball changed hands to a new side
  };

  /** Which third of the pitch an x sits in, from `dir`'s point of view (0 = own). */
  thirdOf(x: number, dir: SideDir): 0 | 1 | 2 {
    const adv = dir === 1 ? x : FIELD.LENGTH - x;
    return adv < FIELD.LENGTH / 3 ? 0 : adv < (FIELD.LENGTH * 2) / 3 ? 1 : 2;
  }

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
    this.benches[team.id] = [...team.bench];
    for (const p of team.startingXi) {
      const slot = team.tactics.baseSlot(p.id);
      const role = team.tactics.roleFor(p.id) ?? roleFallback.defaultRoleFor(p.position);
      const agent = new PlayerAgent(p, team.id, dir, {
        depth: slot ? slot.depth : 0.1,
        width: slot ? slot.width : 0.5,
        role: role.movement,
        roleKey: role.key,
        fielded: team.tactics.positionFor(p.id) ?? p.position,
      });
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
        // Credit the completion to the third the pass was played FROM.
        this.telemetry.passCompleteByThird[this.thirdOf(this.ball.releaseFrom.x, this.dirOf(this.ball.pendingTeamId))] += 1;
      } else {
        this.telemetry.passIntercept += 1;
      }
    }
    this.telemetry.touches[a.line] += 1;
    this.telemetry.touchesByPos[a.fielded] = (this.telemetry.touchesByPos[a.fielded] ?? 0) + 1;
    if (this.possessionTeamId !== a.teamId) this.telemetry.possessionSpells += 1;
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

  /** Remove an agent from the pitch (sending-off) — team plays a man down. */
  removeAgent(id: string): void {
    const a = this.byId.get(id);
    if (!a) return;
    this.byId.delete(id);
    const ai = this.agents.indexOf(a);
    if (ai >= 0) this.agents.splice(ai, 1);
    const team = this.teams[a.teamId]!;
    const ti = team.indexOf(a);
    if (ti >= 0) team.splice(ti, 1);
    if (this.ball.ownerId === id) this.ball.ownerId = null;
  }

  /**
   * Bring a bench player on in place of `outId`, inheriting its formation slot
   * and role. Picks a bench player in the same position group when possible.
   * Returns the incoming agent, or null if no bench player is available.
   */
  substitute(outId: string, inId?: string): { off: PlayerAgent; on: PlayerAgent } | null {
    const off = this.byId.get(outId);
    if (!off) return null;
    const bench = this.benches[off.teamId]!;
    if (bench.length === 0) return null;
    let idx: number;
    if (inId) {
      // A specific requested player (user sub) — must be on this team's bench.
      idx = bench.findIndex((p) => p.id === inId);
    } else {
      // Prefer a same-group replacement; keepers only replace keepers.
      idx = bench.findIndex((p) => positionGroup(p.position) === off.positionGroup && p.isGoalkeeper() === off.isGK);
      if (idx < 0) idx = bench.findIndex((p) => !p.isGoalkeeper() && !off.isGK);
    }
    if (idx < 0) return null;
    const [inPlayer] = bench.splice(idx, 1);
    const on = new PlayerAgent(inPlayer!, off.teamId, off.dir, {
      depth: off.baseDepth,
      width: off.baseWidth,
      role: off.role,
      roleKey: off.roleKey,
      fielded: off.fielded,
    });
    on.pos = { ...off.pos }; // walks on where the player they replace stood
    on.condition = 1;
    on.stamina = 1; // a fresh sub
    this.byId.set(on.id, on);
    this.agents.push(on);
    const team = this.teams[off.teamId]!;
    team.splice(team.indexOf(off), 1, on);
    this.byId.delete(off.id);
    const ai = this.agents.indexOf(off);
    if (ai >= 0) this.agents.splice(ai, 1);
    if (this.ball.ownerId === off.id) this.ball.ownerId = null;
    return { off, on };
  }

  /** Bench players still available to bring on for a team. */
  benchPlayers(teamId: string): readonly Player[] {
    return this.benches[teamId] ?? [];
  }

  /** Move a player's base cell / role mid-match (see {@link PlayerAgent.reshape}). */
  reshapeAgent(playerId: string, cell: Partial<AgentCell>): boolean {
    const a = this.byId.get(playerId);
    if (!a) return false;
    a.reshape(cell);
    return true;
  }

  /**
   * Swap two team-mates' places in the shape — cell, role and fielded position
   * all move with the slot, so a full-back and a winger genuinely change jobs.
   *
   * The keeper is not part of that: only another goalkeeper can take the gloves,
   * so an outfielder can never be swapped into goal (to put a keeper outfield,
   * substitute).
   */
  swapCells(aId: string, bId: string): boolean {
    const a = this.byId.get(aId);
    const b = this.byId.get(bId);
    if (!a || !b || a === b || a.teamId !== b.teamId) return false;
    if (a.isGK !== b.isGK) return false;
    const aCell: AgentCell = { depth: a.baseDepth, width: a.baseWidth, role: a.role, roleKey: a.roleKey, fielded: a.fielded };
    a.reshape({ depth: b.baseDepth, width: b.baseWidth, role: b.role, roleKey: b.roleKey, fielded: b.fielded });
    b.reshape(aCell);
    return true;
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
