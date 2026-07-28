import { Position, PositionGroup, positionGroup } from "@fut/domain";
import type { RawPlayer, RawSnapshot, RawStatLine } from "../raw/RawSnapshot.js";
import { toDomainPosition } from "../mapping/position.js";
import type { AdvancedMetric } from "./metrics.js";

/**
 * A player made COMPARABLE across the league: raw counting stats become per-90
 * rates, market value becomes a within-position percentile, and bio is
 * canonicalised. This is the source-agnostic layer every inference formula
 * reads — it never sees a Transfermarkt field directly.
 */
export interface NormalizedPlayer {
  readonly id: string;
  readonly name: string;
  readonly clubId: string;
  readonly position: Position;
  readonly positionGroup: PositionGroup;
  readonly nationality: readonly string[];
  readonly foot?: string;
  readonly secondaryPositions: readonly Position[];
  readonly marketValueEur: number;
  /** Market-value percentile within the player's position group, 0..1. */
  readonly valuePct: number;
  /** Appearances percentile within the position group, 0..1 (how established). */
  readonly appearancePct: number;
  readonly appearances: number;
  readonly per90: { readonly goals: number; readonly assists: number; readonly cards: number };
  /** Minutes played relative to the league's busiest player, 0..1. */
  readonly minutesShare: number;
  readonly minutes: number;
  readonly ageYears: number;
  readonly heightCm?: number;
  readonly weightKg?: number;
  /** Advanced per-90 metrics, present only if an advanced source supplied them. */
  readonly advanced?: Readonly<Partial<Record<AdvancedMetric, number>>>;
}

const MATCH_MINUTES = 90;

/** Pick the stat line for the primary (league) competition, else the first. */
function primaryStats(p: RawPlayer, competitionId: string): RawStatLine | undefined {
  return p.stats?.find((s) => s.competitionId === competitionId) ?? p.stats?.[0];
}

const MONTHS: Readonly<Record<string, number>> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * A birth date as ISO `yyyy-mm-dd`, from either form a source hands us: ISO
 * already, or the `"Oct 9, 1998"` string Transfermarkt's scraper produces.
 *
 * This is the strongest identifier we have for cross-source matching — day-exact
 * agreement outweighs a club that may simply be a transfer out of date — so it
 * is worth normalising properly rather than comparing free text.
 */
export function isoBirthDate(dob?: string): string | undefined {
  if (!dob) return undefined;
  const iso = dob.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return Number(iso[1]) > 1900 ? dob : undefined; // "0000-00-00" is "unknown"

  const named = dob.match(/^([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/i);
  const month = named && MONTHS[named[1]!.toLowerCase()];
  if (!named || !month) return undefined;
  const day = Number(named[2]);
  if (day < 1 || day > 31) return undefined;
  return `${named[3]}-${pad(month)}-${pad(day)}`;
}

/**
 * Birth year alone — tolerant of forms `isoBirthDate` can't fully parse, since a
 * year is enough to veto a mismatch and to compute an age.
 */
export function birthYearOf(dob?: string): number | undefined {
  const iso = isoBirthDate(dob);
  if (iso) return Number(iso.slice(0, 4));
  if (!dob) return undefined;
  const trailing = dob.match(/(?:^|\s)(\d{4})\s*$/);
  const year = trailing ? Number(trailing[1]) : undefined;
  return year && year > 1900 ? year : undefined;
}

/**
 * The year the snapshot describes, taken from the data rather than a literal —
 * a hardcoded year quietly ages every player by one each January.
 *
 * `seasonId` is authoritative; failing that, the most recent market-value
 * observation dates the snapshot. When neither exists we have no reference and
 * `ageOf` keeps whatever the source stated.
 */
export function seasonYearOf(snapshot: RawSnapshot): number | undefined {
  const season = snapshot.competitions.find((c) => c.id === snapshot.primaryCompetitionId)?.seasonId;
  const fromSeason = season?.match(/(\d{4})/);
  if (fromSeason) return Number(fromSeason[1]);

  let latest = 0;
  for (const p of snapshot.players) {
    for (const point of p.marketValueHistory ?? []) {
      const y = Number(point.date?.slice(0, 4));
      if (Number.isFinite(y) && y > latest) latest = y;
    }
  }
  return latest > 1900 ? latest : undefined;
}

/**
 * Age in whole years at the season's reference year. Without a birth month this
 * is accurate to ±1 — which is why a source-stated age still wins.
 */
function ageOf(p: RawPlayer, seasonYear?: number): number {
  if (typeof p.age === "number") return p.age;
  const born = birthYearOf(p.dob);
  if (born !== undefined && seasonYear !== undefined) return Math.max(15, seasonYear - born);
  return 25;
}

/** Percentile of each id's value within its group (rank/(n-1)), stable id tiebreak. */
function percentileByGroup(rows: { id: string; group: PositionGroup; value: number }[]): Map<string, number> {
  const out = new Map<string, number>();
  const groups = new Map<PositionGroup, { id: string; value: number }[]>();
  for (const r of rows) (groups.get(r.group) ?? groups.set(r.group, []).get(r.group)!).push({ id: r.id, value: r.value });
  for (const [, list] of groups) {
    const sorted = [...list].sort((a, b) => a.value - b.value || (a.id < b.id ? -1 : 1));
    const n = sorted.length;
    sorted.forEach((row, i) => out.set(row.id, n <= 1 ? 1 : i / (n - 1)));
  }
  return out;
}

/**
 * Normalize a whole snapshot's players against the primary competition. Pure and
 * deterministic (no Date/random; ties broken by id).
 */
export function normalizeSnapshot(snapshot: RawSnapshot): NormalizedPlayer[] {
  const competitionId = snapshot.primaryCompetitionId;
  const seasonYear = seasonYearOf(snapshot);
  const enriched = snapshot.players.map((p) => {
    const position = toDomainPosition(p.position);
    const stats = primaryStats(p, competitionId);
    const minutes = stats?.minutes ?? 0;
    return { p, position, group: positionGroup(position), minutes, stats };
  });

  const maxMinutes = Math.max(1, ...enriched.map((e) => e.minutes));
  const valuePct = percentileByGroup(
    enriched.map((e) => ({ id: e.p.id, group: e.group, value: e.p.marketValueEur ?? 0 })),
  );
  const appearancePct = percentileByGroup(
    enriched.map((e) => ({ id: e.p.id, group: e.group, value: e.stats?.appearances ?? 0 })),
  );
  const per90 = (v: number | undefined, minutes: number) => (minutes > 0 ? ((v ?? 0) * MATCH_MINUTES) / minutes : 0);

  return enriched.map(({ p, position, group, minutes, stats }) => ({
    id: p.id,
    name: p.name,
    clubId: p.clubId,
    position,
    positionGroup: group,
    nationality: p.nationality ?? [],
    foot: p.foot,
    secondaryPositions: (p.secondaryPositions ?? []).map(toDomainPosition),
    marketValueEur: p.marketValueEur ?? 0,
    valuePct: valuePct.get(p.id) ?? 0,
    appearancePct: appearancePct.get(p.id) ?? 0,
    appearances: stats?.appearances ?? 0,
    per90: {
      goals: per90(stats?.goals, minutes),
      assists: per90(stats?.assists, minutes),
      cards: per90((stats?.yellow ?? 0) + (stats?.red ?? 0), minutes),
    },
    minutesShare: minutes / maxMinutes,
    minutes,
    ageYears: ageOf(p, seasonYear),
    heightCm: p.heightCm,
    weightKg: p.weightKg,
    advanced: p.advanced?.per90,
  }));
}
