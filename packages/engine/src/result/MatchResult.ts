import { type MatchEvent } from "./MatchEvent.js";
import { type TeamStats } from "./TeamStats.js";

/** How the winner (if any) was decided. */
export enum DecidedBy {
  Regulation = "regulation",
  ExtraTime = "extraTime",
  Shootout = "shootout",
  Aggregate = "aggregate",
  Draw = "draw",
}

export interface Score {
  readonly home: number;
  readonly away: number;
}

export interface MatchOutcome {
  /** Winner team id, or undefined for a draw (league). */
  readonly winnerTeamId?: string;
  readonly decidedBy: DecidedBy;
  /** Aggregate score when a `TieContext` was supplied. */
  readonly aggregate?: Score;
}

export interface DisciplineRecord {
  readonly yellowCards: number;
  readonly redCards: number;
  /** playerId → { yellow, red }. */
  readonly byPlayer: Readonly<Record<string, { yellow: number; red: boolean }>>;
}

/**
 * The complete, locale-agnostic result of a simulated match.
 */
export interface MatchResult {
  readonly seed: number;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  readonly homeTeamName: string;
  readonly awayTeamName: string;

  /** Goals scored on the pitch (regulation + extra time). */
  readonly homeScore: number;
  readonly awayScore: number;

  readonly regulationScore: Score;
  readonly extraTimeScore?: Score;
  readonly shootoutScore?: Score;

  readonly outcome: MatchOutcome;

  readonly timeline: readonly MatchEvent[];
  readonly discipline: DisciplineRecord;
  readonly stats: { readonly home: TeamStats; readonly away: TeamStats };
}
