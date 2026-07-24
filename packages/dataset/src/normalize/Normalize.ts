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
  readonly per90: { readonly goals: number; readonly assists: number; readonly cards: number };
  /** Minutes played relative to the league's busiest player, 0..1. */
  readonly minutesShare: number;
  readonly minutes: number;
  readonly ageYears: number;
  readonly heightCm?: number;
  /** Advanced per-90 metrics, present only if an advanced source supplied them. */
  readonly advanced?: Readonly<Partial<Record<AdvancedMetric, number>>>;
}

const MATCH_MINUTES = 90;

/** Pick the stat line for the primary (league) competition, else the first. */
function primaryStats(p: RawPlayer, competitionId: string): RawStatLine | undefined {
  return p.stats?.find((s) => s.competitionId === competitionId) ?? p.stats?.[0];
}

function ageOf(p: RawPlayer): number {
  if (typeof p.age === "number") return p.age;
  if (p.dob) {
    const y = Number(p.dob.slice(0, 4));
    if (Number.isFinite(y)) return Math.max(15, 2025 - y);
  }
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
    per90: {
      goals: per90(stats?.goals, minutes),
      assists: per90(stats?.assists, minutes),
      cards: per90((stats?.yellow ?? 0) + (stats?.red ?? 0), minutes),
    },
    minutesShare: minutes / maxMinutes,
    minutes,
    ageYears: ageOf(p),
    heightCm: p.heightCm,
    advanced: p.advanced?.per90,
  }));
}
