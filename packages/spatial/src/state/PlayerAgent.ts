import { Goalkeeper, type Player, type Position, positionGroup, PositionGroup, type RoleMovement } from "@fut/domain";
import { KINEMATICS, STAMINA } from "../config.js";
import { FIELD, type SideDir } from "../field.js";
import { clamp, type Vec2 } from "../math.js";
import type { Line, Objective } from "../types.js";

/** Normalise a 1–99 attribute to 0..1. */
const norm = (a: number): number => clamp(a / 99, 0.01, 1);

/** A player's place in the shape: where they stand and what they're asked to do. */
export interface AgentCell {
  readonly depth: number;
  readonly width: number;
  readonly role: RoleMovement;
  readonly roleKey: string;
  readonly fielded: Position;
}

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
  /** Which band of the shape the player belongs to — follows the base cell. */
  line: Line;

  /**
   * Base formation cell (normalised depth/width) and the tactical function on
   * top of it. Mutable because a manager can reshape the side mid-match (change
   * formation, drag a player to another cell, switch a role) — see
   * {@link reshape}. Everything positional derives from these, so a change takes
   * effect on the next planning tick with no rebuild.
   */
  baseDepth: number;
  baseWidth: number;
  /** Off-ball movement tendencies from the player's tactical role. */
  role: RoleMovement;
  /** Key of that role, kept so the UI can round-trip the manager's choice. */
  roleKey: string;
  /** The position the player is FIELDED at (their slot), not their natural one. */
  fielded: Position;

  /** Kick-off position (own-half compressed formation). */
  kickoffHome: Vec2;
  pos: Vec2;
  vel: Vec2 = { x: 0, y: 0 };

  /** Fresh (unfatigued) kinematic caps derived from attributes. */
  private readonly baseMaxSpeed: number;
  private readonly baseAccel: number;

  /**
   * Pre-match condition (0..1, 1 = fully fresh) — the starting stamina, set
   * from the athlete's workload/match-load before kick-off (future). `stamina`
   * is the live level that drains with distance covered during the match.
   */
  condition = 1;
  stamina = 1;

  /** What the player is trying to do (set by the objective planner). */
  objective: Objective | null = null;
  /** Desired velocity for this physics step (set by the movement layer). */
  desiredVel: Vec2 = { x: 0, y: 0 };
  /** Seconds of first-touch settling remaining (0 = free to act/drive). */
  controlTimer = 0;
  /** Bookings accumulated (2 → sent off). */
  yellowCards = 0;

  constructor(player: Player, teamId: string, dir: SideDir, cell: AgentCell) {
    this.player = player;
    this.id = player.id;
    this.teamId = teamId;
    this.dir = dir;
    this.isGK = player instanceof Goalkeeper || player.isGoalkeeper();
    this.baseDepth = cell.depth;
    this.baseWidth = cell.width;
    this.role = cell.role;
    this.roleKey = cell.roleKey;
    this.fielded = cell.fielded;
    this.line = PlayerAgent.lineOf(this.isGK, cell.depth);
    this.kickoffHome = PlayerAgent.cellPoint(dir, cell.depth, cell.width);
    this.pos = { ...this.kickoffHome };

    const pace = norm(player.physical.pace);
    const agility = norm(player.physical.agility);
    const gkFactor = this.isGK ? KINEMATICS.keeperSpeedFactor : 1;
    this.baseMaxSpeed = (KINEMATICS.baseSpeed + KINEMATICS.paceSpeed * pace) * gkFactor;
    this.baseAccel = KINEMATICS.baseAccel + KINEMATICS.agilityAccel * agility;
  }

  /** The band a cell belongs to (keepers aside, by how deep it sits). */
  private static lineOf(isGK: boolean, depth: number): Line {
    return isGK ? "gk" : depth < 0.35 ? "def" : depth < 0.62 ? "mid" : "fwd";
  }

  /**
   * A formation cell as a point on the pitch, with the whole shape compressed
   * into its own half (the kick-off arrangement). Width is mirrored for the away
   * side so "left/right" is always team-relative.
   */
  static cellPoint(dir: SideDir, depth: number, width: number): Vec2 {
    const ownGoalX = dir === 1 ? 0 : FIELD.LENGTH;
    return {
      x: ownGoalX + dir * (0.06 + depth * 0.44) * FIELD.LENGTH,
      y: dir === 1 ? width * FIELD.WIDTH : FIELD.WIDTH - width * FIELD.WIDTH,
    };
  }

  /**
   * Re-cell the player mid-match: a formation change, a drag to another cell, or
   * a new role. Only the base shape moves — the player keeps their current
   * position, momentum and fatigue, and walks into the new cell from wherever
   * they are, exactly as a real player would on being told to shift over.
   */
  reshape(cell: Partial<AgentCell>): void {
    if (cell.depth !== undefined) this.baseDepth = cell.depth;
    if (cell.width !== undefined) this.baseWidth = cell.width;
    if (cell.role) this.role = cell.role;
    if (cell.roleKey) this.roleKey = cell.roleKey;
    if (cell.fielded) this.fielded = cell.fielded;
    this.line = PlayerAgent.lineOf(this.isGK, this.baseDepth);
    this.kickoffHome = PlayerAgent.cellPoint(this.dir, this.baseDepth, this.baseWidth);
  }

  /** Speed/accel multiplier from current fatigue (fresh = 1, exhausted → floor). */
  get fatigueFactor(): number {
    return STAMINA.minFactor + (1 - STAMINA.minFactor) * this.stamina;
  }
  get maxSpeed(): number {
    return this.baseMaxSpeed * this.fatigueFactor;
  }
  get accel(): number {
    return this.baseAccel * this.fatigueFactor;
  }

  /** Drain stamina for distance covered (m); low-stamina attribute tires faster. */
  drainStamina(distanceM: number): void {
    const rate = STAMINA.drainPerM / (STAMINA.staminaRef + this.staminaAttr);
    this.stamina = Math.max(0, this.stamina - distanceM * rate);
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
  get crossing(): number { return norm(this.player.technical.crossing); }
  get strength(): number { return norm(this.player.physical.strength); }
  get agility(): number { return norm(this.player.physical.agility); }
  get staminaAttr(): number { return norm(this.player.physical.stamina); }
  get vision(): number { return norm(this.player.mental.vision); }
  get decisions(): number { return norm(this.player.mental.decisions); }
  get composure(): number { return norm(this.player.mental.composure); }
  get positioning(): number { return norm(this.player.mental.positioning); }
  get anticipation(): number { return norm(this.player.mental.anticipation); }
  get workRate(): number { return norm(this.player.mental.workRate); }
  get teamwork(): number { return norm(this.player.mental.teamwork); }

  /**
   * Aerial ability (0..1) — how well the player wins a header. No dedicated
   * heading/jumping attribute exists, so it's modelled from strength (hold-off
   * + spring), agility (leap + timing) and composure (winning the duel).
   */
  get aerial(): number {
    return this.strength * 0.45 + this.agility * 0.3 + this.composure * 0.25;
  }

  /** Goalkeeping reflexes (0..1), or a low default for outfielders. */
  get reflexes(): number {
    return this.player instanceof Goalkeeper ? norm(this.player.goalkeeping.reflexes) : 0.4;
  }

  /** Goalkeeping handling (0..1) — how cleanly the keeper catches vs parries. */
  get handling(): number {
    return this.player instanceof Goalkeeper ? norm(this.player.goalkeeping.handling) : 0.4;
  }
}
