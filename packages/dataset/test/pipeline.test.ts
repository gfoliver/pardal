import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadLeagueTeams } from "@fut/competition";
import { runPipeline, validate, normalizeSnapshot, inferPlayer, type RawSnapshot } from "@fut/dataset";

const SAMPLE: RawSnapshot = JSON.parse(
  readFileSync(fileURLToPath(new URL("../data/brasileirao-serie-a/raw.json", import.meta.url)), "utf8"),
);

describe("pipeline (over the committed Brasileirão sample)", () => {
  it("emits a LeagueData that loads via loadLeagueTeams", () => {
    const { league } = runPipeline(SAMPLE);
    expect(league.teams.length).toBe(20);
    expect(() => loadLeagueTeams(league)).not.toThrow();
  });

  it("validates clean (no structural errors)", () => {
    const { report } = runPipeline(SAMPLE);
    expect(report.errors).toEqual([]);
  });

  it("emits world competitions + club metadata referencing only known clubs", () => {
    const { world } = runPipeline(SAMPLE);
    const clubIds = new Set(world.clubs.map((c) => c.id));
    expect(world.competitions.map((c) => c.id)).toContain("BRA1");
    expect(world.competitions.some((c) => c.type === "cup")).toBe(true);
    for (const comp of world.competitions) for (const id of comp.entrantClubIds) expect(clubIds.has(id)).toBe(true);
    for (const c of world.clubs) expect(c.reputation).toBeGreaterThanOrEqual(40);
  });

  it("is deterministic — same snapshot → deep-equal outputs", () => {
    expect(runPipeline(SAMPLE)).toEqual(runPipeline(SAMPLE));
  });

  it("flags a completeness error when a club is short a goalkeeper", () => {
    const stripped: RawSnapshot = { ...SAMPLE, players: SAMPLE.players.filter((p) => !(p.clubId === "flamengo" && p.position === "Goalkeeper")) };
    const inferred = normalizeSnapshot(stripped).map(inferPlayer);
    const report = validate(stripped, inferred);
    expect(report.errors.some((e) => e.includes("flamengo") && e.includes("goalkeeper"))).toBe(true);
  });
});
