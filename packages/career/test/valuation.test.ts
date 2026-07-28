import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { LeagueData } from "@fut/competition";
import { anchoredValue, Career, monthlyWage } from "@fut/career";
import { runPipeline, type RawSnapshot } from "@fut/dataset";

const SAMPLE: RawSnapshot = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../dataset/data/brasileirao-serie-a/raw.json", import.meta.url)), "utf8"),
);

describe("valuation & wages (real-scale)", () => {
  it("monthlyWage is sub-linear, capped, and hits the Brasileirão band", () => {
    // Anchors the law was fitted to: a R$9M squad player ~R$350k, a R$235M star ~R$1.5M.
    expect(monthlyWage(9_300_000)).toBeGreaterThan(250_000);
    expect(monthlyWage(9_300_000)).toBeLessThan(450_000);
    expect(monthlyWage(235_600_000)).toBeGreaterThan(1_200_000);
    expect(monthlyWage(235_600_000)).toBeLessThanOrEqual(1_600_000);
    // Sub-linear: 25× the value must NOT mean 25× the wage.
    expect(monthlyWage(235_600_000)).toBeLessThan(monthlyWage(9_300_000) * 10);
    // Monotonic.
    expect(monthlyWage(50_000_000)).toBeGreaterThan(monthlyWage(20_000_000));
  });

  it("anchoredValue returns the dataset value verbatim when nothing has changed", () => {
    expect(anchoredValue(49_600_000, { age: 25, overall: 80 }, { age: 25, overall: 80 })).toBe(49_600_000);
    // Ages down, drifts down; improves, drifts up.
    expect(anchoredValue(49_600_000, { age: 25, overall: 80 }, { age: 34, overall: 80 })).toBeLessThan(49_600_000);
    expect(anchoredValue(49_600_000, { age: 25, overall: 80 }, { age: 25, overall: 88 })).toBeGreaterThan(49_600_000);
  });

  it("a career uses the dataset's REAL market values, not a derived guess", () => {
    const { league, world } = runPipeline(SAMPLE);
    const career = Career.create(league as LeagueData, { leagueId: league.id, managedClubId: "614", seed: 7, world });
    // One of OUR players: a rival's value is an estimate now, so the "is it the
    // dataset figure or a re-derivation?" question is only answerable at home.
    const ours = league.teams.find((t) => t.id === "614")!.players.find((p) => (p.marketValue ?? 0) > 0)!;
    expect(ours.marketValue).toBeGreaterThan(0);
    // Season 0: the career reports exactly the dataset value (no re-derivation).
    const value = career.playerDetail(ours.id)!.value!;
    expect(value.exact).toBe(true);
    expect(value.mid).toBe(ours.marketValue);
  });

  it("league wages land on the real Brasileirão scale (mean ~400k/month, stars ≤1.5M)", () => {
    const { league, world } = runPipeline(SAMPLE);
    const career = Career.create(league as LeagueData, { leagueId: league.id, managedClubId: "614", seed: 7, world });
    const wages = Object.keys(career.snapshot().clubs).flatMap((id) => career.squad(id).map((p) => p.contract!.wage));
    const mean = wages.reduce((s, w) => s + w, 0) / wages.length;
    expect(mean).toBeGreaterThan(300_000);
    expect(mean).toBeLessThan(550_000);
    expect(Math.max(...wages)).toBeLessThanOrEqual(1_600_000);
    expect(Math.max(...wages)).toBeGreaterThan(900_000);
  });

  it("clubs stay solvent across a season on the new scale", () => {
    const { league, world } = runPipeline(SAMPLE);
    const career = Career.create(league as LeagueData, { leagueId: league.id, managedClubId: "614", seed: 3, world });
    const before = career.finances()!.balance;
    career.simulateSeason();
    expect(career.finances()!.balance).toBeGreaterThan(before * 0.5);
  });
});
