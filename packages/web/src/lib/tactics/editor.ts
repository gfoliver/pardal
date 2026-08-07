import type { Formation, Mentality, Position, RoleKey } from "@fut/domain";
import type { StoredInstructions, TacticPresetKey, TacticsView } from "@fut/career";
import type { ClubKits } from "@fut/competition";

/**
 * Everything the tactics board needs, and nothing about where it comes from.
 *
 * The screen used to reach into `useCareer()` for fifteen commands and three reads, which meant the only
 * way to set up a side was to own a career: a multiplayer friendly has a squad and a tactic and no
 * calendar, no finances and no board. This interface is the seam. The career satisfies it by dispatching
 * commands, a friendly by editing a `SavedTactic` it holds in memory, and the board cannot tell the
 * difference — which is the point, because a second tactics screen would be a second set of bugs.
 *
 * NOT a lowest common denominator: the parts a friendly has no use for (saved tactics with names) are
 * optional, so the career keeps its full surface and the board simply hides what it is not given. A
 * union of two modes with different capabilities is the honest shape here — pretending a one-off match
 * has six saved formations would put buttons on screen that lead nowhere.
 */
export interface TacticsEditor {
  readonly view: TacticsView;
  /** Kit colours for the pitch, when the caller has them. */
  readonly kits?: ClubKits;
  /**
   * How well a player fits a position, 0..1 — drawn on every slot. Undefined where the caller cannot say,
   * which the board renders as nothing rather than as a zero: a missing measurement is not a bad fit.
   */
  fitAt(playerId: string, position: Position): number | undefined;

  setFormation(formation: Formation): void;
  setMentality(mentality: Mentality): void;
  /** A patch, matching the career command: the card sends only the dial that moved. */
  setInstruction(patch: Partial<StoredInstructions>): void;
  setLineupSlot(slot: number, playerId: string): void;
  setPlayerRole(playerId: string, roleKey: RoleKey): void;
  setSlotFielded(slot: number, position: Position): void;
  setSlotPosition(slot: number, depth: number, width: number): void;
  /**
   * A named strategy: mentality and every slider at once.
   *
   * Typed as the key union rather than `string`, because the one implementation that took a `string` was
   * free to do nothing with it — and did, silently, for the whole of a multiplayer friendly.
   */
  applyPreset(preset: TacticPresetKey): void;
  autoPickLineup(): void;

  /**
   * The named-tactic drawer, absent for a mode that has no saved tactics.
   *
   * A friendly is one match with one shape; a career keeps up to six and switches between them. Omitted
   * rather than stubbed, so the board can leave the control out instead of showing one that does nothing.
   */
  readonly saved?: {
    select(id: string): void;
    create(): void;
    duplicate(id: string): void;
    rename(id: string, name: string): void;
    remove(id: string): void;
  };
}
