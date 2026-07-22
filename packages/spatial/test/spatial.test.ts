import { describe, expect, it } from "vitest";
import { MatchEventType } from "@fut/engine";
import { SpatialMatch } from "@fut/spatial";
import { buildTeam } from "@fut/app-cli";

function play(seed: number) {
  const match = new SpatialMatch({
    home: buildTeam({ id: "home", name: "Home FC", shortName: "HOM", rating: 72 }),
    away: buildTeam({ id: "away", name: "Away FC", shortName: "AWY", rating: 72 }),
    seed,
  });
  let guard = 0;
  while (!match.finished && guard++ < 100_000) match.tick(0.1);
  return match;
}

describe("SpatialMatch", () => {
  it("is deterministic for a fixed seed", () => {
    const a = play(42);
    const b = play(42);
    expect(a.score).toEqual(b.score);
    expect(a.stats.home.shots).toBe(b.stats.home.shots);
    expect(a.events.length).toBe(b.events.length);
  });

  it("plays a full match: kickoff → full time with plausible flow", () => {
    const m = play(7);
    expect(m.finished).toBe(true);
    expect(m.events[0]?.type).toBe(MatchEventType.Kickoff);
    expect(m.events.at(-1)?.type).toBe(MatchEventType.FullTime);
    expect(m.events.some((e) => e.type === MatchEventType.HalfTime)).toBe(true);
    // Both teams get on the ball.
    expect(m.stats.home.possessionSteps).toBeGreaterThan(0);
    expect(m.stats.away.possessionSteps).toBeGreaterThan(0);
    // Some shots are taken over 90 minutes.
    expect(m.stats.home.shots + m.stats.away.shots).toBeGreaterThan(0);
  });

  it("exposes a continuous snapshot with 22 players and a ball", () => {
    const m = new SpatialMatch({
      home: buildTeam({ id: "home", name: "H", shortName: "H", rating: 70 }),
      away: buildTeam({ id: "away", name: "A", shortName: "A", rating: 70 }),
      seed: 3,
    });
    for (let i = 0; i < 200; i++) m.tick(0.1);
    const snap = m.snapshot();
    expect(snap.players).toHaveLength(22);
    for (const p of snap.players) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(100);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(100);
    }
    expect(snap.ball.x).toBeGreaterThanOrEqual(0);
    expect(snap.ball.x).toBeLessThanOrEqual(100);
  });
});
