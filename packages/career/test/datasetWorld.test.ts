import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runPipeline, type RawSnapshot } from "@fut/dataset";
import { Career, InMemoryDatasetProvider } from "@fut/career";

const SAMPLE: RawSnapshot = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../dataset/data/brasileirao-serie-a/raw.json", import.meta.url)), "utf8"),
);

describe("career on an assembled dataset (world integration)", () => {
  const { league, world } = runPipeline(SAMPLE);
  const provider = new InMemoryDatasetProvider("bra", "1", [league], { [league.id]: world });

  it("provider serves the league and its world", () => {
    expect(provider.getLeague(league.id).teams.length).toBe(20);
    expect(provider.getWorld!(league.id)!.competitions.some((c) => c.type === "cup")).toBe(true);
  });

  it("createCareer seeds cups + club metadata from the world", () => {
    const career = Career.create(provider.getLeague(league.id), {
      leagueId: league.id,
      managedClubId: "flamengo",
      seed: 1,
      world: provider.getWorld!(league.id)!,
    });
    const snap = career.snapshot();
    // Cup descriptor carried into the structure.
    expect(snap.structure.cups.map((c) => c.id)).toContain("BRC");
    // Club metadata populated from world.json.
    const fla = career.clubDetail("flamengo")!;
    expect(fla.stadium).toBe("Maracanã");
    expect(fla.founded).toBe(1895);
    expect(fla.reputation).toBeGreaterThan(80);
  });

  it("plays a deterministic season on the derived dataset", () => {
    const career = Career.create(provider.getLeague(league.id), { leagueId: league.id, managedClubId: "flamengo", seed: 3, world });
    career.simulateSeason();
    const table = career.table("league");
    expect(table).toHaveLength(20);
    expect(table.reduce((s, r) => s + r.played, 0)).toBeGreaterThan(0);
  });
});
