import { getFormationTemplate } from "@fut/domain";
import type { Club } from "../club/Club.js";
import { defaultRoleKey, type StoredTactics } from "../tactics/StoredTactics.js";
import type { CareerState } from "../state/CareerState.js";
import type { CareerCommand } from "./CareerCommand.js";

/**
 * The single pure reducer for the career world: `apply(state, command)` returns
 * the NEXT state without mutating the input (structural sharing on unchanged
 * slices). Determinism is total — same (state, command) always yields the same
 * result — which is what lets a save replay and a server audit the log.
 */
export function apply(state: CareerState, command: CareerCommand): CareerState {
  switch (command.type) {
    case "readInbox":
      return withInbox(state, (m) => (m.id === command.messageId && !m.read ? { ...m, read: true } : m));

    case "archiveInbox":
      return { ...state, inbox: state.inbox.filter((m) => m.id !== command.messageId) };

    case "setFormation":
      return withClub(state, command.clubId, (c) => ({ ...c, formation: command.formation }));

    case "setMentality":
      return withClub(state, command.clubId, (c) => ({ ...c, mentality: command.mentality }));

    case "setInstructions":
      return withTactics(state, command.clubId, (t) => ({ ...t, instructions: { ...t.instructions, ...command.patch } }));

    case "setSlotPosition":
      return withTactics(state, command.clubId, (tac) => {
        const slots = [...(tac.slotPositions ?? [])];
        slots[command.slot] = { depth: command.depth, width: command.width };
        return { ...tac, slotPositions: slots };
      });

    case "setRole":
      return withTactics(state, command.clubId, (t) => ({ ...t, roles: { ...t.roles, [command.playerId]: command.roleKey } }));

    case "setTactics":
      return withClub(state, command.clubId, (c) => ({ ...c, tactics: command.tactics }));

    case "setLineupSlot":
      return withClub(state, command.clubId, (c) => (c.tactics ? { ...c, tactics: placeInSlot(c.tactics, c, command.slot, command.playerId) } : c));

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
 * a role (default for the slot's position). Pure — returns a new StoredTactics.
 */
function placeInSlot(t: StoredTactics, club: Club, slot: number, playerId: string): StoredTactics {
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
    const slotPos = getFormationTemplate(club.formation)[slot]?.position;
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

function withTactics(state: CareerState, clubId: string, map: (t: StoredTactics) => StoredTactics): CareerState {
  return withClub(state, clubId, (c) => (c.tactics ? { ...c, tactics: map(c.tactics) } : c));
}
