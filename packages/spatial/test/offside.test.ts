import { describe, expect, it } from "vitest";
import { MatchEngine } from "@fut/spatial";
import { buildTeam } from "@fut/app-cli";

/**
 * The offside law, in the two places it is easy to get wrong: a player cannot be
 * offside in his OWN half, and there is no offside from a throw-in.
 *
 * Home defends x = 0 and attacks x = 105; away is the mirror. The offside line for
 * home is away's deepest outfielder.
 */
const mk = (id: string) => buildTeam({ id, name: id, shortName: id.toUpperCase().slice(0, 3), rating: 75 });

describe("the offside law", () => {
  it("never flags a player in his own half, however far beyond the last defender he is", () => {
    const eng = new MatchEngine(mk("home"), mk("away"), 5);
    const s = eng.state;
    // Away pushes right up: their deepest outfielder stands on 40, so the offside
    // line for home sits deep inside HOME's own half.
    for (const a of s.teamAgents("away")) if (!a.isGK) a.pos = { x: 38, y: 34 };
    const line = s.lastDefenderX("away");
    expect(line).toBeLessThan(52.5);

    const attacker = s.teamAgents("home").find((a) => !a.isGK)!;
    attacker.pos = { x: 47, y: 30 }; // beyond that line, but still in his own half
    expect(s.offsidePositioned("home", 20)).toEqual([]);

    // Move him a few metres over halfway and the same position IS offside — which
    // is what proves the exemption above is doing the work.
    attacker.pos = { x: 56, y: 30 };
    expect(s.offsidePositioned("home", 20)).toEqual([attacker.id]);
  });

  it("needs the attacker ahead of the ball as well as ahead of the line", () => {
    const eng = new MatchEngine(mk("home"), mk("away"), 6);
    const s = eng.state;
    for (const a of s.teamAgents("away")) if (!a.isGK) a.pos = { x: 70, y: 34 };
    const attacker = s.teamAgents("home").find((a) => !a.isGK)!;
    attacker.pos = { x: 80, y: 30 };

    expect(s.offsidePositioned("home", 60)).toEqual([attacker.id]); // ball behind him
    expect(s.offsidePositioned("home", 90)).toEqual([]); // ball ahead of him
  });

  it("raises no flag on a throw-in, whoever is standing where", () => {
    const eng = new MatchEngine(mk("home"), mk("away"), 11);
    let seen = 0;
    let flaggedAfterThrow = 0;
    for (let i = 0; i < 40_000 && !eng.finished; i++) {
      const before = eng.state.deadBall?.type;
      eng.tick(0.1);
      const after = eng.state.deadBall?.type;
      // The throw has just been taken: it was a dead-ball throw-in, now it isn't.
      if (before === "throwIn" && after !== "throwIn") {
        seen += 1;
        if (eng.state.ball.offsideFlag.length > 0) flaggedAfterThrow += 1;
      }
    }
    expect(seen).toBeGreaterThan(3); // throw-ins do happen in a match
    expect(flaggedAfterThrow).toBe(0); // …and none of them can be offside
  });
});
