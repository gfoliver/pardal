import { describe, expect, it } from "vitest";
import { MatchRules, SubstitutionRules } from "@fut/domain";
import { LiveMatch, ManualCoachController, MatchEventType, MatchSimulator, type MatchConfig } from "@fut/engine";
import { buildTeam } from "@fut/app-cli";

function config(seed: number, extra?: Partial<MatchConfig>): MatchConfig {
  return {
    home: buildTeam({ id: "home", name: "Home FC", shortName: "HOM", rating: 68 }),
    away: buildTeam({ id: "away", name: "Away FC", shortName: "AWY", rating: 68 }),
    seed,
    matchRules: MatchRules.league(),
    substitutionRules: SubstitutionRules.brasileirao(),
    ...extra,
  };
}

function driveToEnd(match: LiveMatch): void {
  let guard = 0;
  while (!match.advance().done && guard++ < 10_000) {
    /* advance */
  }
}

describe("LiveMatch", () => {
  it("driven minute-by-minute yields the same result as MatchSimulator.simulate()", () => {
    const cfg = config(42);
    const quick = new MatchSimulator().simulate(cfg);

    const live = new LiveMatch(config(42));
    driveToEnd(live);
    const watched = live.result();

    expect(watched.homeScore).toBe(quick.homeScore);
    expect(watched.awayScore).toBe(quick.awayScore);
    expect(watched.timeline.length).toBe(quick.timeline.length);
    expect(watched.stats.home.shots).toBe(quick.stats.home.shots);
  });

  it("reaches full time and exposes a live snapshot with 11 home players at kickoff", () => {
    const live = new LiveMatch(config(7));
    const snap = live.snapshot();
    expect(snap.players.filter((p) => p.teamId === "home")).toHaveLength(11);
    expect(snap.status).toBe("kickoff");
    driveToEnd(live);
    expect(live.finished).toBe(true);
    expect(live.result().timeline.at(-1)?.type).toBe(MatchEventType.FullTime);
  });

  it("applies a human substitution requested mid-match", () => {
    const home = buildTeam({ id: "home", name: "Home FC", shortName: "HOM", rating: 68 });
    const away = buildTeam({ id: "away", name: "Away FC", shortName: "AWY", rating: 68 });
    const live = new LiveMatch({
      home,
      away,
      seed: 3,
      matchRules: MatchRules.league(),
      substitutionRules: SubstitutionRules.brasileirao(),
      homeController: new ManualCoachController(),
    });

    // Advance into the match, then request a sub.
    for (let i = 0; i < 20; i++) live.advance();
    const out = live.onPitchFor("home").find((p) => p.pos !== away.startingXi[0]!.position)!;
    const bench = live.benchFor("home");
    const incoming = bench.find((b) => b.pos === out.pos) ?? bench[0]!;
    live.requestSubstitution("home", out.id, incoming.id);
    driveToEnd(live);

    const subEvent = live
      .result()
      .timeline.find(
        (e) => e.type === MatchEventType.Substitution && e.teamId === "home" && e.playerId === incoming.id,
      );
    expect(subEvent).toBeDefined();
    expect(live.onPitchFor("home").some((p) => p.id === incoming.id)).toBe(true);
  });
});
