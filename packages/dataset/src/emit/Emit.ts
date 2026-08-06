import { Position } from "@fut/domain";
import type { ClubMeta, CompetitionInfo, DatasetWorld, LeagueData, PlayerData, TeamData } from "@fut/competition";
import type { RawSnapshot } from "../raw/RawSnapshot.js";
import { inferCoach, type InferredPlayer } from "../infer/InferAttributes.js";
import { clubNickname } from "../mapping/clubNickname.js";
import { clubKits } from "../mapping/clubKits.js";
import type { Attribute } from "../infer/Attribute.js";

/** Per-player attribute provenance, kept alongside the plain LeagueData. */
export interface EvidenceSidecar {
  readonly players: readonly {
    readonly id: string;
    readonly overall: number;
    readonly attributes: Readonly<Record<string, Attribute>>;
  }[];
}

export interface EmitResult {
  readonly league: LeagueData;
  readonly world: DatasetWorld;
  readonly evidence: EvidenceSidecar;
}

const val = <T extends Record<string, Attribute>>(r: T): Record<keyof T, number> =>
  Object.fromEntries(Object.entries(r).map(([k, a]) => [k, a.value])) as Record<keyof T, number>;

/** Order a club's players so the first 11 are a valid XI with a goalkeeper. */
function orderSquad(players: InferredPlayer[]): InferredPlayer[] {
  const byRating = [...players].sort((a, b) => b.overall - a.overall || (a.id < b.id ? -1 : 1));
  const keepers = byRating.filter((p) => p.position === Position.Goalkeeper);
  const outfield = byRating.filter((p) => p.position !== Position.Goalkeeper);
  if (keepers.length === 0) return byRating; // validation will flag; nothing to guarantee
  const xi = [keepers[0]!, ...outfield.slice(0, 10)];
  const xiIds = new Set(xi.map((p) => p.id));
  const bench = byRating.filter((p) => !xiIds.has(p.id));
  return [...xi, ...bench];
}

/**
 * EUR → BRL conversion applied to Transfermarkt values so the emitted dataset
 * is denominated in the league's own currency (a €8M player is worth ~R$50M,
 * which is what the wage/fee scales are calibrated against). Recorded in the
 * manifest so a rebuild is traceable.
 */
export const VALUE_RATE_EUR_TO_BRL = 6.2;

/**
 * The full set of positions a player is natural in — their own first, then any
 * distinct secondary. Undefined when there is nothing to add, so the loader's
 * `[position]` default keeps applying and the emitted file stays small.
 */
function naturalPositionsOf(inf: InferredPlayer): string[] | undefined {
  const extra = inf.secondaryPositions.filter((p) => p !== inf.position);
  return extra.length ? [inf.position as string, ...(extra as string[])] : undefined;
}

function toPlayerData(inf: InferredPlayer, raw?: { marketValueEur?: number; photo?: string; shirtNumber?: number }): PlayerData {
  const marketValueEur = raw?.marketValueEur;
  const base = {
    id: inf.id,
    name: inf.name,
    age: inf.ageYears,
    nationality: inf.nationality[0] ?? "Brazil",
    position: inf.position as string,
    // `naturalPositions` REPLACES the default `[position]` in the loader, so the
    // player's own position has to lead the list — emitting only the secondary
    // makes a winger out of position at winger.
    naturalPositions: naturalPositionsOf(inf),
    physical: val(inf.physical),
    mental: val(inf.mental),
    technical: val(inf.technical),
    ...(marketValueEur ? { marketValue: Math.round(marketValueEur * VALUE_RATE_EUR_TO_BRL) } : {}),
    ...(raw?.photo ? { photo: raw.photo } : {}),
    // The number the club actually registered him with. A career may later
    // override it, but this is the real one to start from.
    ...(raw?.shirtNumber ? { shirtNumber: raw.shirtNumber } : {}),
  };
  return inf.position === Position.Goalkeeper ? { ...base, goalkeeping: val(inf.goalkeeping) } : base;
}

/** Percentile of each club by total squad market value (0..1), stable id tiebreak. */
function clubValuePct(snapshot: RawSnapshot): Map<string, number> {
  const totals = new Map<string, number>();
  for (const c of snapshot.clubs) totals.set(c.id, 0);
  for (const p of snapshot.players) totals.set(p.clubId, (totals.get(p.clubId) ?? 0) + (p.marketValueEur ?? 0));
  const sorted = [...totals.entries()].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1));
  const n = sorted.length;
  const out = new Map<string, number>();
  sorted.forEach(([id], i) => out.set(id, n <= 1 ? 1 : i / (n - 1)));
  return out;
}

/**
 * Deterministic map from inferred players + the RAW snapshot to the three
 * outputs a career consumes: `league` (squads/attributes), `world`
 * (competitions + club metadata) and `evidence` (provenance sidecar).
 */
export function emit(snapshot: RawSnapshot, inferred: readonly InferredPlayer[]): EmitResult {
  const valuePct = clubValuePct(snapshot);
  const coachBio = new Map((snapshot.coaches ?? []).map((c) => [c.clubId, c]));
  const league = snapshot.competitions.find((c) => c.id === snapshot.primaryCompetitionId);
  /*
   * Every club in ANY league of the snapshot, not just the primary one.
   *
   * `LeagueData` is the container of SQUADS; the world is what says which club plays in which
   * division. Filtering to the primary competition was right while a snapshot only ever described one
   * league, and became the thing standing between a merged Série A + Série B snapshot and a working
   * pyramid: the world would name two divisions while the squads only existed for the top one, and a
   * career restricts a division to the clubs it actually has players for — so the second division
   * would have come out empty.
   *
   * Cup entrants deliberately do NOT count: a cup can invite clubs from outside the leagues we
   * assembled, and inventing squads for them is not something this pipeline can do honestly.
   */
  const leagueClubIds = new Set(
    snapshot.competitions.filter((c) => c.type === "league").flatMap((c) => c.entrantClubIds),
  );
  if (leagueClubIds.size === 0) for (const c of snapshot.clubs) leagueClubIds.add(c.id);

  const byClub = new Map<string, InferredPlayer[]>();
  for (const p of inferred) (byClub.get(p.clubId) ?? byClub.set(p.clubId, []).get(p.clubId)!).push(p);
  // Facts that pass through UNINFERRED, straight from the RAW snapshot: the
  // market value in its source currency, and the portrait URL.
  const rawById = new Map(snapshot.players.map((p) => [p.id, p]));

  const teams: TeamData[] = [...snapshot.clubs]
    .filter((c) => leagueClubIds.has(c.id))
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((club) => {
      const squad = orderSquad(byClub.get(club.id) ?? []);
      const coach = inferCoach(valuePct.get(club.id) ?? 0.5);
      const bio = coachBio.get(club.id);
      return {
        id: club.id,
        name: club.name,
        shortName: club.shortName ?? club.name.slice(0, 3).toUpperCase(),
        coach: {
          id: bio?.id ?? `${club.id}-coach`,
          // Spread, not defaulted: no source we hold publishes a head coach, and inventing one is how
          // every club came to be managed by a person named after the club. See `CoachData`.
          ...(bio?.name ? { name: bio.name } : {}),
          ...(bio?.age !== undefined ? { age: bio.age } : {}),
          ...(bio?.nationality ? { nationality: bio.nationality } : {}),
          attributes: {
            adaptability: coach.adaptability.value,
            tacticalKnowledge: coach.tacticalKnowledge.value,
            reactiveness: coach.reactiveness.value,
            composure: coach.composure.value,
          },
        },
        players: squad.map((p) => toPlayerData(p, rawById.get(p.id))),
      } satisfies TeamData;
    });

  const competitions: CompetitionInfo[] = snapshot.competitions.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    country: c.country,
    tier: c.tier,
    format: c.format,
    logo: c.logo,
    entrantClubIds: [...c.entrantClubIds].sort(),
  }));
  const clubs: ClubMeta[] = [...snapshot.clubs]
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((c) => ({
      id: c.id,
      nickname: clubNickname(c.id, c.name, c.nickname),
      country: c.country,
      city: c.city,
      stadium: c.stadium,
      capacity: c.capacity,
      founded: c.foundedYear,
      colours: c.colours,
      crest: c.crest,
      kits: clubKits(c.id, c.colours),
      reputation: Math.round(40 + (valuePct.get(c.id) ?? 0.5) * 60),
    }));

  const evidence: EvidenceSidecar = {
    players: [...inferred]
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .map((p) => ({
        id: p.id,
        overall: p.overall,
        attributes: { ...p.physical, ...p.mental, ...p.technical, ...(p.position === Position.Goalkeeper ? p.goalkeeping : {}) } as Record<string, Attribute>,
      })),
  };

  return {
    league: { id: snapshot.primaryCompetitionId, name: league?.name ?? snapshot.primaryCompetitionId, teams },
    world: { competitions, clubs },
    evidence,
  };
}
