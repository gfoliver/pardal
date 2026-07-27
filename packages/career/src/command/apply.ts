import { getFormationTemplate } from "@fut/domain";
import { activeTactic, type Club } from "../club/Club.js";
import { defaultRoleKey, type SavedTactic } from "../tactics/StoredTactics.js";
import type { CareerState } from "../state/CareerState.js";
import type { CareerCommand } from "./CareerCommand.js";

/** A club may keep at most this many saved tactics. */
export const MAX_SAVED_TACTICS = 6;

/** Familiarity cost of changing a tactic's formation, and the floor it can't go below. */
const FAMILIARITY_RESHAPE_COST = 15;
const FAMILIARITY_RESHAPE_FLOOR = 20;

/**
 * The single pure reducer for the career world: `apply(state, command)` returns
 * the NEXT state without mutating the input (structural sharing on unchanged
 * slices). Determinism is total — same (state, command) always yields the same
 * result — which is what lets a save replay and a server audit the log.
 *
 * Named-tactic invariants (cap, no-op on unknown/duplicate ids, never deleting
 * the last slot) are enforced HERE rather than in the façade, so a replayed
 * command log always converges to the same state regardless of who issued it.
 */
export function apply(state: CareerState, command: CareerCommand): CareerState {
  switch (command.type) {
    case "readInbox":
      return withInbox(state, (m) => (m.id === command.messageId && !m.read ? { ...m, read: true } : m));

    case "archiveInbox":
      return { ...state, inbox: state.inbox.filter((m) => m.id !== command.messageId) };

    case "setFormation":
      // Reshaping the side costs familiarity with it — a real trade-off against
      // switching formation on a whim. Picking the SAME formation again (a
      // no-op re-dispatch) costs nothing.
      return withActiveTactic(state, command.clubId, (t) =>
        t.formation === command.formation
          ? t
          : { ...t, formation: command.formation, familiarity: Math.max(FAMILIARITY_RESHAPE_FLOOR, t.familiarity - FAMILIARITY_RESHAPE_COST) },
      );

    case "setMentality":
      return withActiveTactic(state, command.clubId, (t) => ({ ...t, mentality: command.mentality }));

    case "setInstructions":
      return withActiveTactic(state, command.clubId, (t) => ({ ...t, instructions: { ...t.instructions, ...command.patch } }));

    case "setSlotPosition":
      return withActiveTactic(state, command.clubId, (t) => {
        const slots = [...(t.slotPositions ?? [])];
        slots[command.slot] = { depth: command.depth, width: command.width };
        return { ...t, slotPositions: slots };
      });

    case "setSlotFielded":
      return withActiveTactic(state, command.clubId, (t) => {
        const fielded = [...(t.slotFielded ?? [])];
        fielded[command.slot] = command.position;
        // The role follows the position: a poacher makes no sense at centre-back,
        // so whoever fills the slot gets that position's default role.
        const roles = { ...t.roles };
        const id = t.lineup[command.slot];
        if (id) roles[id] = defaultRoleKey(command.position);
        return { ...t, slotFielded: fielded, roles };
      });

    case "setRole":
      return withActiveTactic(state, command.clubId, (t) => ({ ...t, roles: { ...t.roles, [command.playerId]: command.roleKey } }));

    case "setTactics":
      // Replaces only the StoredTactics portion — id/name/formation/mentality/
      // familiarity of the active slot are untouched.
      return withActiveTactic(state, command.clubId, (t) => ({ ...t, ...command.tactics }));

    case "setLineupSlot":
      return withActiveTactic(state, command.clubId, (t) => placeInSlot(t, command.slot, command.playerId));

    case "createTactic":
      return withClub(state, command.clubId, (c) => {
        if (c.tacticSlots.length >= MAX_SAVED_TACTICS) return c;
        if (c.tacticSlots.some((t) => t.id === command.id)) return c;
        const source = c.tacticSlots.find((t) => t.id === (command.sourceId ?? c.activeTacticId)) ?? activeTactic(c);
        const copy: SavedTactic = { ...source, id: command.id, name: command.name };
        return { ...c, tacticSlots: [...c.tacticSlots, copy], activeTacticId: command.id };
      });

    case "renameTactic": {
      const name = command.name.trim();
      if (!name) return state;
      return withClub(state, command.clubId, (c) => ({
        ...c,
        tacticSlots: c.tacticSlots.map((t) => (t.id === command.id ? { ...t, name } : t)),
      }));
    }

    case "deleteTactic":
      return withClub(state, command.clubId, (c) => {
        if (c.tacticSlots.length <= 1) return c;
        if (!c.tacticSlots.some((t) => t.id === command.id)) return c;
        const tacticSlots = c.tacticSlots.filter((t) => t.id !== command.id);
        const activeTacticId = c.activeTacticId === command.id ? tacticSlots[0]!.id : c.activeTacticId;
        return { ...c, tacticSlots, activeTacticId };
      });

    case "selectTactic":
      return withClub(state, command.clubId, (c) => (c.tacticSlots.some((t) => t.id === command.id) ? { ...c, activeTacticId: command.id } : c));

    default: {
      // Exhaustiveness guard — a new command variant must be handled here.
      const _never: never = command;
      return _never;
    }
  }
}

/** Apply a whole command log in order (fold). */
export function applyAll(state: CareerState, commands: readonly CareerCommand[]): CareerState {
  return commands.reduce(apply, state);
}

/**
 * Put `playerId` into XI slot `slot` (swap-aware). If the player is already in
 * the XI, swap the two slots; if on the bench, promote them and demote the
 * displaced starter to the front of the bench. Ensures the incoming player has
 * a role (default for the slot's position). Pure — returns a new SavedTactic.
 */
function placeInSlot(t: SavedTactic, slot: number, playerId: string): SavedTactic {
  if (slot < 0 || slot >= t.lineup.length) return t;
  const current = t.lineup[slot]!;
  if (current === playerId) return t;
  const lineup = [...t.lineup];
  let bench = [...t.bench];
  const xiIndex = lineup.indexOf(playerId);
  if (xiIndex >= 0) {
    lineup[slot] = playerId;
    lineup[xiIndex] = current;
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

function withInbox(state: CareerState, map: (m: CareerState["inbox"][number]) => CareerState["inbox"][number]): CareerState {
  return { ...state, inbox: state.inbox.map(map) };
}

function withClub(state: CareerState, clubId: string, map: (c: Club) => Club): CareerState {
  const club = state.clubs[clubId];
  if (!club) return state;
  return { ...state, clubs: { ...state.clubs, [clubId]: map(club) } };
}

/** Rewrite only the active tactic slot of a club, leaving the others untouched. */
function withActiveTactic(state: CareerState, clubId: string, map: (t: SavedTactic) => SavedTactic): CareerState {
  return withClub(state, clubId, (c) => ({
    ...c,
    tacticSlots: c.tacticSlots.map((t) => (t.id === c.activeTacticId ? map(t) : t)),
  }));
}
