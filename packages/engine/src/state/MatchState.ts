import {
  type MatchRules,
  type Player,
  type Position,
  positionAdvancement,
  type SubstitutionRules,
  type Tactics,
  type Team,
  type TieContext,
} from "@fut/domain";
import { PitchGrid, type TeamSide } from "../pitch/PitchGrid.js";
import { type Zone } from "../pitch/Zone.js";
import { createTeamStats, type TeamStats } from "../result/TeamStats.js";

/** Dynamic per-player state during the match (fatigue, bookings, on/off pitch). */
export interface PlayerMatchState {
  fatigue: number;
  yellowCards: number;
  sentOff: boolean;
  injured: boolean;
  onPitch: boolean;
}

/** A tactic change scheduled by a coach, pending its assimilation delay. */
export interface PendingTacticChange {
  readonly tactics: Tactics;
  readonly effectiveMinute: number;
}

/** Which period of play is currently running. */
export enum Period {
  FirstHalf = "firstHalf",
  SecondHalf = "secondHalf",
  ExtraFirst = "extraFirst",
  ExtraSecond = "extraSecond",
}

/**
 * The single source of truth for a match in progress. Knows possession, the
 * ball's zone, the zone of every one of the 22 players, active tactics, fatigue
 * and bookings. Mutated in place by the simulator's stages.
 */
export class MatchState {
  readonly grid = new PitchGrid();

  minute = 0;
  period: Period = Period.FirstHalf;

  possessionTeamId: string;
  ballCarrierId: string;
  ballZone: Zone;

  /** Last completed pass/cross, used to credit assists on the next goal. */
  lastPassId: string | undefined = undefined;
  lastPassTeamId: string | undefined = undefined;
  lastPassType: "pass" | "cross" | undefined = undefined;

  readonly score = { home: 0, away: 0 };
  readonly stats: { home: TeamStats; away: TeamStats } = {
    home: createTeamStats(),
    away: createTeamStats(),
  };

  /** playerId → current zone (all 22 on-pitch players). */
  readonly positions = new Map<string, Zone>();
  readonly playerStates = new Map<string, PlayerMatchState>();
  private readonly activeTactics = new Map<string, Tactics>();
  readonly pendingTacticChange = new Map<string, PendingTacticChange>();

  /** teamId → ordered list of players currently on the pitch. */
  private readonly onPitch = new Map<string, Player[]>();
  private readonly roster = new Map<string, { player: Player; teamId: string }>();
  /** playerId → the position they are fielded at (may be out of position). */
  private readonly fieldedPosition = new Map<string, Position>();

  constructor(
    readonly homeTeam: Team,
    readonly awayTeam: Team,
    readonly rules: MatchRules,
    readonly substitutionRules: SubstitutionRules,
    readonly tieContext: TieContext | undefined,
  ) {
    this.registerTeam(homeTeam);
    this.registerTeam(awayTeam);
    this.activeTactics.set(homeTeam.id, homeTeam.tactics);
    this.activeTactics.set(awayTeam.id, awayTeam.tactics);
    this.onPitch.set(homeTeam.id, [...homeTeam.startingXi]);
    this.onPitch.set(awayTeam.id, [...awayTeam.startingXi]);

    // Kickoff: the ball starts on the centre spot with the home team's most
    // advanced player (a forward taps off), never the goalkeeper.
    this.possessionTeamId = homeTeam.id;
    const kickoffTaker = [...homeTeam.startingXi].sort(
      (a, b) =>
        positionAdvancement(this.fieldedPositionOf(b.id)) -
        positionAdvancement(this.fieldedPositionOf(a.id)),
    )[0]!;
    this.ballCarrierId = kickoffTaker.id;
    this.ballZone = this.grid.center();
  }

  private registerTeam(team: Team): void {
    for (const p of [...team.startingXi, ...team.bench]) {
      this.roster.set(p.id, { player: p, teamId: team.id });
    }
    for (const p of team.startingXi) {
      this.playerStates.set(p.id, {
        fatigue: 0,
        yellowCards: 0,
        sentOff: false,
        injured: false,
        onPitch: true,
      });
      this.fieldedPosition.set(p.id, team.tactics.positionFor(p.id) ?? p.position);
    }
    for (const p of team.bench) {
      this.playerStates.set(p.id, {
        fatigue: 0,
        yellowCards: 0,
        sentOff: false,
        injured: false,
        onPitch: false,
      });
    }
  }

  sideOf(teamId: string): TeamSide {
    return teamId === this.homeTeam.id ? "home" : "away";
  }

  teamIdOf(side: TeamSide): string {
    return side === "home" ? this.homeTeam.id : this.awayTeam.id;
  }

  teamOf(teamId: string): Team {
    return teamId === this.homeTeam.id ? this.homeTeam : this.awayTeam;
  }

  opponentOf(teamId: string): string {
    return teamId === this.homeTeam.id ? this.awayTeam.id : this.homeTeam.id;
  }

  getPlayer(playerId: string): Player | undefined {
    return this.roster.get(playerId)?.player;
  }

  /** The position a player is currently fielded at (its natural one by default). */
  fieldedPositionOf(playerId: string): Position {
    const fielded = this.fieldedPosition.get(playerId);
    if (fielded) return fielded;
    return this.getPlayer(playerId)!.position;
  }

  /** Attribute multiplier for a player given where they're fielded (out-of-position debuff). */
  familiarityOf(playerId: string): number {
    const player = this.getPlayer(playerId);
    if (!player) return 1;
    return player.familiarity(this.fieldedPositionOf(playerId));
  }

  teamIdForPlayer(playerId: string): string | undefined {
    return this.roster.get(playerId)?.teamId;
  }

  onPitchPlayers(teamId: string): readonly Player[] {
    return this.onPitch.get(teamId) ?? [];
  }

  statsFor(teamId: string): TeamStats {
    return teamId === this.homeTeam.id ? this.stats.home : this.stats.away;
  }

  scoreFor(teamId: string): number {
    return teamId === this.homeTeam.id ? this.score.home : this.score.away;
  }

  addGoal(teamId: string): void {
    if (teamId === this.homeTeam.id) this.score.home += 1;
    else this.score.away += 1;
    this.statsFor(teamId).goals += 1;
  }

  tacticsFor(teamId: string): Tactics {
    return this.activeTactics.get(teamId)!;
  }

  setTactics(teamId: string, tactics: Tactics): void {
    this.activeTactics.set(teamId, tactics);
  }

  playerState(playerId: string): PlayerMatchState {
    return this.playerStates.get(playerId)!;
  }

  private removeFromPitch(playerId: string): void {
    const teamId = this.teamIdForPlayer(playerId);
    if (!teamId) return;
    const list = this.onPitch.get(teamId);
    if (list) {
      const idx = list.findIndex((p) => p.id === playerId);
      if (idx >= 0) list.splice(idx, 1);
    }
    this.playerState(playerId).onPitch = false;
    this.positions.delete(playerId);
  }

  /** Remove a player from the pitch (sending-off). */
  sendOff(playerId: string): void {
    this.removeFromPitch(playerId);
    this.playerState(playerId).sentOff = true;
  }

  /** Remove an injured player who cannot be (or was not) replaced. */
  removeInjured(playerId: string): void {
    this.removeFromPitch(playerId);
    this.playerState(playerId).injured = true;
  }

  /** Replace a player on the pitch with one from the bench (substitution). */
  swapOnPitch(teamId: string, outId: string, inId: string): void {
    const list = this.onPitch.get(teamId);
    if (!list) return;
    const idx = list.findIndex((p) => p.id === outId);
    const incoming = this.getPlayer(inId);
    if (idx < 0 || !incoming) return;
    list[idx] = incoming;
    this.playerState(outId).onPitch = false;
    this.playerState(inId).onPitch = true;
    // The substitute inherits the slot (zone + fielded position) of the player off.
    const z = this.positions.get(outId);
    if (z) this.positions.set(inId, z);
    this.fieldedPosition.set(inId, this.fieldedPosition.get(outId) ?? incoming.position);
  }
}
