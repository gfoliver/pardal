import {
  assignDates,
  byCodepoint,
  type ClubMeta,
  type DatasetWorld,
  generateFixtures,
  type LeagueData,
  type PlayerData,
  type TeamData,
} from "@fut/competition";
import { Mentality } from "@fut/domain";
import { SeededRandom } from "@fut/engine";
import { DEFAULT_START, daysFromCivil } from "../calendar/dates.js";
import type { Club } from "../club/Club.js";
import { newObjectives } from "../club/BoardObjectives.js";
import { MONTHS_PER_SEASON, seasonBudget } from "../club/Finance.js";
import { marketValue, monthlyWage } from "../value/marketValue.js";
import { type Contract, SquadStatus } from "../contract/Contract.js";
import { newPlayerDev, type PlayerDev } from "../development/PlayerDev.js";
import { effectiveOverall } from "../build/PlayerFactory.js";
import { buildDefaultTactic, type SavedTactic } from "../tactics/StoredTactics.js";
import { InboxMessageType } from "../inbox/types.js";
import type { CupConfig, Division } from "../structure/types.js";
import { competitionSeed, devSeed } from "../rng/seeds.js";
import { emptyScouting } from "../scouting/types.js";
import { generateUserOffers } from "../transfer/TransferMarket.js";
import type { CareerCompetition, CareerState } from "../state/CareerState.js";

/**
 * Days between the season opening and the first fixture.
 *
 * A run-up the manager can actually use: look at the squad, drill a tactic,
 * send a scout out, take a bid. Also what makes the day-by-day advance mean
 * something from the very first press.
 */
export const PRESEASON_DAYS = 7;

/**
 * How many clubs change division a season. The Brasileirão's own numbers, and they are symmetric on
 * purpose: four up and four down keeps every division the size it started, so the fixture list of a
 * twenty-club league stays a twenty-club league for the life of the career.
 */
export const RELEGATED_PER_SEASON = 4;
export const PROMOTED_PER_SEASON = 4;

export interface NewCareerOptions {
  readonly leagueId: string;
  readonly managedClubId: string;
  readonly seed: number;
  readonly daysPerRound?: number;
  /** Optional dataset world (competitions + club metadata) to seed structure. */
  readonly world?: DatasetWorld;
}

/** Index every player's base data across a league by id. */
export function indexPlayers(league: LeagueData): Map<string, PlayerData> {
  const m = new Map<string, PlayerData>();
  for (const t of league.teams) for (const p of t.players) m.set(p.id, p);
  return m;
}

/** Build the initial, deterministic career state from a dataset league. */
export function createCareer(league: LeagueData, opts: NewCareerOptions): CareerState {
  const dataById = indexPlayers(league);
  const clubs: Record<string, Club> = {};
  const playerDev: Record<string, PlayerDev> = {};
  const contracts: Record<string, Contract> = {};
  const worldClubs = new Map((opts.world?.clubs ?? []).map((c) => [c.id, c]));

  /*
   * The calendar is built FIRST because contracts need to know how long a season is.
   *
   * Every deal used to expire on `dayOfSeason: 0`, so a club's whole cohort lapsed on one day —
   * eleven of Flamengo's twenty-eight at once, best players included. Spreading them needs
   * `totalDays`, and it is derived from the fixture list, so the fixture list comes before the squads.
   */
  const teamIds = league.teams.map((t) => t.id);
  const daysPerRound = opts.daysPerRound ?? 7;
  const divisions = divisionsFromWorld(league, teamIds, opts.world);
  /** Which division each club plays in, so the club records agree with the structure. */
  const divisionOf = new Map<string, string>();
  for (const d of divisions) for (const id of d.teamIds) divisionOf.set(id, d.id);

  const competitions: CareerCompetition[] = divisions.map((d) => ({
    id: leagueCompetitionId(d.id),
    kind: "league",
    divisionId: d.id,
    seed: competitionSeed(opts.seed, 0, leagueCompetitionId(d.id)),
    // Its OWN array, not an alias of the division's: this is the season's entry list, and
    // promotion/relegation rewrites it while the structure's own list is rewritten separately.
    teamIds: [...d.teamIds],
    fixtures: assignDates(generateFixtures(d.teamIds, { doubleRoundRobin: true }), {
      competitionId: leagueCompetitionId(d.id),
      // A week of pre-season before a ball is kicked. Starting on day 0 dropped
      // the manager straight into a fixture with no room to look at his squad,
      // set a tactic or sign anyone — and no sense of the season having a run-up.
      firstDay: PRESEASON_DAYS,
      daysPerRound,
    }),
    results: [],
    playedFixtureIndexes: [],
  }));
  // Across every division: the season has to be long enough for the longest calendar in it, or the
  // lower tier's last rounds would fall outside the year.
  const totalDays = Math.max(0, ...competitions.flatMap((c) => c.fixtures.map((f) => f.day))) + 14;

  for (const t of league.teams) {
    const withOvr = t.players.map((p) => ({ p, ovr: effectiveOverall(p) }));
    const avg = withOvr.reduce((a, e) => a + e.ovr, 0) / Math.max(1, withOvr.length);
    const meta = worldClubs.get(t.id);
    const reputation = meta?.reputation ?? Math.round(avg);

    for (const { p, ovr } of withOvr) {
      const rng = new SeededRandom(devSeed(opts.seed, 0, p.id));
      const ca = clamp(Math.round(ovr * 2), 1, 200);
      const room = p.age < 24 ? 10 + rng.int(41) : rng.int(11);
      const pa = clamp(ca + room, ca, 200);
      playerDev[p.id] = newPlayerDev(p.id, ca, pa, p.age);
    }

    // Squad status + MONTHLY wage by market value (real when the dataset has it).
    const ranked = [...withOvr].sort((a, b) => b.ovr - a.ovr);
    let wageBill = 0;
    ranked.forEach(({ p, ovr }, rank) => {
      const dev = playerDev[p.id];
      const value = p.marketValue && p.marketValue > 0 ? p.marketValue : marketValue({ overall: ovr, age: p.age, currentAbility: dev?.currentAbility ?? 0, potentialAbility: dev?.potentialAbility ?? 0 });
      const wage = monthlyWage(value);
      wageBill += wage;
      contracts[p.id] = {
        playerId: p.id,
        clubId: t.id,
        wage,
        /*
         * Spread across the season, not all on day 0.
         *
         * The season is the coarse part (1..3 seasons out, from the id) and the DAY is what stops it
         * being a cliff: on day 0 a club's whole cohort lapsed together, so the manager faced eleven
         * renewals on one date instead of eleven decisions spread over a year, each with its own
         * warnings. A second, independent hash so a player's expiry day is not correlated with the
         * season he expires in.
         */
        expiry: { season: 1 + (hashCode(p.id) % 3), dayOfSeason: hashCode(`${p.id}:day`) % Math.max(1, totalDays) },
        squadStatus: statusForRank(rank),
        signedOn: { season: 0, dayOfSeason: 0 },
      };
    });

    const devById = new Map(Object.entries(playerDev));
    const mentality = t.mentality ?? Mentality.Balanced;
    const tactic = buildDefaultTactic(t.players.map((p) => p.id), mentality, dataById, devById);
    clubs[t.id] = buildClub(opts.seed, t, reputation, wageBill, tactic, divisionOf.get(t.id) ?? divisions[0]!.id, meta);
  }

  const state: CareerState = {
    version: 1,
    careerSeed: opts.seed,
    datasetId: league.id,
    datasetVersion: "1",
    managedClubId: opts.managedClubId,
    startEpochDay: daysFromCivil(DEFAULT_START.year, DEFAULT_START.month, DEFAULT_START.day),
    currentDate: { season: 0, dayOfSeason: 0 },
    structure: {
      divisions,
      cups: cupsFromWorld(opts.world, new Set(teamIds)),
    },
    competitions,
    totalDays,
    clubs,
    contracts,
    playerDev,
    transfers: { listings: [], offers: [], loans: [] },
    negotiations: [],
    scouting: emptyScouting(),
    scoutedPlayerIds: [],
    targetPlayerIds: [],
    nextEntityId: 1,
    inbox: [
      {
        id: `board-${opts.managedClubId}-0`,
        type: InboxMessageType.BoardObjectiveSet,
        date: { season: 0, dayOfSeason: 0 },
        read: false,
        params: { clubId: opts.managedClubId, target: clubs[opts.managedClubId]?.objectives.leaguePositionTarget ?? 0 },
      },
    ],
  };
  generateUserOffers(state, dataById, 0); // opening-window interest in our players
  return state;
}

/**
 * The competition id of a division's league.
 *
 * The top flight keeps the bare `league` it has always had. That is deliberate rather than tidy: the
 * id is in every existing save's fixtures and results, and renaming it would either break them or buy
 * a migration for no gain. Lower tiers are named after their division.
 */
export const leagueCompetitionId = (divisionId: string): string =>
  divisionId === "d1" ? "league" : `league-${divisionId}`;

/**
 * The pyramid, derived from the world rather than assumed.
 *
 * A dataset that describes one league produces one division, which is what every career up to now
 * has been. A dataset describing a Série A and a Série B produces both, ordered by tier, and the
 * career simulates each — `pendingFixtures` already walks every competition, so the second division
 * plays itself without any further plumbing.
 *
 * Each division is restricted to clubs whose SQUADS are actually in the `LeagueData`. A world listing
 * entrants we have no players for would otherwise generate fixtures for phantom clubs, and the first
 * sign of it would be a match that cannot pick a side.
 */
function divisionsFromWorld(league: LeagueData, teamIds: readonly string[], world?: DatasetWorld): Division[] {
  const known = new Set(teamIds);
  const leagues = (world?.competitions ?? [])
    .filter((c) => c.type === "league")
    .map((c) => ({ info: c, tier: c.tier ?? 1, entrants: c.entrantClubIds.filter((id) => known.has(id)) }))
    .filter((c) => c.entrants.length >= 2)
    .sort((a, b) => a.tier - b.tier || byCodepoint(a.info.id, b.info.id));

  // No world, or a world whose leagues we have no squads for: one division over everything we do have.
  if (leagues.length === 0) {
    return [{ id: "d1", name: league.name, tier: 1, teamIds, promotionSlots: 0, relegationSlots: 0 }];
  }

  return leagues.map((l, i) => ({
    id: `d${i + 1}`,
    name: l.info.name,
    tier: i + 1,
    sourceCompetitionId: l.info.id,
    teamIds: l.entrants,
    /*
     * Brasileirão's own rule: four down from Série A, four up from Série B.
     *
     * Expressed as a pair of slots per division rather than one number for the pyramid, because the
     * top tier promotes nobody and the bottom relegates nobody — and reading it off `tier` alone
     * would silently invent a third division's worth of movement the moment one is added.
     */
    promotionSlots: i === 0 ? 0 : PROMOTED_PER_SEASON,
    relegationSlots: i === leagues.length - 1 ? 0 : RELEGATED_PER_SEASON,
  }));
}

/** Cup descriptors from the world, restricted to clubs present in this career. */
function cupsFromWorld(world: DatasetWorld | undefined, known: ReadonlySet<string>): CupConfig[] {
  return (world?.competitions ?? [])
    .filter((c) => c.type === "cup")
    .map((c) => ({
      id: c.id,
      name: c.name,
      entrantTeamIds: c.entrantClubIds.filter((id) => known.has(id)),
      twoLegged: c.format?.twoLegged ?? true,
    }));
}

function buildClub(
  careerSeed: number,
  t: TeamData,
  reputation: number,
  monthlyWageBill: number,
  tactic: Omit<SavedTactic, "id" | "name">,
  divisionId: string,
  meta?: ClubMeta,
): Club {
  // One pot for the season, anchored to the payroll it has to cover. No opening cash and
  // no revenue streams: see the note on `Finance` for what those were doing and why
  // nothing missed them.
  return {
    id: t.id,
    name: t.name,
    shortName: t.shortName,
    nickname: meta?.nickname,
    divisionId,
    squad: { clubId: t.id, playerIds: t.players.map((p) => p.id), coach: t.coach },
    finance: {
      annualBudget: seasonBudget(careerSeed, t.id, monthlyWageBill * MONTHS_PER_SEASON),
      feesPaid: 0,
      feesReceived: 0,
    },
    tacticSlots: [{ id: "t1", name: "1", ...tactic }],
    activeTacticId: "t1",
    objectives: newObjectives(midTableTarget(reputation)),
    reputation,
    country: meta?.country,
    city: meta?.city,
    stadium: meta?.stadium,
    capacity: meta?.capacity,
    founded: meta?.founded,
    colours: meta?.colours,
    crest: meta?.crest,
    kits: meta?.kits,
  };
}

/** Stronger squads are expected to finish higher. */
function midTableTarget(reputation: number): number {
  if (reputation >= 78) return 1;
  if (reputation >= 70) return 4;
  if (reputation >= 62) return 8;
  return 12;
}

function statusForRank(rank: number): SquadStatus {
  if (rank < 3) return SquadStatus.Key;
  if (rank < 7) return SquadStatus.FirstTeam;
  if (rank < 12) return SquadStatus.Rotation;
  if (rank < 16) return SquadStatus.Backup;
  return SquadStatus.Surplus;
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}
