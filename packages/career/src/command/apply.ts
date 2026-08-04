import { getFormationTemplate } from "@fut/domain";
import { activeTactic, type Club } from "../club/Club.js";
import { defaultRoleKey, type SavedTactic } from "../tactics/StoredTactics.js";
import { beginAssignment, capacityFor, promoteFromQueue, refuseAssignment } from "../scouting/ScoutingEngine.js";
import { nextId } from "../state/ids.js";
import { openNegotiation } from "../transfer/NegotiationEngine.js";
import { OFFER_WINDOW_DAYS, isOpen, lastFrom, type Negotiation } from "../transfer/Negotiation.js";
import type { TransferListing } from "../transfer/types.js";
import { absoluteDay } from "../time/tickDay.js";
import type { CareerState } from "../state/CareerState.js";
import type { CareerCommand } from "./CareerCommand.js";

/** A club may keep at most this many saved tactics. */
export const MAX_SAVED_TACTICS = 6;

/**
 * How many players we can watch at once — derived from the club's standing, never stored.
 *
 * A stored copy would be a second answer to a question that already has one, and a career in progress
 * would go on giving the old one after the rule changed.
 */
export const scoutCapacity = (state: CareerState): number =>
  capacityFor(state.clubs[state.managedClubId]?.reputation ?? 50);

/**
 * Move the queue up into whatever slots are free. Mutates, and is only ever called on a state object
 * this reducer has just built for itself — never on the one it was handed.
 */
function fillFreeSlots(next: CareerState): void {
  const mine = new Set(next.clubs[next.managedClubId]?.squad.playerIds ?? []);
  promoteFromQueue(next.scouting, {
    capacity: scoutCapacity(next),
    today: next.currentDate,
    todayAbsolute: absoluteDay(next),
    nextId: () => nextId(next, "watch"),
    isMine: (id) => mine.has(id),
  });
}

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

    case "assignScout": {
      // Every invariant lives here rather than in the façade, so a replayed log
      // converges to the same scouting slate no matter who issued it.
      const mine = state.clubs[state.managedClubId]?.squad.playerIds.includes(command.playerId) ?? false;
      if (refuseAssignment(state.scouting, command.playerId, mine)) return state;
      if (state.scouting.assignments.some((a) => a.id === command.id)) return state;
      // Full? Queued, in the order asked for. The command carries the same shape either way, so a
      // replay does not need to know which of the two happened at the time.
      if (state.scouting.assignments.length >= scoutCapacity(state)) {
        return { ...state, scouting: { ...state.scouting, queue: [...state.scouting.queue, command.playerId] } };
      }
      const assignment = beginAssignment(state.scouting, {
        id: command.id,
        playerId: command.playerId,
        today: state.currentDate,
        todayAbsolute: absoluteDay(state),
      });
      if (!assignment) return state;
      return { ...state, scouting: { ...state.scouting, assignments: [...state.scouting.assignments, assignment] } };
    }

    case "cancelScout": {
      const assignments = state.scouting.assignments.filter((a) => a.id !== command.assignmentId);
      // Deliberately no partial credit: pulling a scout off early teaches nothing.
      if (assignments.length === state.scouting.assignments.length) return state;
      // The freed slot is filled here rather than on the next tick, so cancelling one observation to
      // let the queue through is one gesture instead of one gesture and a wait.
      const scouting = { ...state.scouting, assignments };
      const next = { ...state, scouting };
      fillFreeSlots(next);
      return next;
    }

    case "unqueueScout": {
      const queue = state.scouting.queue.filter((id) => id !== command.playerId);
      return queue.length === state.scouting.queue.length ? state : { ...state, scouting: { ...state.scouting, queue } };
    }

    case "setShirtNumbers": {
      const squad = state.clubs[command.clubId]?.squad.playerIds;
      if (!squad) return state;
      const entries = Object.entries(command.numbers);
      const inSquad = new Set(squad);
      const legal = entries.every(([id, n]) => inSquad.has(id) && Number.isInteger(n) && n >= 1 && n <= 99);
      // A shirt belongs to one player. Rejecting the whole assignment rather
      // than silently keeping the last writer means the caller can't half-apply
      // a swap and leave two players on 10.
      const unique = new Set(entries.map(([, n]) => n)).size === entries.length;
      if (!legal || !unique) return state;
      return { ...state, shirtNumbers: { ...state.shirtNumbers, ...command.numbers } };
    }

    case "addTarget":
      return state.targetPlayerIds.includes(command.playerId)
        ? state
        : { ...state, targetPlayerIds: [...state.targetPlayerIds, command.playerId] };

    case "removeTarget":
      return state.targetPlayerIds.includes(command.playerId)
        ? { ...state, targetPlayerIds: state.targetPlayerIds.filter((id) => id !== command.playerId) }
        : state;

    case "openNegotiation": {
      const next = { ...state, negotiations: [...state.negotiations] };
      const n = openNegotiation(next, { id: command.id, playerId: command.playerId, fee: command.fee, todayAbsolute: absoluteDay(state) });
      if (!n) return state;
      next.negotiations.push(n);
      return next;
    }

    case "counterOffer":
      // Our reply resets the clock: the seller now owes US an answer.
      return withNegotiation(state, command.negotiationId, (n) => ({
        ...n,
        stage: "offered",
        rounds: [...n.rounds, { by: "buyer" as const, fee: command.fee, on: { ...state.currentDate } }],
        expiresDay: absoluteDay(state) + OFFER_WINDOW_DAYS,
      }));

    case "acceptCounter":
      return withNegotiation(state, command.negotiationId, (n) => {
        const ask = lastFrom(n, "seller");
        // Nothing to accept unless they've actually named a price.
        return ask && n.stage === "countered" ? { ...n, stage: "feeAgreed", agreedFee: ask.fee } : n;
      });

    case "withdrawOffer":
      return withNegotiation(state, command.negotiationId, (n) => (isOpen(n) ? { ...n, stage: "withdrawn" } : n));

    case "askFor":
      // Our price for one of our players. The buyer answers on a later day —
      // which is what turns a received offer into an actual negotiation.
      return withNegotiation(state, command.negotiationId, (n) =>
        n.stage === "offered" && n.sellerClubId === state.managedClubId
          ? {
              ...n,
              stage: "countered",
              rounds: [...n.rounds, { by: "seller" as const, fee: command.fee, on: { ...state.currentDate } }],
              expiresDay: absoluteDay(state) + OFFER_WINDOW_DAYS,
            }
          : n,
      );

    case "respondToBid":
      // An offer for OUR player. Accepting agrees the fee; the buying club then
      // settles terms with the player itself on the next tick.
      return withNegotiation(state, command.negotiationId, (n) => {
        if (n.stage !== "offered" || n.sellerClubId !== state.managedClubId) return n;
        const bid = lastFrom(n, "buyer");
        return command.accept && bid
          ? { ...n, stage: "feeAgreed", agreedFee: bid.fee }
          : { ...n, stage: "rejected", reason: "belowValuation" as const };
      });

    case "listPlayer": {
      const clubId = state.managedClubId;
      // Only our own players, and only a price that means something. A listing for
      // somebody else's player would advertise a sale we cannot make.
      if (!state.clubs[clubId]?.squad.playerIds.includes(command.playerId)) return state;
      if (!Number.isFinite(command.askingPrice) || command.askingPrice <= 0) return state;
      const existing = state.transfers.listings.find((l) => l.playerId === command.playerId && l.clubId === clubId);
      const listing: TransferListing = {
        playerId: command.playerId,
        clubId,
        askingPrice: Math.round(command.askingPrice),
        // Re-pricing keeps the original date: "listed since" is how long he has been
        // available, which changing the number does not undo.
        listedOn: existing?.listedOn ?? { ...state.currentDate },
        ...(command.loanOnly ? { loanOnly: true } : {}),
      };
      const rest = state.transfers.listings.filter((l) => l.playerId !== command.playerId);
      return { ...state, transfers: { ...state.transfers, listings: [...rest, listing] } };
    }

    case "unlistPlayer": {
      const listings = state.transfers.listings.filter((l) => l.playerId !== command.playerId);
      return listings.length === state.transfers.listings.length
        ? state
        : { ...state, transfers: { ...state.transfers, listings } };
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

/** Replace one negotiation, leaving the state untouched when nothing changed. */
function withNegotiation(state: CareerState, id: string, map: (n: Negotiation) => Negotiation): CareerState {
  const current = state.negotiations.find((n) => n.id === id);
  if (!current) return state;
  const next = map(current);
  return next === current ? state : { ...state, negotiations: state.negotiations.map((n) => (n.id === id ? next : n)) };
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
