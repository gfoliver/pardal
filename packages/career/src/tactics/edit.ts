import { getFormationTemplate, type Formation, type Mentality, type Position, type RoleKey } from "@fut/domain";
import { defaultRoleKey, type SavedTactic, type StoredInstructions } from "./StoredTactics.js";
import { TACTIC_PRESETS, type TacticPresetKey } from "./presets.js";

/**
 * Editing a tactic, as pure functions on one `SavedTactic`.
 *
 * These lived inside the career reducer's switch, which meant a tactic could only be edited BY A CAREER:
 * every rule about what a change implies — that reshaping costs familiarity, that the role follows the
 * fielded position, that placing a starter swaps rather than duplicates — was reachable only through a
 * command against a `CareerState` holding clubs, finances, a calendar and an inbox.
 *
 * A multiplayer friendly needs the same rules over a squad and nothing else. Extracted here rather than
 * reimplemented there, because two copies of "what does moving a player mean" would drift, and the day
 * they drifted the two modes would disagree about a tactic that looked identical on screen.
 *
 * The career reducer now calls these, so its command log converges exactly as before — the invariants
 * that belong to a career (the saved-slot cap, never deleting the last one, familiarity decay over time)
 * stay where they were, because they are about a club's history rather than about a tactic.
 */

/**
 * Changing shape costs familiarity with it, and picking the SAME formation costs nothing.
 *
 * The trade-off is the point: switching formation on a whim should hurt. A no-op re-dispatch (a client
 * echoing the current value back) must not, or a screen that re-sends its state on every render would
 * quietly grind a squad's drilling to the floor.
 */
export const FAMILIARITY_RESHAPE_COST = 15;
export const FAMILIARITY_RESHAPE_FLOOR = 20;

export function withFormation(t: SavedTactic, formation: Formation): SavedTactic {
  if (t.formation === formation) return t;
  return {
    ...t,
    formation,
    familiarity: Math.max(FAMILIARITY_RESHAPE_FLOOR, t.familiarity - FAMILIARITY_RESHAPE_COST),
  };
}

export const withMentality = (t: SavedTactic, mentality: Mentality): SavedTactic => ({ ...t, mentality });

export const withInstructions = (t: SavedTactic, patch: Partial<StoredInstructions>): SavedTactic => ({
  ...t,
  instructions: { ...t.instructions, ...patch },
});

/**
 * A named strategy, which is a mentality and every slider moved at once.
 *
 * Composed from the two setters rather than spread by hand, so a preset can never set a dial by a route
 * the individual controls do not use. An unknown key leaves the tactic alone: the picker only ever sends
 * keys from `TACTIC_PRESETS`, and inventing a shape for a name we do not know would be worse than
 * ignoring it.
 */
export function withPreset(t: SavedTactic, key: TacticPresetKey): SavedTactic {
  const preset = TACTIC_PRESETS.find((p) => p.key === key);
  if (!preset) return t;
  return withInstructions(withMentality(t, preset.mentality), preset.instructions);
}

/** A slot dragged away from where the formation template puts it. */
export function withSlotPosition(t: SavedTactic, slot: number, depth: number, width: number): SavedTactic {
  const slotPositions = [...(t.slotPositions ?? [])];
  slotPositions[slot] = { depth, width };
  return { ...t, slotPositions };
}

/**
 * A slot fielded at a position other than the template's.
 *
 * THE ROLE FOLLOWS: a poacher makes no sense at centre-back, so whoever is in the slot takes that
 * position's default role. Leaving the old role would field a player under instructions for a job he is
 * no longer doing.
 */
export function withSlotFielded(t: SavedTactic, slot: number, position: Position): SavedTactic {
  const slotFielded = [...(t.slotFielded ?? [])];
  slotFielded[slot] = position;
  const roles = { ...t.roles };
  const id = t.lineup[slot];
  if (id) roles[id] = defaultRoleKey(position);
  return { ...t, slotFielded, roles };
}

export const withRole = (t: SavedTactic, playerId: string, roleKey: RoleKey): SavedTactic => ({
  ...t,
  roles: { ...t.roles, [playerId]: roleKey },
});

/**
 * Put a player into a starting slot.
 *
 * Two cases, and conflating them is how a lineup ends up with ten men: a player already in the eleven
 * SWAPS with whoever is in the target slot, while one from outside it takes the slot and displaces its
 * occupant to the front of the bench — the front, because the man who just lost his place is the first
 * you would bring back on.
 *
 * A player with no role yet inherits the slot's default, so a substitution never fields somebody with no
 * instructions at all.
 */
export function withPlayerInSlot(t: SavedTactic, slot: number, playerId: string): SavedTactic {
  if (slot < 0 || slot >= t.lineup.length) return t;
  const current = t.lineup[slot]!;
  if (current === playerId) return t;
  const lineup = [...t.lineup];
  let bench = [...t.bench];
  const inXi = lineup.indexOf(playerId);
  if (inXi >= 0) {
    lineup[slot] = playerId;
    lineup[inXi] = current;
  } else {
    lineup[slot] = playerId;
    bench = [current, ...bench.filter((id) => id !== playerId)];
  }
  const roles = { ...t.roles };
  if (!roles[playerId]) {
    const slotPos = getFormationTemplate(t.formation)[slot]?.position;
    if (slotPos) roles[playerId] = defaultRoleKey(slotPos);
  }
  return { ...t, lineup, bench, roles };
}

/**
 * Put a player into a numbered place on the bench, within an ordering the caller has already computed.
 *
 * `pool` is the effective bench-then-reserves order, which is not stored anywhere: `t.bench` lists the
 * whole rest of the squad in preference order and only its first few actually dress. So the caller
 * resolves that ordering — the career from its view model, a friendly from its own squad list — and this
 * function does the swap. Returns the tactic unchanged when the move is meaningless.
 */
export function withPlayerOnBench(t: SavedTactic, pool: readonly string[], index: number, playerId: string): SavedTactic {
  const current = pool[index];
  if (current === undefined || current === playerId) return t;
  const from = pool.indexOf(playerId);
  if (from < 0) return t;
  const next = [...pool];
  next[from] = current;
  next[index] = playerId;
  return { ...t, bench: next };
}
