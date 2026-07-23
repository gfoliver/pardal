import { Goalkeeper, type Player, positionGroup, PositionGroup, type RoleMovement } from "@fut/domain";
import { KINEMATICS } from "../config.js";
import type { SideDir } from "../field.js";
import { clamp, type Vec2 } from "../math.js";
import type { Line, Objective } from "../types.js";

/** Normalise a 1–99 attribute to 0..1. */
const norm = (a: number): number => clamp(a / 99, 0.01, 1);

/**
 * A player as a moving body on the pitch. Wraps the immutable domain `Player`
 * (attributes) and owns the mutable per-tick kinematic state plus the derived
 * physical capabilities the physics layer reads. Attribute access is funnelled
 * through normalised getters so the rest of the engine never touches the 1–99
 * scale directly.
 */
export class PlayerAgent {
  readonly id: string;
  readonly teamId: string;
  readonly dir: SideDir;
  readonly isGK: boolean;
  readonly line: Line;

  /** Base formation cell (normalised depth/width), resolved at build time. */
  readonly baseDepth: number;
  readonly baseWidth: number;
  /** Off-ball movement tendencies from the player's tactical role. */
  readonly role: RoleMovement;

  /** Kick-off position (own-half compressed formation). */
  readonly kickoffHome: Vec2;
  pos: Vec2;
  vel: Vec2 = { x: 0, y: 0 };

  /** Kinematic caps derived from attributes. */
  readonly maxSpeed: number;
  readonly accel: number;

  /** What the player is trying to do (set by the objective planner). */
  objective: Objective | null = null;
  /** Desired velocity for this physics step (set by the movement layer). */
  desiredVel: Vec2 = { x: 0, y: 0 };
  /** Seconds of first-touch settling remaining (0 = free to act/drive). */
  controlTimer = 0;

  constructor(
    player: Player,
    teamId: string,
    dir: SideDir,
    baseDepth: number,
    baseWidth: number,
    role: RoleMovement,
    home: Vec2,
  ) {
    this.player = player;
    this.id = player.id;
    this.teamId = teamId;
    this.dir = dir;
    this.isGK = player instanceof Goalkeeper || player.isGoalkeeper();
    this.baseDepth = baseDepth;
    this.baseWidth = baseWidth;
    this.role = role;
    this.kickoffHome = { ...home };
    this.pos = { ...home };
    this.line = this.isGK ? "gk" : baseDepth < 0.35 ? "def" : baseDepth < 0.62 ? "mid" : "fwd";

    const pace = norm(player.physical.pace);
    const agility = norm(player.physical.agility);
    const gkFactor = this.isGK ? KINEMATICS.keeperSpeedFactor : 1;
    this.maxSpeed = (KINEMATICS.baseSpeed + KINEMATICS.paceSpeed * pace) * gkFactor;
    this.accel = KINEMATICS.baseAccel + KINEMATICS.agilityAccel * agility;
  }

  readonly player: Player;

  get positionGroup(): PositionGroup {
    return positionGroup(this.player.position);
  }

  get speed(): number {
    return Math.hypot(this.vel.x, this.vel.y);
  }

  // --- Normalised attribute accessors (0..1) --------------------------------
  get passing(): number { return norm(this.player.technical.passing); }
  get technique(): number { return norm(this.player.technical.technique); }
  get dribbling(): number { return norm(this.player.technical.dribbling); }
  get finishing(): number { return norm(this.player.technical.finishing); }
  get shotPower(): number { return norm(this.player.technical.shotPower); }
  get tackling(): number { return norm(this.player.technical.tackling); }
  get marking(): number { return norm(this.player.technical.marking); }
  get vision(): number { return norm(this.player.mental.vision); }
  get decisions(): number { return norm(this.player.mental.decisions); }
  get composure(): number { return norm(this.player.mental.composure); }
  get positioning(): number { return norm(this.player.mental.positioning); }
  get anticipation(): number { return norm(this.player.mental.anticipation); }
  get workRate(): number { return norm(this.player.mental.workRate); }
  get teamwork(): number { return norm(this.player.mental.teamwork); }

  /** Goalkeeping reflexes (0..1), or a low default for outfielders. */
  get reflexes(): number {
    return this.player instanceof Goalkeeper ? norm(this.player.goalkeeping.reflexes) : 0.4;
  }

  /** Goalkeeping handling (0..1) — how cleanly the keeper catches vs parries. */
  get handling(): number {
    return this.player instanceof Goalkeeper ? norm(this.player.goalkeeping.handling) : 0.4;
  }
}
