import { describe, expect, it } from "vitest";
import { Formation } from "@fut/domain";
import { MatchEventType } from "@fut/engine";
import { SpatialMatch } from "@fut/spatial";
import { buildTeam } from "@fut/app-cli";

/**
 * Whose bench is it?
 *
 * The engine substituted tired players for BOTH sides unconditionally, which
 * meant a manager watching his own match would see the game make changes for
 * him. Quick-simming still wants that — an unattended side has to manage
 * itself — so the difference is a single opt-out, not a behaviour change.
 */

const teams = () => ({
  home: buildTeam({ id: "home", name: "Home", shortName: "HOM", rating: 70, formation: Formation.F442 }),
  away: buildTeam({ id: "away", name: "Away", shortName: "AWY", rating: 70, formation: Formation.F442 }),
});

/** Run a full match and collect the substitutions each side made. */
function subsByTeam(manualSubsTeamId?: string) {
  const { home, away } = teams();
  const m = new SpatialMatch({ home, away, seed: 11, manualSubsTeamId });
  let guard = 0;
  while (!m.finished && guard++ < 100_000) m.tick(0.1);
  const subs = m.events.filter((e) => e.type === MatchEventType.Substitution);
  // An injury forces a change whoever is managing; only the DISCRETIONARY ones
  // are the manager's to make.
  const chosen = subs.filter((e) => !e.params?.injury);
  return {
    match: m,
    home: chosen.filter((e) => e.teamId === home.id).length,
    away: chosen.filter((e) => e.teamId === away.id).length,
    forcedHome: subs.filter((e) => e.teamId === home.id && e.params?.injury).length,
    homeId: home.id,
  };
}

describe("who gets to use the bench", () => {
  it("manages both sides when nobody is watching — the quick-sim path", () => {
    const r = subsByTeam();
    expect(r.home).toBeGreaterThan(0);
    expect(r.away).toBeGreaterThan(0);
  });

  it("leaves the watched manager's bench alone", () => {
    const r = subsByTeam("home");
    expect(r.home).toBe(0);
    // The opposition still manages itself, so the match isn't simply frozen.
    expect(r.away).toBeGreaterThan(0);
  });

  it("never replaces the watched manager's injured player behind his back", () => {
    // Even an injury is his to answer — the engine only flags it.
    const r = subsByTeam("home");
    expect(r.forcedHome).toBe(0);
    expect(r.home).toBe(0);
  });

  it("still forces the change for a side nobody is watching", () => {
    // Unattended, the alternative would be silently playing with ten.
    const { home, away } = teams();
    const m = new SpatialMatch({ home, away, seed: 11 });
    let guard = 0;
    while (!m.finished && guard++ < 100_000) m.tick(0.1);
    expect(m.pendingInjury(home.id)).toBeUndefined();
    expect(m.pendingInjury(away.id)).toBeUndefined();
  });
});

describe("an injury the manager has to answer", () => {
  /**
   * Run until our side has someone hurt and waiting.
   *
   * Searches seeds rather than naming one. An injury is a ~2% roll per hard
   * foul, so whether a given seed produces one is incidental to the contract
   * being tested — and pinning seed 11 meant an unrelated change to the ball
   * physics, which shifted every match's trajectory, "broke" three tests that
   * were still perfectly correct.
   */
  /** Play `seed` until our side has someone hurt and waiting, or the match ends. */
  function play(seed: number) {
    const { home, away } = teams();
    const m = new SpatialMatch({ home, away, seed, manualSubsTeamId: home.id });
    let guard = 0;
    while (!m.finished && !m.pendingInjury(home.id) && guard++ < 100_000) m.tick(0.1);
    return { m, home, away };
  }

  // Found once and remembered: the search is what makes this robust, and paying
  // for it in every test would cost a couple of minutes for nothing.
  let injurySeed: number | undefined;
  function untilInjured() {
    if (injurySeed !== undefined) return play(injurySeed);
    for (let seed = 1; seed <= 40; seed++) {
      const r = play(seed);
      if (r.m.pendingInjury(r.home.id)) {
        injurySeed = seed;
        return r;
      }
    }
    throw new Error("No seed in 1..40 produced an injury to the watched side — check maybeInjury.");
  }

  it("flags the hurt player instead of quietly picking his replacement", () => {
    const { m, home } = untilInjured();
    const hurt = m.pendingInjury(home.id);
    expect(hurt).toBeTruthy();
    // He is still out there — the manager decides, and the UI halts on this.
    expect(m.onPitch(home.id).some((p) => p.id === hurt)).toBe(true);
  });

  it("clears once the manager brings someone on for him", () => {
    const { m, home } = untilInjured();
    const hurt = m.pendingInjury(home.id)!;
    const replacement = m.bench(home.id)[0]!;
    expect(m.requestSub(home.id, hurt, replacement.id)).toBe(true);
    expect(m.pendingInjury(home.id)).toBeUndefined();
    expect(m.onPitch(home.id).some((p) => p.id === hurt)).toBe(false);
  });

  it("clears — a man down — if he'd rather keep the substitution", () => {
    const { m, home } = untilInjured();
    const hurt = m.pendingInjury(home.id)!;
    const before = m.onPitch(home.id).length;
    expect(m.playOnWithoutInjured(home.id)).toBe(true);
    expect(m.pendingInjury(home.id)).toBeUndefined();
    expect(m.onPitch(home.id).some((p) => p.id === hurt)).toBe(false);
    expect(m.onPitch(home.id)).toHaveLength(before - 1); // nobody comes on for him
  });

  it("does nothing when there is no injury to answer", () => {
    const { home, away } = teams();
    const m = new SpatialMatch({ home, away, seed: 11, manualSubsTeamId: home.id });
    expect(m.playOnWithoutInjured(home.id)).toBe(false);
  });
});

describe("the bench the manager does control", () => {
  it("still lets the manager make his own changes", () => {
    const { home, away } = teams();
    const m = new SpatialMatch({ home, away, seed: 11, manualSubsTeamId: home.id });
    for (let i = 0; i < 600; i++) m.tick(0.1);

    const out = m.onPitch(home.id).find((p) => p.position !== "goalkeeper")!;
    const inc = m.bench(home.id)[0]!;
    expect(m.requestSub(home.id, out.id, inc.id)).toBe(true);
    expect(m.onPitch(home.id).some((p) => p.id === inc.id)).toBe(true);
    expect(m.events.some((e) => e.type === MatchEventType.Substitution && e.teamId === home.id)).toBe(true);
  });

  it("records every substitution as an event, so the timeline can show it", () => {
    const r = subsByTeam();
    const subs = r.match.events.filter((e) => e.type === MatchEventType.Substitution);
    expect(subs.length).toBeGreaterThan(0);
    for (const e of subs) {
      expect(e.teamId).toBeTruthy();
      expect(e.minute).toBeGreaterThan(0);
      // Both ends of the change, so the narration can name them.
      expect(e.playerId).toBeTruthy();
    }
  });

  it("is deterministic either way", () => {
    expect(subsByTeam("home").away).toBe(subsByTeam("home").away);
  });
});
