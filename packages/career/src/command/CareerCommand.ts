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
  | { readonly type: "selectTactic"; readonly clubId: string; readonly id: string };

export type CareerCommandType = CareerCommand["type"];
