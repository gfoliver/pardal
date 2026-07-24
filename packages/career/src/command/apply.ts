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

    case "setClubTactics": {
      const club = state.clubs[command.clubId];
      if (!club) return state;
      const next = {
        ...club,
        formation: command.formation ?? club.formation,
        mentality: command.mentality ?? club.mentality,
      };
      return { ...state, clubs: { ...state.clubs, [command.clubId]: next } };
    }

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

function withInbox(state: CareerState, map: (m: CareerState["inbox"][number]) => CareerState["inbox"][number]): CareerState {
  return { ...state, inbox: state.inbox.map(map) };
}
