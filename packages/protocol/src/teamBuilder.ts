import {
  Coach,
  getRole,
  Goalkeeper,
  Player,
  Position,
  TacticsBuilder,
  Team,
  type Role,
} from "@fut/domain";
import type { TeamInput } from "./match.js";
import type { RosterClub, RosterPlayer } from "./roster.js";

/**
 * The one way a `Team` is built from a sealed match record.
 *
 * Every attester and every server-side check goes through this function, because two
 * clients assembling the same `Team` slightly differently diverge for a reason no seed
 * can explain and no scoreline can diagnose.
 *
 * It MAKES NO DECISIONS. That is the property that matters, and it is what separates
 * it from the career's `buildMatchTeam`, which quite correctly replaces an injured
 * starter, pulls a substitute from the squad and applies development deltas. Every one
 * of those is a judgement about incomplete information — and two clients with slightly
 * different views of who is fit would judge differently and build different elevens.
 * So all of it happens BEFORE the record is sealed, and lands in the record as
 * explicit ids. Here, a missing or contradictory id is an error, never a substitution.
 */
export class TeamBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TeamBuildError";
  }
}

function toPlayer(data: RosterPlayer): Player {
  const common = {
    id: data.id,
    name: data.name,
    age: data.age,
    nationality: data.nationality,
    physical: data.physical,
    mental: data.mental,
    technical: data.technical,
  };
  if (data.position === Position.Goalkeeper) {
    if (!data.goalkeeping) {
      throw new TeamBuildError(`goalkeeper ${data.id} has no goalkeeping attributes`);
    }
    // A Goalkeeper INSTANCE, not a Player with a goalkeeper's position: `Team.goalkeeper()`
    // finds the keeper with `instanceof`, and the shot resolver falls back to a
    // mediocre default keeper when it finds none — so getting this wrong does not throw,
    // it quietly makes every shot easier to score.
    return new Goalkeeper({
      ...common,
      naturalPositions: data.naturalPositions,
      goalkeeping: data.goalkeeping,
    });
  }
  if (data.goalkeeping) {
    throw new TeamBuildError(`outfielder ${data.id} carries goalkeeping attributes`);
  }
  return new Player({ ...common, position: data.position, naturalPositions: data.naturalPositions });
}

export function buildTeam(input: TeamInput, club: RosterClub): Team {
  if (input.clubId !== club.clubId) {
    throw new TeamBuildError(`input names club ${input.clubId} but roster is ${club.clubId}`);
  }

  const byId = new Map(club.players.map((p) => [p.id, p]));
  const take = (id: string, where: string): RosterPlayer => {
    const found = byId.get(id);
    if (!found) throw new TeamBuildError(`${where} names ${id}, absent from ${club.clubId}'s roster`);
    return found;
  };

  const seen = new Set<string>();
  const claim = (id: string, where: string): void => {
    if (seen.has(id)) throw new TeamBuildError(`${id} appears twice (${where})`);
    seen.add(id);
  };

  if (input.startingXi.length !== 11) {
    throw new TeamBuildError(`starting XI has ${input.startingXi.length} players, not 11`);
  }
  input.startingXi.forEach((id) => claim(id, "starting XI"));
  input.bench.forEach((id) => claim(id, "bench"));

  // Order is preserved exactly as submitted, in both arrays: the XI's order feeds slot
  // assignment and the bench's order is the engine's substitution queue.
  const startingXi = input.startingXi.map((id) => toPlayer(take(id, "starting XI")));
  const bench = input.bench.map((id) => toPlayer(take(id, "bench")));

  if (!startingXi.some((p) => p instanceof Goalkeeper)) {
    throw new TeamBuildError(`${club.clubId} fielded no goalkeeper`);
  }

  const fielded = new Map<string, Position>();
  const roles = new Map<string, Role>();
  for (const id of input.startingXi) {
    const at = input.fieldedPositions[id];
    if (at === undefined) throw new TeamBuildError(`no fielded position given for ${id}`);
    fielded.set(id, at);
    const roleKey = input.roles[id];
    if (roleKey === undefined) throw new TeamBuildError(`no role given for ${id}`);
    // `getRole` throws on an unknown key, which is the right outcome: a role the
    // record names and this build does not have is a version mismatch, not a default.
    roles.set(id, getRole(roleKey));
  }

  if (input.coachId !== club.coach.id) {
    throw new TeamBuildError(`input names coach ${input.coachId}, roster has ${club.coach.id}`);
  }

  return new Team({
    id: club.clubId,
    name: club.name,
    shortName: club.shortName,
    coach: new Coach({
      id: club.coach.id,
      name: club.coach.name,
      age: club.coach.age,
      nationality: club.coach.nationality,
      attributes: club.coach.attributes,
    }),
    startingXi,
    bench,
    tactics: new TacticsBuilder().advanced(startingXi, roles, input.instructions, fielded),
  });
}
