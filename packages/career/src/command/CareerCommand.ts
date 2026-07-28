import type { Formation, Mentality, Position, RoleKey } from "@fut/domain";
import type { StoredInstructions, StoredTactics } from "../tactics/StoredTactics.js";

/**
 * The closed set of state mutations. Every change to a career flows through one
 * of these — serializable, ordered, and (for stochastic ones) seed-stamped — so
 * the command log fully reproduces a save and a server can re-apply/audit it.
 *
 * Tactics edits are split into small pure commands (no dataset access needed);
 * the one data-derived case (auto-pick) is resolved in the façade and stored via
 * `setTactics`.
 */
export type CareerCommand =
  | { readonly type: "readInbox"; readonly messageId: string }
  | { readonly type: "archiveInbox"; readonly messageId: string }
  | { readonly type: "setFormation"; readonly clubId: string; readonly formation: Formation }
  | { readonly type: "setMentality"; readonly clubId: string; readonly mentality: Mentality }
  | { readonly type: "setInstructions"; readonly clubId: string; readonly patch: Partial<StoredInstructions> }
  | { readonly type: "setLineupSlot"; readonly clubId: string; readonly slot: number; readonly playerId: string }
  | { readonly type: "setSlotPosition"; readonly clubId: string; readonly slot: number; readonly depth: number; readonly width: number }
  | { readonly type: "setSlotFielded"; readonly clubId: string; readonly slot: number; readonly position: Position }
  | { readonly type: "setRole"; readonly clubId: string; readonly playerId: string; readonly roleKey: RoleKey }
  | { readonly type: "setTactics"; readonly clubId: string; readonly tactics: StoredTactics }
  // Named tactics: the id always arrives IN the command (facade-generated),
  // so a replayed log produces the same ids every time.
  | { readonly type: "createTactic"; readonly clubId: string; readonly id: string; readonly name: string; readonly sourceId?: string }
  | { readonly type: "renameTactic"; readonly clubId: string; readonly id: string; readonly name: string }
  | { readonly type: "deleteTactic"; readonly clubId: string; readonly id: string }
  | { readonly type: "selectTactic"; readonly clubId: string; readonly id: string }
  // Scouting. The assignment id arrives in the command (minted from the state's
  // own counter), so a replayed log schedules and delivers the same reports.
  | { readonly type: "assignScout"; readonly id: string; readonly playerId: string }
  | { readonly type: "cancelScout"; readonly assignmentId: string }
  | { readonly type: "addTarget"; readonly playerId: string }
  | { readonly type: "removeTarget"; readonly playerId: string }
  /**
   * Squad numbers for a club, as a COMPLETE assignment rather than one edit.
   *
   * The reducer can't see the dataset, so it couldn't tell whether a single new
   * number clashed with a squad-mate still wearing his registered one. Sending
   * the whole map lets the "no two players share a number" invariant be checked
   * where every other invariant lives — in the reducer — instead of being
   * enforced only by whichever screen happened to call it.
   */
  | { readonly type: "setShirtNumbers"; readonly clubId: string; readonly numbers: Readonly<Record<string, number>> }
  // Transfers. Like scouting, the negotiation id arrives in the command.
  | { readonly type: "openNegotiation"; readonly id: string; readonly playerId: string; readonly fee: number }
  | { readonly type: "counterOffer"; readonly negotiationId: string; readonly fee: number }
  | { readonly type: "acceptCounter"; readonly negotiationId: string }
  | { readonly type: "withdrawOffer"; readonly negotiationId: string }
  | { readonly type: "respondToBid"; readonly negotiationId: string; readonly accept: boolean }
  /** Name our price for a player another club has bid for. */
  | { readonly type: "askFor"; readonly negotiationId: string; readonly fee: number };

export type CareerCommandType = CareerCommand["type"];
