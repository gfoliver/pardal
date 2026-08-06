import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Formation, Position } from "@fut/domain";
import type { LeagueData } from "@fut/competition";
import { buildTeam, lineupHash, MatchProtocol } from "@fut/protocol";
import { withFormation, withPlayerInSlot } from "@fut/career";
import { defaultTacticFor, rosterClubOf, teamInputOf, viewOf } from "../src/lib/mp/friendly";

/**
 * A friendly built from the shipped dataset, with no career anywhere.
 *
 * The test that matters is the LAST one: what this module produces has to be something the canonical
 * `buildTeam` accepts. That is the join between the two halves of multiplayer — a submission the server
 * seals and a team every client reconstructs — and it is the one place where a plausible-looking
 * `TeamInput` with, say, the bench in the wrong shape would pass every type and fail at kickoff for
 * everybody at once.
 */

const league = JSON.parse(
  readFileSync(fileURLToPath(new URL("../src/lib/career/datasets/brasileirao/league.json", import.meta.url)), "utf8"),
) as LeagueData;

const team = league.teams[0]!;
const BENCH = 5;

describe("a club from the dataset", () => {
  it("becomes a roster the canonical builder recognises", () => {
    const club = rosterClubOf(team);
    expect(club.clubId).toBe(team.id);
    expect(club.players.length).toBe(team.players.length);
    expect(club.coach.id).toBeTruthy();
  });

  it("gets a full eleven auto-picked, with a keeper in goal", () => {
    const tactic = defaultTacticFor(team);
    expect(tactic.lineup).toHaveLength(11);
    expect(new Set(tactic.lineup).size).toBe(11);
    const byId = new Map(team.players.map((p) => [p.id, p]));
    expect(byId.get(tactic.lineup[0]!)?.position).toBe(Position.Goalkeeper);
  });
});

describe("the board's view of it", () => {
  it("shows eleven slots and a bench, with every player named", () => {
    const view = viewOf(team, defaultTacticFor(team), () => 1);
    expect(view.slots).toHaveLength(11);
    expect(view.slots.every((s) => s.player?.name)).toBe(true);
    expect(view.bench.length).toBeGreaterThan(0);
    // Nobody is on the pitch and on the bench at once.
    const starters = new Set(view.slots.map((s) => s.player?.playerId));
    expect(view.bench.some((p) => starters.has(p.playerId))).toBe(false);
  });

  it("reports full fitness, because the protocol pins it for every competitive match", () => {
    // Not optimism: `MatchProtocol.condition` is 1 for everybody, so two clients cannot disagree about a
    // squad's freshness. A friendly that guessed here would produce a different match from its opponent.
    const view = viewOf(team, defaultTacticFor(team), () => 1);
    expect(view.slots[0]!.player!.fitness).toBe(MatchProtocol.condition * 100);
  });

  it("follows an edit made with the shared editor, with no career in the loop", () => {
    const tactic = defaultTacticFor(team);
    const swapped = withPlayerInSlot(tactic, 10, tactic.bench[0]!);
    const view = viewOf(team, swapped, () => 1);
    expect(view.slots[10]!.player!.playerId).toBe(tactic.bench[0]);
  });
});

describe("sealing it as a submission", () => {
  it("produces a TeamInput the canonical builder turns into a real team", async () => {
    const tactic = defaultTacticFor(team);
    const input = teamInputOf(team, tactic, BENCH, team.coach.id);
    const built = buildTeam(input, rosterClubOf(team));
    expect(built.startingXi).toHaveLength(11);
    expect(built.bench).toHaveLength(BENCH);
    // A keeper in goal is what `Team.goalkeeper()` resolves by `instanceof`, so this is not cosmetic.
    expect(built.goalkeeper()).toBeDefined();
    // And it hashes, which is what the server seals.
    expect(await lineupHash({ matchId: "m1", teamId: team.id, engineVersion: "e1", input })).toMatch(/^[0-9a-f]{64}$/);
  });

  it("cuts the bench to the size a matchday allows, not the whole squad", () => {
    // `SavedTactic.bench` is the entire rest of the squad in preference order; submitting all of it would
    // name reserves who never travelled.
    const input = teamInputOf(team, defaultTacticFor(team), BENCH, team.coach.id);
    expect(input.bench).toHaveLength(BENCH);
    expect(input.startingXi.some((id) => input.bench.includes(id))).toBe(false);
  });

  it("carries a slot's chosen position, so every client fields him there", () => {
    const tactic = defaultTacticFor(team);
    const out = teamInputOf(team, { ...tactic, slotFielded: [Position.Goalkeeper, Position.Striker] }, BENCH, team.coach.id);
    expect(out.fieldedPositions[tactic.lineup[1]!]).toBe(Position.Striker);
  });

  it("reshapes into a different formation and still builds", () => {
    const tactic = withFormation(defaultTacticFor(team), Formation.F433);
    const input = teamInputOf(team, tactic, BENCH, team.coach.id);
    expect(input.instructions.formation).toBe(Formation.F433);
    expect(() => buildTeam(input, rosterClubOf(team))).not.toThrow();
  });
});
