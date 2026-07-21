import {
  Coach,
  Formation,
  Goalkeeper,
  Mentality,
  Player,
  Position,
  TacticsBuilder,
  Team,
} from "@fut/domain";
import {
  type CoachData,
  type LeagueData,
  type PlayerData,
  type TeamData,
} from "./schema.js";

/** Error thrown when input data fails validation. */
export class DataValidationError extends Error {}

const VALID_POSITIONS = new Set<string>(Object.values(Position));

function parsePosition(value: string, ctx: string): Position {
  if (!VALID_POSITIONS.has(value)) {
    throw new DataValidationError(`Invalid position "${value}" in ${ctx}`);
  }
  return value as Position;
}

/** Map one player's data to a domain `Player`/`Goalkeeper`. */
export function loadPlayer(data: PlayerData): Player {
  const position = parsePosition(data.position, `player ${data.id}`);
  const naturalPositions = data.naturalPositions?.map((p) =>
    parsePosition(p, `player ${data.id} naturalPositions`),
  );

  if (position === Position.Goalkeeper) {
    if (!data.goalkeeping) {
      throw new DataValidationError(`Goalkeeper ${data.id} is missing goalkeeping attributes`);
    }
    return new Goalkeeper({
      id: data.id,
      name: data.name,
      age: data.age,
      nationality: data.nationality,
      naturalPositions,
      physical: data.physical,
      mental: data.mental,
      technical: data.technical,
      goalkeeping: data.goalkeeping,
    });
  }

  return new Player({
    id: data.id,
    name: data.name,
    age: data.age,
    nationality: data.nationality,
    position,
    naturalPositions,
    physical: data.physical,
    mental: data.mental,
    technical: data.technical,
  });
}

export function loadCoach(data: CoachData): Coach {
  return new Coach({
    id: data.id,
    name: data.name,
    age: data.age,
    nationality: data.nationality,
    attributes: data.attributes,
  });
}

/** Map one team's data to a domain `Team` (first 11 = XI, uses simple tactics). */
export function loadTeam(data: TeamData): Team {
  if (data.players.length < 11) {
    throw new DataValidationError(`Team ${data.id} has fewer than 11 players`);
  }
  const players = data.players.map(loadPlayer);
  const startingXi = players.slice(0, 11);
  const bench = players.slice(11);

  if (!startingXi.some((p) => p instanceof Goalkeeper)) {
    throw new DataValidationError(`Team ${data.id} has no goalkeeper in the starting XI`);
  }

  const tactics = new TacticsBuilder().simple(startingXi, {
    formation: Formation.F442,
    mentality: data.mentality ?? Mentality.Balanced,
  });

  return new Team({
    id: data.id,
    name: data.name,
    shortName: data.shortName,
    coach: loadCoach(data.coach),
    startingXi,
    bench,
    tactics,
  });
}

export function loadTeams(data: readonly TeamData[]): Team[] {
  return data.map(loadTeam);
}

export function loadLeagueTeams(data: LeagueData): Team[] {
  return loadTeams(data.teams);
}
