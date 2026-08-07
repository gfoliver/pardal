import { describe, expect, it } from "vitest";
import { Formation, MarkingScheme, Mentality, Position, RoleKey, getFormationTemplate } from "@fut/domain";
import {
  FAMILIARITY_RESHAPE_COST,
  FAMILIARITY_RESHAPE_FLOOR,
  withFormation,
  withInstructions,
  withMentality,
  withPlayerInSlot,
  withPlayerOnBench,
  withRole,
  withPreset,
  withSlotFielded,
  withSlotPosition,
  matchPreset,
  TACTIC_PRESETS,
  type SavedTactic,
  type TacticPresetKey,
} from "../src/index.js";

/**
 * A tactic edited with NO CAREER in sight.
 *
 * That is the point of the module, and the reason these tests exist separately from the command tests: the
 * rules used to live inside the career reducer's switch, so the only way to reshape a side was to own a
 * `CareerState` with clubs, finances, a calendar and an inbox. A multiplayer friendly has a squad and a
 * tactic and nothing else, and it must get the same answers — two implementations of "what does moving a
 * player mean" would drift, and the two modes would then disagree about a tactic identical on screen.
 *
 * The career's own command tests still cover the same ground through the reducer, which is what makes this
 * an extraction rather than a rewrite: both paths, one set of rules.
 */

const XI = getFormationTemplate(Formation.F442).map((_, i) => `p${i + 1}`);

const tactic = (over: Partial<SavedTactic> = {}): SavedTactic => ({
  id: "t1",
  name: "Padrão",
  formation: Formation.F442,
  mentality: Mentality.Balanced,
  familiarity: 80,
  lineup: [...XI],
  bench: ["b1", "b2", "b3", "b4", "b5"],
  roles: Object.fromEntries(XI.map((id) => [id, RoleKey.Goalkeeper])) as SavedTactic["roles"],
  instructions: { tempo: 0.5, pressing: 0.5, lineHeight: 0.5, width: 0.5, directness: 0.5, markingScheme: MarkingScheme.Zonal },
  ...over,
});

describe("reshaping the side", () => {
  it("costs familiarity, because switching shape on a whim should hurt", () => {
    const after = withFormation(tactic({ familiarity: 80 }), Formation.F433);
    expect(after.formation).toBe(Formation.F433);
    expect(after.familiarity).toBe(80 - FAMILIARITY_RESHAPE_COST);
  });

  it("costs NOTHING when the formation is the one already picked", () => {
    // A screen that re-sends its own state on render would otherwise grind a squad's drilling to the
    // floor without anybody choosing anything.
    const before = tactic({ familiarity: 80 });
    expect(withFormation(before, Formation.F442)).toBe(before);
  });

  it("never pushes familiarity below the floor, however many changes of mind", () => {
    let t = tactic({ familiarity: 30 });
    for (const f of [Formation.F433, Formation.F442, Formation.F352]) t = withFormation(t, f);
    expect(t.familiarity).toBe(FAMILIARITY_RESHAPE_FLOOR);
  });
});

describe("putting somebody in a starting slot", () => {
  it("SWAPS two starters, rather than fielding one man twice", () => {
    const after = withPlayerInSlot(tactic(), 0, "p11");
    expect(after.lineup[0]).toBe("p11");
    expect(after.lineup[10]).toBe("p1");
    expect(new Set(after.lineup).size).toBe(11);
  });

  it("drops the displaced starter to the FRONT of the bench, where he is first back on", () => {
    const after = withPlayerInSlot(tactic(), 3, "b2");
    expect(after.lineup[3]).toBe("b2");
    expect(after.bench[0]).toBe("p4");
    expect(after.bench).not.toContain("b2");
  });

  it("gives a player with no role the slot's default, so nobody is fielded without instructions", () => {
    const after = withPlayerInSlot(tactic({ roles: {} as SavedTactic["roles"] }), 0, "b1");
    expect(after.roles["b1"]).toBe(RoleKey.Goalkeeper); // slot 0 of a 4-4-2 is the keeper
  });

  it("does nothing for a slot that is not on the pitch, or a man already in it", () => {
    const before = tactic();
    expect(withPlayerInSlot(before, 11, "b1")).toBe(before);
    expect(withPlayerInSlot(before, -1, "b1")).toBe(before);
    expect(withPlayerInSlot(before, 0, "p1")).toBe(before);
  });
});

describe("fielding a slot out of position", () => {
  it("moves the ROLE with it, because a poacher makes no sense at centre-back", () => {
    const after = withSlotFielded(tactic(), 5, Position.CentreBack);
    expect(after.slotFielded?.[5]).toBe(Position.CentreBack);
    expect(after.roles["p6"]).not.toBe(RoleKey.Goalkeeper);
  });

  it("leaves an empty slot's roles alone", () => {
    const empty = tactic({ lineup: ["", ...XI.slice(1)] as SavedTactic["lineup"] });
    expect(withSlotFielded(empty, 0, Position.Striker).roles).toEqual(empty.roles);
  });
});

describe("the rest of the dials", () => {
  it("patches instructions without discarding the others", () => {
    const after = withInstructions(tactic(), { tempo: 0.9 });
    expect(after.instructions.tempo).toBe(0.9);
    expect(after.instructions.pressing).toBe(0.5);
  });

  it("sets a mentality and a role", () => {
    expect(withMentality(tactic(), Mentality.Attacking).mentality).toBe(Mentality.Attacking);
    expect(withRole(tactic(), "p9", RoleKey.Poacher).roles["p9"]).toBe(RoleKey.Poacher);
  });

  it("remembers a slot dragged off its template position", () => {
    const after = withSlotPosition(tactic(), 9, 0.8, 0.2);
    expect(after.slotPositions?.[9]).toEqual({ depth: 0.8, width: 0.2 });
  });
});

describe("reordering the bench", () => {
  /**
   * The pool is passed IN, because the effective bench-then-reserves order is not stored: `bench` holds
   * the whole rest of the squad in preference order and only its first few dress. The caller owns that
   * distinction — the career reads it off its view model, a friendly off its own squad list.
   */
  it("swaps two men within the order it was handed", () => {
    const t = tactic({ bench: ["b1", "b2", "b3", "b4", "b5"] });
    const after = withPlayerOnBench(t, t.bench, 0, "b4");
    expect(after.bench).toEqual(["b4", "b2", "b3", "b1", "b5"]);
  });

  it("does nothing when the move says nothing, or names somebody outside the pool", () => {
    const t = tactic();
    expect(withPlayerOnBench(t, t.bench, 0, "b1")).toBe(t);
    expect(withPlayerOnBench(t, t.bench, 0, "nobody")).toBe(t);
    expect(withPlayerOnBench(t, t.bench, 99, "b1")).toBe(t);
  });
});

describe("applying a named strategy", () => {
  /**
   * A preset is the one control that moves seven things at once, which is exactly why it is worth a test:
   * a version of it that moved none of them looked identical in the type system and on screen, and shipped
   * that way into a multiplayer friendly.
   */
  it("sets the mentality and every slider the preset names", () => {
    const preset = TACTIC_PRESETS.find((p) => p.key === "highPress")!;
    const after = withPreset(tactic(), "highPress");
    expect(after.mentality).toBe(preset.mentality);
    expect(after.instructions).toEqual(preset.instructions);
  });

  it("round-trips through the picker's own recogniser, for every preset there is", () => {
    // `matchPreset` is what draws the picker's current value; if the two ever disagreed, applying a preset
    // would leave the control reading "custom" and the player would think nothing happened.
    for (const p of TACTIC_PRESETS) {
      const after = withPreset(tactic(), p.key);
      expect(matchPreset(after.mentality, after.instructions)).toBe(p.key);
    }
  });

  it("leaves everything else alone — a strategy is not a team sheet", () => {
    const before = tactic();
    const after = withPreset(before, "lowBlock");
    expect(after.lineup).toEqual(before.lineup);
    expect(after.bench).toEqual(before.bench);
    expect(after.formation).toBe(before.formation);
    expect(after.familiarity).toBe(before.familiarity);
  });

  it("ignores a name it does not know, rather than inventing a shape for it", () => {
    const before = tactic();
    expect(withPreset(before, "nonsense" as TacticPresetKey)).toBe(before);
  });
});
