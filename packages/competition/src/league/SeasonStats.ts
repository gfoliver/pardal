import { type FixtureResult } from "./Standings.js";

export interface ScorerRow {
  readonly playerId: string;
  readonly teamId: string;
  readonly goals: number;
}

export interface AssisterRow {
  readonly playerId: string;
  readonly teamId: string;
  readonly assists: number;
}

/** Defensive record per team (attributable to its goalkeeper). */
export interface DefensiveRow {
  readonly teamId: string;
  readonly goalsAgainst: number;
  readonly cleanSheets: number;
}

export type ResultChar = "W" | "D" | "L";

export interface FormRow {
  readonly teamId: string;
  /** Recent results, oldest → newest (most recent last). */
  readonly recent: readonly ResultChar[];
}

export interface SeasonStats {
  readonly topScorers: readonly ScorerRow[];
  readonly topAssisters: readonly AssisterRow[];
  readonly defensive: readonly DefensiveRow[];
  readonly form: readonly FormRow[];
}

/**
 * Aggregates league-wide statistics from played fixtures: top scorers, top
 * assisters, defensive records (fewest goals conceded / clean sheets) and each
 * team's recent form. Pure and deterministic — recomputable from a snapshot.
 */
export function computeSeasonStats(
  teamIds: readonly string[],
  fixtures: readonly FixtureResult[],
  options: { formLength?: number } = {},
): SeasonStats {
  const formLength = options.formLength ?? 5;

  const goalsBy = new Map<string, { teamId: string; goals: number }>();
  const assistsBy = new Map<string, { teamId: string; assists: number }>();
  const defence = new Map<string, { goalsAgainst: number; cleanSheets: number }>();
  const formByTeam = new Map<string, ResultChar[]>();
  for (const id of teamIds) {
    defence.set(id, { goalsAgainst: 0, cleanSheets: 0 });
    formByTeam.set(id, []);
  }

  for (const goal of fixtures.flatMap((f) => f.goals ?? [])) {
    const scorer = goalsBy.get(goal.scorerId) ?? { teamId: goal.teamId, goals: 0 };
    scorer.goals += 1;
    goalsBy.set(goal.scorerId, scorer);
    if (goal.assistId) {
      const assister =
        assistsBy.get(goal.assistId) ?? { teamId: goal.teamId, assists: 0 };
      assister.assists += 1;
      assistsBy.set(goal.assistId, assister);
    }
  }

  for (const f of fixtures) {
    const home = defence.get(f.homeTeamId);
    const away = defence.get(f.awayTeamId);
    if (home) {
      home.goalsAgainst += f.awayScore;
      if (f.awayScore === 0) home.cleanSheets += 1;
    }
    if (away) {
      away.goalsAgainst += f.homeScore;
      if (f.homeScore === 0) away.cleanSheets += 1;
    }
  }

  for (const f of [...fixtures].sort((a, b) => a.round - b.round)) {
    pushForm(formByTeam, f.homeTeamId, resultFor(f.homeScore, f.awayScore));
    pushForm(formByTeam, f.awayTeamId, resultFor(f.awayScore, f.homeScore));
  }

  const topScorers: ScorerRow[] = [...goalsBy.entries()]
    .map(([playerId, v]) => ({ playerId, teamId: v.teamId, goals: v.goals }))
    .filter((r) => r.goals > 0)
    .sort((a, b) => b.goals - a.goals || a.playerId.localeCompare(b.playerId));

  const topAssisters: AssisterRow[] = [...assistsBy.entries()]
    .map(([playerId, v]) => ({ playerId, teamId: v.teamId, assists: v.assists }))
    .filter((r) => r.assists > 0)
    .sort((a, b) => b.assists - a.assists || a.playerId.localeCompare(b.playerId));

  const defensive: DefensiveRow[] = teamIds
    .map((teamId) => ({ teamId, ...defence.get(teamId)! }))
    .sort(
      (a, b) =>
        a.goalsAgainst - b.goalsAgainst ||
        b.cleanSheets - a.cleanSheets ||
        a.teamId.localeCompare(b.teamId),
    );

  const form: FormRow[] = teamIds.map((teamId) => ({
    teamId,
    recent: (formByTeam.get(teamId) ?? []).slice(-formLength),
  }));

  return { topScorers, topAssisters, defensive, form };
}

function resultFor(scored: number, conceded: number): ResultChar {
  if (scored > conceded) return "W";
  if (scored < conceded) return "L";
  return "D";
}

function pushForm(
  formByTeam: Map<string, ResultChar[]>,
  teamId: string,
  r: ResultChar,
): void {
  formByTeam.get(teamId)?.push(r);
}
