import { type Zone } from "../pitch/Zone.js";

/** Structured event types. The engine emits these; i18n renders the text. */
export enum MatchEventType {
  Kickoff = "kickoff",
  HalfTime = "halfTime",
  FullTime = "fullTime",
  ExtraTimeStart = "extraTimeStart",
  Goal = "goal",
  Shot = "shot",
  Pass = "pass",
  Tackle = "tackle",
  Foul = "foul",
  Card = "card",
  Offside = "offside",
  Corner = "corner",
  ThrowIn = "throwIn",
  GoalKick = "goalKick",
  FreeKick = "freeKick",
  Penalty = "penalty",
  Substitution = "substitution",
  TacticChange = "tacticChange",
  ShootoutKick = "shootoutKick",
  Injury = "injury",
}

/** Card colours issued by the referee. */
export enum CardColor {
  Yellow = "yellow",
  Red = "red",
}

/**
 * A single timeline entry. Carries STRUCTURED data only — never a narration
 * string, so the same result renders in any locale (see @fut/i18n).
 */
export interface MatchEvent {
  readonly minute: number;
  readonly type: MatchEventType;
  readonly teamId?: string;
  readonly playerId?: string;
  readonly playerName?: string;
  readonly secondaryPlayerId?: string;
  readonly secondaryPlayerName?: string;
  readonly zone?: Zone;
  readonly params?: Readonly<Record<string, string | number | boolean>>;
}
