import { MatchRules, SubstitutionRules, type Team } from "@fut/domain";
import { MatchEventType, MatchSimulator } from "@fut/engine";
import { generateFixtures } from "./Fixture.js";
import {
  computeStandings,
  type FixtureResult,
  type GoalRecord,
  type StandingRow,
} from "./Standings.js";
import { computeSeasonStats, type SeasonStats } from "./SeasonStats.js";

export interface LeagueOptions {
  readonly doubleRoundRobin?: boolean;
  readonly substitutionRules?: SubstitutionRules;
}

export interface SeasonResult {
  readonly seed: number;
  readonly teamIds: readonly string[];
  readonly fixtures: readonly FixtureResult[];
  readonly table: readonly StandingRow[];
  readonly stats: SeasonStats;
}

/** Derive a per-match seed from the season seed and the fixture index. */
export function matchSeed(seasonSeed: number, fixtureIndex: number): number {
  return (seasonSeed + fixtureIndex * 104729) >>> 0;
}

/**
 * A single-division league. Schedules a (double) round-robin and simulates every
 * fixture with the isolated match engine, producing a final table. Fully
 * deterministic: the same season seed reproduces the same season.
 */
export class League {
  private readonly teamById = new Map<string, Team>();
  private readonly simulator = new MatchSimulator();

  constructor(
    private readonly teams: readonly Team[],
    private readonly options: LeagueOptions = {},
  ) {
    for (const t of teams) this.teamById.set(t.id, t);
  }

  teamIds(): string[] {
    return this.teams.map((t) => t.id);
  }

  simulateSeason(seed: number): SeasonResult {
    const ids = this.teamIds();
    const fixtures = generateFixtures(ids, {
      doubleRoundRobin: this.options.doubleRoundRobin ?? true,
    });
    const subRules = this.options.substitutionRules ?? SubstitutionRules.brasileirao();

    const results: FixtureResult[] = fixtures.map((f, index) => {
      const result = this.simulator.simulate({
        home: this.teamById.get(f.homeTeamId)!,
        away: this.teamById.get(f.awayTeamId)!,
        seed: matchSeed(seed, index),
        matchRules: MatchRules.league(),
        substitutionRules: subRules,
      });
      const goals: GoalRecord[] = result.timeline
        .filter((e) => e.type === MatchEventType.Goal)
        .map((e) => ({
          teamId: e.teamId!,
          scorerId: e.playerId!,
          assistId: e.secondaryPlayerId,
          penalty: Boolean(e.params?.penalty),
        }));
      return {
        round: f.round,
        homeTeamId: f.homeTeamId,
        awayTeamId: f.awayTeamId,
        homeScore: result.homeScore,
        awayScore: result.awayScore,
        goals,
      };
    });

    return {
      seed,
      teamIds: ids,
      fixtures: results,
      table: computeStandings(ids, results),
      stats: computeSeasonStats(ids, results),
    };
  }
}
