import { Position } from "@fut/domain";
import type { LeagueData, PlayerData, TeamData } from "@fut/competition";

/**
 * A synthetic league for career tests that need real squads but not the real dataset.
 *
 * Deliberately flat: every player at a club shares one attribute value, so a test that cares about
 * ROSTER mechanics — who is registered where, who can be fielded — is never at the mercy of which
 * player the engine happened to rate highest. Four clubs of 24, which is enough for a double
 * round-robin and enough depth to strip a squad below eleven and still have a bench elsewhere.
 */

function attrs(v: number) {
  return {
    physical: { pace: v, stamina: v, strength: v, agility: v },
    mental: { decisions: v, composure: v, workRate: v, teamwork: v, aggression: v, anticipation: v, positioning: v, vision: v, offTheBall: v },
    technical: { passing: v, technique: v, dribbling: v, finishing: v, shotPower: v, tackling: v, marking: v, crossing: v, firstTouch: v, heading: v },
  };
}

/** Two keepers and enough of each line to fill any formation the default tactic picks. */
const POS: [Position, boolean][] = [
  [Position.Goalkeeper, true], [Position.Goalkeeper, true],
  ...Array.from({ length: 8 }, () => [Position.CentreBack, false] as [Position, boolean]),
  ...Array.from({ length: 8 }, () => [Position.CentralMidfielder, false] as [Position, boolean]),
  ...Array.from({ length: 6 }, () => [Position.Striker, false] as [Position, boolean]),
];

export function fixtureTeam(id: string, rating: number): TeamData {
  return {
    id,
    name: id,
    shortName: id.toUpperCase(),
    coach: { id: `${id}-c`, name: "C", age: 50, nationality: "BR", attributes: { adaptability: 60, tacticalKnowledge: 60, reactiveness: 60, composure: 60 } },
    players: POS.map(([p, gk], i) => ({
      id: `${id}-p${i}`,
      name: `${id}-p${i}`,
      age: 26,
      nationality: "BR",
      position: p,
      marketValue: 5_000_000,
      ...attrs(rating),
      ...(gk ? { goalkeeping: { reflexes: rating, handling: rating, positioning: rating, oneOnOnes: rating } } : {}),
    })),
  };
}

/** Four clubs of descending strength. `ids` names them, defaulting to t0…t3. */
export function fixtureLeague(ids: readonly string[] = ["t0", "t1", "t2", "t3"]): LeagueData {
  const ratings = [76, 72, 68, 64];
  return { id: "fic", name: "Fic", teams: ids.map((id, i) => fixtureTeam(id, ratings[i] ?? 64)) };
}

/** Every player in a league, by id — what `Career` is constructed against. */
export const fixtureDataById = (league: LeagueData): Map<string, PlayerData> =>
  new Map(league.teams.flatMap((t) => t.players.map((p) => [p.id, p])));
