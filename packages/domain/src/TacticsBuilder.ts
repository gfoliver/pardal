import { getFormationTemplate } from "./formations.js";
import { type Player } from "./Player.js";
import { DefaultRoleProvider } from "./roles/DefaultRoleProvider.js";
import { type Role } from "./roles/Role.js";
import {
  type BaseSlot,
  Formation,
  Tactics,
  type TeamInstructions,
} from "./Tactics.js";
import {
  Mentality,
  MarkingScheme,
  mentalityToAttackBias,
  Position,
} from "./types.js";

/**
 * Builds complete `Tactics` from minimal input. This is the seam that serves
 * the dual-mode UX: `simple()` needs only a formation + mentality (roles filled
 * automatically), while `advanced()` accepts explicit per-player role
 * assignments and instruction overrides. Either way the engine gets a full
 * `Tactics`, with no "mode" branching inside the engine.
 */
export class TacticsBuilder {
  constructor(private readonly roleProvider = new DefaultRoleProvider()) {}

  /** Simple mode: formation + mentality, default roles per position. */
  simple(
    startingXi: readonly Player[],
    options: { formation?: Formation; mentality?: Mentality } = {},
  ): Tactics {
    const mentality = options.mentality ?? Mentality.Balanced;
    const formation = options.formation ?? Formation.F442;
    const instructions = this.instructionsFor(formation, mentality);
    const assignments = new Map<string, Role>();
    const positions = new Map<string, Position>();
    const slots = slotMap(startingXi, formation);
    for (const player of startingXi) {
      assignments.set(player.id, this.roleProvider.defaultRoleFor(player.position));
      positions.set(player.id, player.position);
    }
    return new Tactics(instructions, assignments, positions, slots);
  }

  /**
   * Advanced mode: explicit roles and optional instruction overrides.
   * `positionByPlayerId` is where each player is actually being FIELDED — pass
   * it when that differs from their own position, so the engine applies the
   * familiarity cost of playing them there.
   */
  advanced(
    startingXi: readonly Player[],
    roleByPlayerId: ReadonlyMap<string, Role>,
    instructions: TeamInstructions,
    positionByPlayerId?: ReadonlyMap<string, Position>,
  ): Tactics {
    const assignments = new Map<string, Role>();
    const positions = new Map<string, Position>();
    const slots = slotMap(startingXi, instructions.formation);
    for (const player of startingXi) {
      const role =
        roleByPlayerId.get(player.id) ??
        this.roleProvider.defaultRoleFor(player.position);
      assignments.set(player.id, role);
      positions.set(player.id, positionByPlayerId?.get(player.id) ?? player.position);
    }
    return new Tactics(instructions, assignments, positions, slots);
  }

  /** Derives sensible default sliders from a mentality. */
  private instructionsFor(
    formation: Formation,
    mentality: Mentality,
  ): TeamInstructions {
    const attack = mentalityToAttackBias(mentality); // [-1, 1]
    const around = (base: number) =>
      Math.min(1, Math.max(0, base + attack * 0.2));
    return {
      formation,
      mentality,
      tempo: around(0.5),
      pressing: around(0.5),
      lineHeight: around(0.5),
      width: 0.5,
      directness: around(0.5),
      markingScheme: MarkingScheme.Zonal,
    };
  }
}

/** Maps each starter (by XI order) to its formation-template base cell. */
function slotMap(
  startingXi: readonly Player[],
  formation: Formation,
): Map<string, BaseSlot> {
  const template = getFormationTemplate(formation);
  const slots = new Map<string, BaseSlot>();
  startingXi.forEach((player, i) => {
    const slot = template[i];
    if (slot) slots.set(player.id, { depth: slot.depth, width: slot.width });
  });
  return slots;
}
