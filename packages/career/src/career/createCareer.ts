import {
  assignDates,
  generateFixtures,
  type LeagueData,
  type PlayerData,
  type TeamData,
} from "@fut/competition";
import { Formation, Mentality } from "@fut/domain";
import { SeededRandom } from "@fut/engine";
import { DEFAULT_START, daysFromCivil } from "../calendar/dates.js";
import type { Club } from "../club/Club.js";
import { newObjectives } from "../club/BoardObjectives.js";
import { type Contract, SquadStatus } from "../contract/Contract.js";
import { newPlayerDev, type PlayerDev } from "../development/PlayerDev.js";
import { effectiveOverall } from "../build/PlayerFactory.js";
import { InboxMessageType } from "../inbox/types.js";
import { competitionSeed, devSeed } from "../rng/seeds.js";
import { generateUserOffers } from "../transfer/TransferMarket.js";
import type { CareerCompetition, CareerState } from "../state/CareerState.js";

export interface NewCareerOptions {
  readonly leagueId: string;
  readonly managedClubId: string;
  readonly seed: number;
  readonly daysPerRound?: number;
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

  for (const t of league.teams) {
    const withOvr = t.players.map((p) => ({ p, ovr: effectiveOverall(p) }));
    const avg = withOvr.reduce((a, e) => a + e.ovr, 0) / Math.max(1, withOvr.length);
    const reputation = Math.round(avg);

    for (const { p, ovr } of withOvr) {
      const rng = new SeededRandom(devSeed(opts.seed, 0, p.id));
      const ca = clamp(Math.round(ovr * 2), 1, 200);
      const room = p.age < 24 ? 10 + rng.int(41) : rng.int(11);
      const pa = clamp(ca + room, ca, 200);
      playerDev[p.id] = newPlayerDev(p.id, ca, pa, p.age);
    }

    // Squad status + wage by within-club overall rank (deterministic).
    const ranked = [...withOvr].sort((a, b) => b.ovr - a.ovr);
    ranked.forEach(({ p, ovr }, rank) => {
      contracts[p.id] = {
        playerId: p.id,
        clubId: t.id,
        wage: Math.round(ovr * 1200),
        expiry: { season: 1 + (hashCode(p.id) % 3), dayOfSeason: 0 },
        squadStatus: statusForRank(rank),
        signedOn: { season: 0, dayOfSeason: 0 },
      };
    });

    clubs[t.id] = buildClub(t, reputation);
  }

  const teamIds = league.teams.map((t) => t.id);
  const daysPerRound = opts.daysPerRound ?? 7;
  const fixtures = assignDates(generateFixtures(teamIds, { doubleRoundRobin: true }), {
    competitionId: "league",
    firstDay: 0,
    daysPerRound,
  });
  const totalDays = Math.max(0, ...fixtures.map((f) => f.day)) + 14;

  const competition: CareerCompetition = {
    id: "league",
    kind: "league",
    divisionId: "d1",
    seed: competitionSeed(opts.seed, 0, "league"),
    teamIds,
    fixtures,
    results: [],
    playedFixtureIndexes: [],
  };

  const state: CareerState = {
    version: 1,
    careerSeed: opts.seed,
    datasetId: league.id,
    datasetVersion: "1",
    managedClubId: opts.managedClubId,
    startEpochDay: daysFromCivil(DEFAULT_START.year, DEFAULT_START.month, DEFAULT_START.day),
    currentDate: { season: 0, dayOfSeason: 0 },
    structure: {
      divisions: [{ id: "d1", name: league.name, tier: 1, teamIds, promotionSlots: 0, relegationSlots: 0 }],
      cups: [],
    },
    competitions: [competition],
    totalDays,
    clubs,
    contracts,
    playerDev,
    transfers: { listings: [], offers: [], loans: [] },
    scoutedPlayerIds: [],
    targetPlayerIds: [],
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

function buildClub(t: TeamData, reputation: number): Club {
  // Simple reputation-scaled finances (integer currency units).
  const balance = reputation * 200_000;
  return {
    id: t.id,
    name: t.name,
    shortName: t.shortName,
    divisionId: "d1",
    squad: { clubId: t.id, playerIds: t.players.map((p) => p.id), coach: t.coach },
    finance: {
      balance,
      wageBudgetPerPeriod: reputation * 5_000,
      transferBudget: Math.round(balance * 0.4),
      revenue: {
        matchdayPerHomeGame: reputation * 8_000,
        tvPerRound: reputation * 3_000,
        prizeMoneyByFinalPosition: [],
      },
    },
    formation: Formation.F442,
    mentality: t.mentality ?? Mentality.Balanced,
    objectives: newObjectives(midTableTarget(reputation)),
    reputation,
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
