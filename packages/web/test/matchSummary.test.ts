import { describe, expect, it } from "vitest";
import { goalsFor, type ScoredGoal } from "../src/screens/career/MatchSummary";

/** The scoreline lists each side's goals under that side's name, earliest first. */
const goals: ScoredGoal[] = [
  { name: "Pedro", teamId: "fla", minute: 62 },
  { name: "Ênio", teamId: "cha", minute: 12 },
  { name: "Paquetá", teamId: "fla", minute: 4, assistName: "Arrascaeta" },
  { name: "Arrascaeta", teamId: "fla", penalty: true, minute: 88 },
  { name: "Old goal", teamId: "fla" }, // a career saved before minutes were kept
];

describe("the scoreline's goal list", () => {
  it("keeps only that side's goals", () => {
    expect(goalsFor(goals, "cha").map((g) => g.name)).toEqual(["Ênio"]);
  });

  it("orders them by minute, earliest first", () => {
    expect(goalsFor(goals, "fla").map((g) => g.minute)).toEqual([4, 62, 88, undefined]);
  });

  it("sinks a goal with no recorded minute to the bottom rather than the top", () => {
    expect(goalsFor(goals, "fla").at(-1)!.name).toBe("Old goal");
  });

  it("copes with a fixture that has no goals at all", () => {
    expect(goalsFor(undefined, "fla")).toEqual([]);
    expect(goalsFor([], "fla")).toEqual([]);
  });
});
