import { describe, expect, it } from "vitest";
import { Formation, Position } from "@fut/domain";
import type { LeagueData, PlayerData, TeamData } from "@fut/competition";
import { Career, buildMatchTeam, reconcileTactics } from "@fut/career";

/**
 * A player belongs to exactly one squad, and every stored lineup agrees.
 *
 * The bug this guards was severe and had two halves. Selling a player removed him from the seller's
 * `squad.playerIds` and left him in the seller's stored `lineup` — a list of ids that nothing else
 * kept honest. `buildMatchTeam` asked only whether the id named a fit player in the DATASET, so the
 * seller went on fielding him while the buyer fielded him too.
 *
 * The second half is why it was not merely cosmetic: the match engine indexes agents by player id,
 * so of two agents sharing an id the second silently overwrote the first, leaving one unreachable
 * through every lookup that resolves a player. A restart waiting on an agent nobody can find never
 * completes, so the match hung rather than ending.
 */

function attrs(v: number) {
  return {
    physical: { pace: v, stamina: v, strength: v, agility: v },
    mental: { decisions: v, composure: v, workRate: v, teamwork: v, aggression: v, anticipation: v, positioning: v, vision: v },
    technical: { passing: v, technique: v, dribbling: v, finishing: v, shotPower: v, tackling: v, marking: v, crossing: v },
  };
}
const POS: [Position, boolean][] = [
  [Position.Goalkeeper, true], [Position.Goalkeeper, true],
  ...Array.from({ length: 8 }, () => [Position.CentreBack, false] as [Position, boolean]),
  ...Array.from({ length: 8 }, () => [Position.CentralMidfielder, false] as [Position, boolean]),
  ...Array.from({ length: 6 }, () => [Position.Striker, false] as [Position, boolean]),
];
function team(id: string, r: number): TeamData {
  return {
    id, name: id, shortName: id.toUpperCase(),
    coach: { id: `${id}-c`, name: "C", age: 50, nationality: "BR", attributes: { adaptability: 60, tacticalKnowledge: 60, reactiveness: 60, composure: 60 } },
    players: POS.map(([p, gk], i) => ({ id: `${id}-p${i}`, name: `${id}-p${i}`, age: 26, nationality: "BR", position: p, marketValue: 5_000_000, ...attrs(r), ...(gk ? { goalkeeping: { reflexes: r, handling: r, positioning: r, oneOnOnes: r } } : {}) } as PlayerData)),
  };
}
const league: LeagueData = { id: "fic", name: "Fic", teams: [76, 72, 68, 64].map((r, i) => team(`t${i}`, r)) };

const career = () => Career.create(league, { leagueId: "fic", managedClubId: "t0", seed: 21 });
const dataById = new Map<string, PlayerData>(league.teams.flatMap((t) => t.players.map((p) => [p.id, p])));
const devsOf = (c: Career) => new Map(Object.values(c.snapshot().playerDev).map((d) => [d.playerId, d]));
const activeOf = (c: Career, clubId: string) => {
  const club = c.snapshot().clubs[clubId]!;
  return club.tacticSlots.find((t) => t.id === club.activeTacticId) ?? club.tacticSlots[0]!;
};
/** Move a player between clubs the way a completed deal does. */
const sell = (c: Career, playerId: string, from: string, to: string) => {
  const s = c.snapshot();
  s.clubs[from]!.squad.playerIds = s.clubs[from]!.squad.playerIds.filter((p) => p !== playerId);
  s.clubs[to]!.squad.playerIds = [...s.clubs[to]!.squad.playerIds, playerId];
};

describe("a squad change and the lineups that reference it", () => {
  it("takes a departed player out of the lineup he was in", () => {
    const c = career();
    const starter = activeOf(c, "t0").lineup[5]!;
    sell(c, starter, "t0", "t1");
    reconcileTactics(c.snapshot().clubs.t0!, dataById, devsOf(c));

    expect(activeOf(c, "t0").lineup).not.toContain(starter);
  });

  it("fills his slot rather than leaving a gap, and still names eleven", () => {
    const c = career();
    const starter = activeOf(c, "t0").lineup[5]!;
    sell(c, starter, "t0", "t1");
    reconcileTactics(c.snapshot().clubs.t0!, dataById, devsOf(c));

    const lineup = activeOf(c, "t0").lineup;
    expect(lineup.filter(Boolean)).toHaveLength(11);
    expect(new Set(lineup).size).toBe(11);
  });

  /**
   * The reason a hole is filled in place rather than the array compacted: `lineup` is indexed BY
   * FORMATION SLOT, and `slotFielded[i]` / `slotPositions[i]` line up with it. Compacting would
   * slide everyone one slot left and rearrange the team around the man who left.
   */
  it("leaves the other ten where the manager put them", () => {
    const c = career();
    const before = [...activeOf(c, "t0").lineup];
    const starter = before[5]!;
    sell(c, starter, "t0", "t1");
    reconcileTactics(c.snapshot().clubs.t0!, dataById, devsOf(c));

    const after = activeOf(c, "t0").lineup;
    for (const [i, id] of before.entries()) {
      if (i === 5) continue;
      expect(after[i], `slot ${i}`).toBe(id);
    }
  });

  it("keeps a goalkeeper in the goalkeeper's slot", () => {
    const c = career();
    const gkSlot = activeOf(c, "t0").lineup[0]!;
    sell(c, gkSlot, "t0", "t1");
    reconcileTactics(c.snapshot().clubs.t0!, dataById, devsOf(c));

    const replacement = activeOf(c, "t0").lineup[0]!;
    expect(replacement).not.toBe(gkSlot);
    expect(dataById.get(replacement)!.position).toBe(Position.Goalkeeper);
  });

  it("puts a new signing on the bench so he can be picked", () => {
    const c = career();
    const bought = "t1-p20";
    sell(c, bought, "t1", "t0");
    reconcileTactics(c.snapshot().clubs.t0!, dataById, devsOf(c));

    const t = activeOf(c, "t0");
    expect([...t.lineup, ...t.bench]).toContain(bought);
  });

  it("tidies EVERY saved tactic, not only the one in use", () => {
    const c = career();
    c.createTactic("B");
    const club = c.snapshot().clubs.t0!;
    const other = club.tacticSlots.find((t) => t.id !== club.activeTacticId)!;
    const starter = other.lineup[4]!;
    sell(c, starter, "t0", "t1");
    reconcileTactics(c.snapshot().clubs.t0!, dataById, devsOf(c));

    // A manager who swaps shape for a big game must not find a ghost in the tactic he had not
    // looked at since the sale.
    expect(other.lineup).not.toContain(starter);
    expect(other.lineup.filter(Boolean)).toHaveLength(11);
  });

  it("drops a departed player's role instead of keeping it around", () => {
    const c = career();
    const starter = activeOf(c, "t0").lineup[7]!;
    expect(activeOf(c, "t0").roles[starter]).toBeDefined();
    sell(c, starter, "t0", "t1");
    reconcileTactics(c.snapshot().clubs.t0!, dataById, devsOf(c));

    expect(activeOf(c, "t0").roles[starter]).toBeUndefined();
  });
});

describe("the invariant underneath it", () => {
  /**
   * `reconcileTactics` keeps what the manager sees honest. This is the guarantee that holds even if
   * some future roster path forgets to call it: a club can only field its own players.
   */
  it("never fields a player who is not in the squad, even if the lineup still names him", () => {
    const c = career();
    const club = c.snapshot().clubs.t0!;
    const starter = activeOf(c, "t0").lineup[6]!;
    // Remove him from the squad and DELIBERATELY leave the stored lineup untouched.
    club.squad.playerIds = club.squad.playerIds.filter((p) => p !== starter);

    const team = buildMatchTeam(club, dataById, devsOf(c));
    expect(team.startingXi.map((p) => p.id)).not.toContain(starter);
    expect(team.bench.map((p) => p.id)).not.toContain(starter);
  });

  it("cannot put the same player on both sides of a fixture", () => {
    const c = career();
    const snap = c.snapshot();
    const sold = activeOf(c, "t0").lineup[9]!;
    sell(c, sold, "t0", "t1");
    reconcileTactics(snap.clubs.t0!, dataById, devsOf(c));
    reconcileTactics(snap.clubs.t1!, dataById, devsOf(c));

    const home = buildMatchTeam(snap.clubs.t0!, dataById, devsOf(c));
    const away = buildMatchTeam(snap.clubs.t1!, dataById, devsOf(c));
    const ids = [...home.startingXi, ...home.bench, ...away.startingXi, ...away.bench].map((p) => p.id);
    // The engine's agent index is keyed by player id; a duplicate made one agent overwrite the
    // other and the match never finished.
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("holds through a formation change, which re-slots everybody", () => {
    const c = career();
    c.setFormation(Formation.F433);
    const club = c.snapshot().clubs.t0!;
    const starter = activeOf(c, "t0").lineup[3]!;
    sell(c, starter, "t0", "t1");
    reconcileTactics(club, dataById, devsOf(c));

    const team = buildMatchTeam(club, dataById, devsOf(c));
    expect(team.startingXi).toHaveLength(11);
    expect(team.startingXi.map((p) => p.id)).not.toContain(starter);
  });
});
