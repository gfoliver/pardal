import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Formation, Mentality, Position, RoleKey } from "@fut/domain";
import type { LeagueData } from "@fut/competition";
import { buildTeam, lineupHash, MatchProtocol } from "@fut/protocol";
import { matchPreset, TACTIC_PRESETS, withFormation, withPlayerInSlot, type SavedTactic } from "@fut/career";
import { defaultTacticFor, friendlyEditor, rosterClubOf, teamInputOf, viewOf } from "../src/lib/mp/friendly";

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

describe("the editor the board is handed", () => {
  /**
   * EVERY METHOD MUST DO SOMETHING.
   *
   * This exists because one of them did not. `applyPreset` shipped as `() => undefined` — the interface
   * typed it as taking a `string`, so an implementation free to ignore its argument satisfied the compiler,
   * satisfied the board, rendered a working-looking control, and silently changed nothing in a multiplayer
   * friendly. The guard is deliberately blunt and covers the whole surface rather than the one method that
   * broke: a stub is invisible to types and to rendering, so the only thing that catches it is calling it.
   */
  const drive = (t: SavedTactic, use: (e: ReturnType<typeof friendlyEditor>) => void): SavedTactic => {
    let held: SavedTactic | null = t;
    use(friendlyEditor(team, t, (f) => { held = f(held); }));
    return held!;
  };

  const base = () => defaultTacticFor(team);

  it("moves mentality and every slider when a preset is applied", () => {
    const preset = TACTIC_PRESETS.find((p) => p.key === "highPress")!;
    const after = drive(base(), (e) => e.applyPreset("highPress"));
    expect(after.mentality).toBe(preset.mentality);
    expect(after.instructions).toEqual(preset.instructions);
    // And the board would now DRAW it as that preset rather than as "custom".
    expect(matchPreset(after.mentality, after.instructions)).toBe("highPress");
  });

  it("changes the tactic through every method it offers", () => {
    const t = base();
    const other = t.formation === Formation.F433 ? Formation.F442 : Formation.F433;
    const changes: [string, (e: ReturnType<typeof friendlyEditor>) => void][] = [
      ["setFormation", (e) => e.setFormation(other)],
      ["setMentality", (e) => e.setMentality(Mentality.Attacking)],
      ["setInstruction", (e) => e.setInstruction({ tempo: 0.95 })],
      ["setLineupSlot", (e) => e.setLineupSlot(10, t.bench[0]!)],
      // A role the auto-pick cannot already have given him: the striker is picked as a poacher, and
      // "changed it to what it was" is not evidence that the setter works.
      ["setPlayerRole", (e) => e.setPlayerRole(t.lineup[10]!, RoleKey.TargetMan)],
      ["setSlotFielded", (e) => e.setSlotFielded(10, Position.CentreBack)],
      ["setSlotPosition", (e) => e.setSlotPosition(10, 0.9, 0.1)],
      ["applyPreset", (e) => e.applyPreset("lowBlock")],
    ];
    for (const [name, use] of changes) {
      expect.soft(drive(t, use), `${name} left the tactic untouched`).not.toEqual(t);
    }
  });

  it("puts a mangled side back with the auto-pick", () => {
    const wrecked = { ...base(), lineup: base().lineup.map(() => "") as SavedTactic["lineup"] };
    expect(drive(wrecked, (e) => e.autoPickLineup()).lineup.every((id) => id !== "")).toBe(true);
  });

  it("draws no fit percentage, because a friendly has no scouting to base one on", () => {
    // Undefined rather than zero: the board renders nothing for a missing measurement, and a zero would
    // tell every player he is playing out of position.
    expect(friendlyEditor(team, base(), () => {}).fitAt(team.players[0]!.id, Position.Striker)).toBeUndefined();
  });

  it("offers no saved-tactic drawer, since a friendly is one match with one shape", () => {
    expect(friendlyEditor(team, base(), () => {}).saved).toBeUndefined();
  });
});
