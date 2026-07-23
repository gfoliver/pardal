import type { Position } from "@fut/domain";
import type { Vec2 } from "./math.js";

/** Which vertical band of the formation a player belongs to. */
export type Line = "gk" | "def" | "mid" | "fwd";

/** The phase of play from a given team's perspective. */
export type Phase = "attack" | "defend" | "transition" | "kickoff";

/**
 * What a player is currently trying to DO off the ball (or on it). The
 * ObjectivePlanner assigns one per player each decision tick; the MovementSystem
 * turns it into a steering target. Kept coarse and emergent — positions come
 * from the spatial layers, not scripted waypoints.
 */
export type ObjectiveKind =
  | "onBall" // has the ball — utility AI decides the action
  | "support" // offer a forward/lateral passing option to the carrier
  | "attackDepth" // stretch the last line / make a run in behind
  | "provideWidth" // hold width to stretch the block
  | "holdShape" // sit in the SBSP home position
  | "press" // close down the ball carrier
  | "cover" // drop goal-side behind the presser
  | "markMan" // track an assigned opponent
  | "chaseLoose" // pursue a loose / in-flight ball
  | "keeper"; // goalkeeper positioning

export interface Objective {
  kind: ObjectiveKind;
  /** Steering target in metres (where the player wants to be). */
  target: Vec2;
  /** Optional opponent/teammate this objective is tied to. */
  refId?: string;
}

/** On-ball actions the utility AI chooses between. */
export type ActionKind = "pass" | "shoot" | "dribble" | "hold" | "clear";

/** A stoppage/restart type. */
export type RestartType = "kickoff" | "throwIn" | "goalKick" | "corner" | "freeKick" | "penalty";

/**
 * A dead-ball state: the ball is stopped at `spot`, players reposition for the
 * set piece, and `timer` counts down the pause before the restart is taken.
 */
export interface DeadBall {
  type: RestartType;
  /** Team taking the restart. */
  teamId: string;
  spot: Vec2;
  /** Seconds of pause remaining before the restart is played. */
  timer: number;
  takerId: string | null;
  /** Which goal line/side this relates to (for corners/goal kicks/penalties). */
  goalX?: number;
}

export interface SpatialPlayerView {
  id: string;
  teamId: string;
  pos: Position;
  /** Engine metres along the length: 0 = home goal line … 105 = away goal line. */
  x: number;
  /** Engine metres across the width: 0..68. */
  y: number;
  hasBall: boolean;
}

export interface SpatialSnapshot {
  minute: number;
  status: "kickoff" | "playing" | "halftime" | "finished";
  homeScore: number;
  awayScore: number;
  possessionTeamId: string;
  players: SpatialPlayerView[];
  /** Ball position in engine metres (x along length 0..105, y across 0..68). */
  ball: { x: number; y: number };
}
