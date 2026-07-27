import { describe, expect, it } from "vitest";
import { Formation } from "@fut/domain";
import { MatchEngine } from "@fut/spatial";
import { buildTeam } from "@fut/app-cli";

describe("tactic familiarity slows first touch", () => {
  it("an unfamiliar side settles the ball slower than a fully-drilled one, same tempo", () => {
    const rusty = buildTeam({ id: "rusty", name: "Rusty", shortName: "RUS", rating: 70, formation: Formation.F442, instructions: { familiarity: 0.2 } });
    const drilled = buildTeam({ id: "drilled", name: "Drilled", shortName: "DRI", rating: 70, formation: Formation.F442 }); // no familiarity → fully drilled (1)

    const engine = new MatchEngine(rusty, drilled, 1);
    expect(engine.state.firstTouch[rusty.id]).toBeGreaterThan(engine.state.firstTouch[drilled.id]!);
  });

  it("first touch scales monotonically with familiarity", () => {
    const times = [0.2, 0.6, 1].map((familiarity) => {
      const home = buildTeam({ id: "h", name: "H", shortName: "H", rating: 70, instructions: { familiarity } });
      const away = buildTeam({ id: "a", name: "A", shortName: "A", rating: 70 });
      const engine = new MatchEngine(home, away, 1);
      return engine.state.firstTouch[home.id]!;
    });
    expect(times[0]).toBeGreaterThan(times[1]!);
    expect(times[1]).toBeGreaterThan(times[2]!);
  });

  it("live setInstructions carries a familiarity change into first touch", () => {
    const home = buildTeam({ id: "h", name: "H", shortName: "H", rating: 70 });
    const away = buildTeam({ id: "a", name: "A", shortName: "A", rating: 70 });
    const engine = new MatchEngine(home, away, 1);
    const before = engine.state.firstTouch[home.id]!;
    engine.setInstructions(home.id, { familiarity: 0.2 });
    expect(engine.state.firstTouch[home.id]!).toBeGreaterThan(before);
  });
});
