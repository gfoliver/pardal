import { Formation, MarkingScheme, Mentality, Position } from "@fut/domain";
import type { TeamInput } from "@fut/protocol";

/**
 * What the server can and cannot check about a submitted lineup.
 *
 * IT HOLDS NO SQUADS. The roster is the published dataset both clients already have, and putting 1305
 * players into D1 to validate a submission would buy a check the clients can do themselves at the cost
 * of a data path to keep in step with the artifact. So this validates the SHAPE of a submission — eleven
 * distinct starters, a bench that does not contain them, a role and a fielded position for every one of
 * them, instructions in range — and nothing about whether those ids are footballers at that club.
 *
 * The honest consequence: a caller can seal a lineup naming players who do not exist. It cannot forge a
 * RESULT with it — `buildTeam` refuses ids the roster does not contain, so every attester, both
 * participants included, fails to simulate and the fixture never confirms. The check that matters is
 * therefore downstream, and this one exists to reject the ordinary mistakes at the door rather than
 * discovering them after a fixture has locked.
 *
 * WHY VALIDATE AT ALL, then: a lineup is one-shot and locks the fixture. A submission that is merely
 * malformed would otherwise burn the player's only submission and strand the opponent in a fixture
 * nobody can play.
 */

/** The engine makes at most five substitutions; a longer bench is allowed and simply unused. */
const MAX_BENCH = 9;
const XI = 11;

const POSITIONS = new Set<string>(Object.values(Position));
const FORMATIONS = new Set<string>(Object.values(Formation));
const MENTALITIES = new Set<unknown>(Object.values(Mentality));
const MARKING = new Set<unknown>(Object.values(MarkingScheme));

/** A unit interval, which is how the engine reads every tactical dial. */
const isDial = (v: unknown): boolean => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;

const isIdList = (v: unknown, max: number): v is string[] =>
  Array.isArray(v) && v.length <= max && v.every((x) => typeof x === "string" && x.length > 0 && x.length <= 64);

/**
 * The problem with this submission, or null.
 *
 * Returns a sentence for a person, because every one of these is something a client could have got
 * right and the client author is the one who has to read it.
 */
export function lineupProblem(value: unknown, expectedClubId: string): string | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return "input must be an object";
  const input = value as Partial<TeamInput>;

  if (input.clubId !== expectedClubId) return `input.clubId must be ${expectedClubId}, the club you entered with`;
  if (!isIdList(input.startingXi, XI) || input.startingXi.length !== XI) return `startingXi must be ${XI} player ids`;
  if (!isIdList(input.bench, MAX_BENCH)) return `bench must be at most ${MAX_BENCH} player ids`;

  const xi = new Set(input.startingXi);
  if (xi.size !== XI) return "startingXi has a repeated player";
  const bench = new Set(input.bench);
  if (bench.size !== input.bench.length) return "bench has a repeated player";
  for (const id of bench) if (xi.has(id)) return `${id} is in both the starting eleven and the bench`;

  if (typeof input.coachId !== "string" || input.coachId.length === 0) return "coachId is required";

  // A role and a position for every starter, and nothing said about anybody else: the engine assigns
  // slots from the XI, and an entry for a player who is not playing is a sign the client is confused
  // about which submission it is building.
  const roles = input.roles;
  const fielded = input.fieldedPositions;
  if (roles === null || typeof roles !== "object") return "roles must be an object";
  if (fielded === null || typeof fielded !== "object") return "fieldedPositions must be an object";
  for (const id of xi) {
    if (typeof (roles as Record<string, unknown>)[id] !== "string") return `roles is missing ${id}`;
    const at = (fielded as Record<string, unknown>)[id];
    if (typeof at !== "string" || !POSITIONS.has(at)) return `fieldedPositions[${id}] is not a position`;
  }
  for (const id of Object.keys(roles)) if (!xi.has(id) && !bench.has(id)) return `roles names ${id}, who is not in the squad`;
  for (const id of Object.keys(fielded)) if (!xi.has(id) && !bench.has(id)) return `fieldedPositions names ${id}, who is not in the squad`;

  const t = input.instructions;
  if (t === null || typeof t !== "object") return "instructions must be an object";
  if (!FORMATIONS.has(t.formation as string)) return "instructions.formation is not a formation";
  if (!MENTALITIES.has(t.mentality)) return "instructions.mentality is not a mentality";
  if (!MARKING.has(t.markingScheme)) return "instructions.markingScheme is not a marking scheme";
  for (const dial of ["tempo", "pressing", "lineHeight", "width", "directness"] as const) {
    if (!isDial(t[dial])) return `instructions.${dial} must be between 0 and 1`;
  }
  // `familiarity` is deliberately NOT accepted from a client: it is a property of a squad's drilling, and
  // a side that could set its own would set it to 1. It is absent here and defaults inside the engine.
  if ("familiarity" in t) return "instructions.familiarity is not yours to set";

  return null;
}
