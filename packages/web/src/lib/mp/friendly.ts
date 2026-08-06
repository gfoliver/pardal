import { getFormationTemplate, Mentality, Position, type RoleKey } from "@fut/domain";
import { loadPlayer, type LeagueData, type PlayerData, type TeamData } from "@fut/competition";
import {
  buildDefaultTactic,
  tacticsViewOf,
  type PlayerDev,
  type SavedTactic,
  type TacticsPlayer,
  type TacticsView,
} from "@fut/career";
import { MatchProtocol, type RosterClub, type TeamInput } from "@fut/protocol";

/**
 * A friendly's own little world: one club, one tactic, no career.
 *
 * Everything here reads the dataset the app already ships and nothing else — no save, no calendar, no
 * finances. Two things it deliberately does NOT do:
 *
 *  - INVENT WHAT IT DOES NOT KNOW. A career knows a player's match fitness, his injuries and the shirt
 *    number the manager gave him; a one-off friendly knows none of that. The protocol pins `condition` to
 *    1 for every competitive match precisely so both sides agree, so "fully fit" here is the rule rather
 *    than a guess — but the shirt number is simply absent, not zero.
 *  - REIMPLEMENT THE RULES. Auto-picking, the view model and every edit come from `@fut/career`, which is
 *    where they live for the career too. A friendly that decided for itself what "move a player" means
 *    would drift from the career and both would be right about different things.
 */

/** No development to apply: nobody has trained, aged or been injured inside a friendly. */
const NO_DEV: ReadonlyMap<string, PlayerDev> = new Map();

export const clubsOf = (league: LeagueData): readonly TeamData[] => league.teams;

const dataById = (team: TeamData): ReadonlyMap<string, PlayerData> => new Map(team.players.map((p) => [p.id, p]));

/**
 * The squad as the canonical `buildTeam` reads it.
 *
 * A near-identity mapping, which is the point: the artifact's team already IS a roster, so a friendly can
 * hand the same builder the same players a career would and get the same eleven.
 */
export function rosterClubOf(team: TeamData): RosterClub {
  return {
    clubId: team.id,
    name: team.name,
    shortName: team.shortName,
    coach: team.coach,
    players: team.players,
  } as RosterClub;
}

/** A sensible side to start from: the formation that best fits the squad, and its best XI in it. */
export function defaultTacticFor(team: TeamData): SavedTactic {
  const ids = team.players.map((p) => p.id);
  return {
    id: "friendly",
    name: team.shortName,
    ...buildDefaultTactic(ids, Mentality.Balanced, dataById(team), NO_DEV),
  };
}

/** One player as the board draws him, with the fields a friendly genuinely knows. */
function playerOf(data: PlayerData, role: RoleKey | undefined): TacticsPlayer {
  const own = data.position as Position;
  return {
    playerId: data.id,
    name: data.name,
    shirtNumber: data.shirtNumber,
    position: own,
    secondaryPositions: (data.naturalPositions ?? []).filter((p) => p !== own),
    // Computed rather than read: `PlayerData` carries attributes, not a rating, and the rating is a
    // function OF them — the same function the career and the engine use, so the number on this board is
    // the number the match will play with.
    overall: Math.round(loadPlayer(data).overall()),
    age: data.age,
    nationality: data.nationality,
    available: true,
    injured: false,
    // The protocol pins every player to full condition in a competitive match, so this is the rule
    // rather than an optimistic default — see `MatchProtocol.condition`.
    fitness: MatchProtocol.condition * 100,
    role,
  } as TacticsPlayer;
}

/** The board's view of a friendly's tactic. One saved tactic, because a friendly is one match. */
export function viewOf(team: TeamData, tactic: SavedTactic, fitAt: (id: string, at: Position) => number | undefined): TacticsView {
  const byId = dataById(team);
  return tacticsViewOf<TacticsPlayer>({
    clubId: team.id,
    tactic,
    squadIds: team.players.map((p) => p.id),
    saved: [tactic],
    activeTacticId: tactic.id,
    player: (id, role) => {
      const data = byId.get(id);
      return data ? playerOf(data, role) : undefined;
    },
    fitAt,
  }) as TacticsView;
}

/**
 * The tactic as a sealed submission.
 *
 * ORDER IS DATA on both arrays and survives untouched: the starting order feeds slot assignment and the
 * bench order decides who the engine brings on. The bench is CUT to the matchday size the tactic's own
 * bench convention names — `SavedTactic.bench` lists the whole rest of the squad in preference order, and
 * submitting all of it would name reserves who never travelled.
 *
 * `fieldedPositions` is where the tactic's slot overrides land, so a full-back fielded as a winger is
 * played there by every client rather than only by the one whose screen said so.
 */
export function teamInputOf(team: TeamData, tactic: SavedTactic, benchSize: number, coachId: string): TeamInput {
  // Where the FORMATION puts each slot, for the slots the manager did not override.
  const template = getFormationTemplate(tactic.formation).map((slot) => slot.position);
  const fieldedPositions: Record<string, Position> = {};
  const roles: Record<string, string> = {};
  tactic.lineup.forEach((id, i) => {
    if (!id) return;
    fieldedPositions[id] = tactic.slotFielded?.[i] ?? template[i] ?? (Position.CentralMidfielder as Position);
    roles[id] = tactic.roles[id] ?? "";
  });
  const bench = tactic.bench.slice(0, benchSize);
  for (const id of bench) roles[id] = tactic.roles[id] ?? "";
  return {
    clubId: team.id,
    startingXi: [...tactic.lineup],
    bench,
    instructions: { formation: tactic.formation, mentality: tactic.mentality, ...tactic.instructions },
    roles,
    fieldedPositions,
    coachId,
  };
}
