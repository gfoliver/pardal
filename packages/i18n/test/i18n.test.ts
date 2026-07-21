import { describe, expect, it } from "vitest";
import { MatchRules, SubstitutionRules } from "@fut/domain";
import {
  MatchEventType,
  MatchSimulator,
  type MatchEvent,
} from "@fut/engine";
import { getCatalog, type RenderContext } from "@fut/i18n";
import { buildTeam } from "@fut/app-cli";

const ctx: RenderContext = { teamName: (id) => id ?? "" };

describe("i18n catalogs", () => {
  it("renders the same goal event differently per locale", () => {
    const goal: MatchEvent = {
      minute: 23,
      type: MatchEventType.Goal,
      teamId: "home",
      playerId: "p1",
      playerName: "Ronaldo",
    };
    const en = getCatalog("en").renderEvent(goal, ctx)!;
    const pt = getCatalog("pt-BR").renderEvent(goal, ctx)!;
    expect(en).toContain("GOAL");
    expect(en).toContain("Ronaldo");
    expect(pt).toContain("GOL");
    expect(pt).toContain("Ronaldo");
    expect(en).not.toEqual(pt);
  });

  it("returns null for non-narrated event types", () => {
    const pass: MatchEvent = { minute: 5, type: MatchEventType.Pass, teamId: "home" };
    expect(getCatalog("en").renderEvent(pass, ctx)).toBeNull();
  });

  it("the match result is identical regardless of render locale (engine is locale-agnostic)", () => {
    const sim = new MatchSimulator();
    const config = {
      home: buildTeam({ id: "home", name: "Home", shortName: "HOM", rating: 65 }),
      away: buildTeam({ id: "away", name: "Away", shortName: "AWY", rating: 65 }),
      seed: 99,
      matchRules: MatchRules.league(),
      substitutionRules: SubstitutionRules.brasileirao(),
    };
    const result = sim.simulate(config);

    // Rendering in different locales must not mutate the structured result.
    const before = JSON.stringify(result);
    getCatalog("en").renderEvent(result.timeline[0]!, ctx);
    getCatalog("pt-BR").renderEvent(result.timeline[0]!, ctx);
    expect(JSON.stringify(result)).toEqual(before);

    // Same seed → identical result, independent of any locale.
    const again = sim.simulate(config);
    expect(again.homeScore).toBe(result.homeScore);
    expect(again.awayScore).toBe(result.awayScore);
  });
});
