import { type Role } from "./roles/Role.js";
import { Mentality, MarkingScheme, Position } from "./types.js";

/** Common formations. Used for the base positional shape and display. */
export enum Formation {
  F442 = "4-4-2",
  F442Diamond = "4-4-2-diamond",
  F433 = "4-3-3",
  F4231 = "4-2-3-1",
  F424 = "4-2-4",
  F352 = "3-5-2",
  F532 = "5-3-2",
  F343 = "3-4-3",
  F541 = "5-4-1",
}

/** A player's base cell on the pitch, in normalised coordinates [0, 1]. */
export interface BaseSlot {
  /** 0 = own goal … 1 = opponent goal. */
  readonly depth: number;
  /** 0 = own left touchline … 1 = own right touchline. */
  readonly width: number;
}

/** Team-level tactical instructions. All sliders are in [0, 1]. */
export interface TeamInstructions {
  readonly formation: Formation;
  readonly mentality: Mentality;
  readonly tempo: number;
  readonly pressing: number;
  readonly lineHeight: number;
  readonly width: number;
  readonly directness: number;
  readonly markingScheme: MarkingScheme;
}

/**
 * Full tactics for a team in a match: team-level instructions plus the
 * per-player role assignments. The engine always receives a *complete*
 * `Tactics` (roles resolved); the "simple mode" merely fills roles via
 * `TacticsBuilder` + `DefaultRoleProvider`.
 */
export class Tactics {
  constructor(
    public readonly instructions: TeamInstructions,
    /** playerId → assigned Role. */
    private readonly roleAssignments: ReadonlyMap<string, Role>,
    /** playerId → fielded position (may differ from the player's natural one). */
    private readonly positionAssignments: ReadonlyMap<string, Position> = new Map(),
    /** playerId → base cell on the pitch (normalised depth/width). */
    private readonly slotAssignments: ReadonlyMap<string, BaseSlot> = new Map(),
  ) {}

  /** The role assigned to a player, or `undefined` if unassigned. */
  roleFor(playerId: string): Role | undefined {
    return this.roleAssignments.get(playerId);
  }

  /** The position a player is fielded at, or `undefined` if unassigned. */
  positionFor(playerId: string): Position | undefined {
    return this.positionAssignments.get(playerId);
  }

  /** The player's base cell on the pitch, or `undefined` if unassigned. */
  baseSlot(playerId: string): BaseSlot | undefined {
    return this.slotAssignments.get(playerId);
  }

  /** Returns a copy fielding a player at a (possibly out-of-position) slot. */
  withPosition(playerId: string, position: Position): Tactics {
    const next = new Map(this.positionAssignments);
    next.set(playerId, position);
    return new Tactics(this.instructions, this.roleAssignments, next, this.slotAssignments);
  }

  /** Returns a copy moving a player's base cell (for custom tactics). */
  withSlot(playerId: string, slot: BaseSlot): Tactics {
    const next = new Map(this.slotAssignments);
    next.set(playerId, slot);
    return new Tactics(this.instructions, this.roleAssignments, this.positionAssignments, next);
  }

  /** Returns a copy with some instructions overridden (immutability-friendly). */
  withInstructions(patch: Partial<TeamInstructions>): Tactics {
    return new Tactics(
      { ...this.instructions, ...patch },
      this.roleAssignments,
      this.positionAssignments,
      this.slotAssignments,
    );
  }

  /** Returns a copy with a player's role overridden. */
  withRole(playerId: string, role: Role): Tactics {
    const next = new Map(this.roleAssignments);
    next.set(playerId, role);
    return new Tactics(this.instructions, next, this.positionAssignments, this.slotAssignments);
  }
}
