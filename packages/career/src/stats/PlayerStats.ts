import type { FixtureResult, PlayerMatchLine } from "@fut/competition";
import type { Team, Player } from "@fut/domain";
import { PositionGroup, positionGroup } from "@fut/domain";
import { MatchEventType, type MatchResult } from "@fut/engine";

const FULL_MATCH = 90;

/** Clamp a rating into the plausible 4.5–10 band, rounded to one decimal. */
function roundRating(r: number): number {
  const c = Math.max(4.5, Math.min(10, r));
  return Math.round(c * 10) / 10;
}

/**
 * Derive each player's appearance line (minutes + match rating) for a finished
 * fixture. Pure and deterministic: minutes come from the starting XI and the
 * substitution timeline; the rating is a transparent heuristic over goals,
 * assists, clean sheets, cards and the result. Goals/assists themselves are NOT
 * stored here — they live in the result's `goals[]`.
 */
export function computeMatchLines(home: Team, away: Team, result: MatchResult): PlayerMatchLine[] {
  const lines: PlayerMatchLine[] = [];
  for (const team of [home, away]) {
    const conceded = team.id === result.homeTeamId ? result.awayScore : result.homeScore;
    const winnerTeamId = result.outcome?.winnerTeamId;
    const won = team.id === winnerTeamId;
    const draw = !winnerTeamId;
    const posById = new Map<string, Player>();
    for (const p of [...team.startingXi, ...team.bench]) posById.set(p.id, p);

    // Minutes: starters play from 0; adjust for subs (in = playerId, out = secondary).
    const minutes = new Map<string, number>();
    for (const p of team.startingXi) minutes.set(p.id, FULL_MATCH);
    for (const e of result.timeline) {
      if (e.type !== MatchEventType.Substitution || e.teamId !== team.id) continue;
      if (e.secondaryPlayerId) minutes.set(e.secondaryPlayerId, e.minute); // came off
      if (e.playerId) minutes.set(e.playerId, FULL_MATCH - e.minute); // came on
    }

    for (const [playerId, mins] of minutes) {
      const player = posById.get(playerId);
      if (!player || mins <= 0) continue;
      const goals = result.timeline.filter((e) => e.type === MatchEventType.Goal && e.teamId === team.id && e.playerId === playerId).length;
      const assists = result.timeline.filter((e) => e.type === MatchEventType.Goal && e.teamId === team.id && e.secondaryPlayerId === playerId).length;
      const card = result.discipline?.byPlayer?.[playerId]; // watched results may omit discipline
      const group = positionGroup(player.position);
      const isDefensive = group === PositionGroup.Goalkeeper || group === PositionGroup.Defence;

      let rating = 6.0;
      rating += won ? 0.3 : draw ? 0 : -0.3;
      rating += goals * 0.9;
      rating += assists * 0.5;
      if (conceded === 0 && isDefensive) rating += 0.4;
      if (isDefensive) rating -= conceded * 0.12;
      if (card?.yellow) rating -= 0.3 * card.yellow;
      if (card?.red) rating -= 1.0;
      if (mins < 25) rating = 6.0 + (rating - 6.0) * 0.4; // brief cameo → muted

      lines.push({ playerId, teamId: team.id, minutes: mins, rating: roundRating(rating) });
    }
  }
  return lines;
}

/** A player's line in one competition. */
export interface CompetitionStatLine {
  readonly competitionId: string;
  readonly appearances: number;
  readonly goals: number;
  readonly assists: number;
  readonly ratingSum: number;
}

/** A single past appearance (for the "last games" list). */
export interface PlayerGame {
  readonly competitionId: string;
  readonly round: number;
  readonly teamId: string;
  readonly opponentId: string;
  readonly home: boolean;
  readonly goalsFor: number;
  readonly goalsAgainst: number;
  readonly rating: number;
  readonly goals: number;
  readonly assists: number;
}

export interface AggregatedStats {
  readonly appearances: number;
  readonly goals: number;
  readonly assists: number;
  readonly minutes: number;
  readonly ratingSum: number;
  readonly byCompetition: CompetitionStatLine[];
  readonly games: PlayerGame[];
}

/** Fold every stored result across competitions into one player's season stats. */
export function aggregatePlayerStats(
  competitions: readonly { id: string; results: readonly FixtureResult[] }[],
  playerId: string,
): AggregatedStats {
  const byComp = new Map<string, CompetitionStatLine>();
  const games: PlayerGame[] = [];
  let appearances = 0;
  let minutes = 0;
  let ratingSum = 0;
  let goalsTotal = 0;
  let assistsTotal = 0;

  for (const comp of competitions) {
    for (const fr of comp.results) {
      const line = fr.players?.find((p) => p.playerId === playerId);
      if (!line) continue;
      const goals = (fr.goals ?? []).filter((g) => g.scorerId === playerId).length;
      const assists = (fr.goals ?? []).filter((g) => g.assistId === playerId).length;
      appearances += 1;
      minutes += line.minutes;
      ratingSum += line.rating;
      goalsTotal += goals;
      assistsTotal += assists;

      const prev = byComp.get(comp.id) ?? { competitionId: comp.id, appearances: 0, goals: 0, assists: 0, ratingSum: 0 };
      byComp.set(comp.id, {
        competitionId: comp.id,
        appearances: prev.appearances + 1,
        goals: prev.goals + goals,
        assists: prev.assists + assists,
        ratingSum: prev.ratingSum + line.rating,
      });

      const home = fr.homeTeamId === line.teamId;
      games.push({
        competitionId: comp.id,
        round: fr.round,
        teamId: line.teamId,
        opponentId: home ? fr.awayTeamId : fr.homeTeamId,
        home,
        goalsFor: home ? fr.homeScore : fr.awayScore,
        goalsAgainst: home ? fr.awayScore : fr.homeScore,
        rating: line.rating,
        goals,
        assists,
      });
    }
  }

  return {
    appearances,
    goals: goalsTotal,
    assists: assistsTotal,
    minutes,
    ratingSum,
    byCompetition: [...byComp.values()],
    games,
  };
}
