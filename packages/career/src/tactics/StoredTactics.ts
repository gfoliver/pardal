import {
  type AssignablePlayer,
  assignToFormation,
  type BaseSlot,
  DefaultRoleProvider,
  Formation,
  getFormationTemplate,
  MarkingScheme,
  type Mentality,
  mentalityToAttackBias,
  Position,
  PositionGroup,
  positionGroup,
  RoleKey,
} from "@fut/domain";
import type { PlayerData } from "@fut/competition";
import type { PlayerDev } from "../development/PlayerDev.js";
import { buildPlayer, effectiveOverall, isGkData } from "../build/PlayerFactory.js";

/** The five numeric sliders + marking scheme; formation & mentality live on the Club. */
export interface StoredInstructions {
  tempo: number;
  pressing: number;
  lineHeight: number;
  width: number;
  directness: number;
  markingScheme: MarkingScheme;
}

/**
 * A club's persisted tactical setup. `lineup` is the 11 starters in
 * formation-slot order (index → `getFormationTemplate(formation)[index]`);
 * `bench` is the ordered rest; `roles` maps each selected player to a RoleKey.
 */
export interface StoredTactics {
  lineup: string[];
  bench: string[];
  roles: Record<string, RoleKey>;
  instructions: StoredInstructions;
  /**
   * Per-slot pitch coordinates that OVERRIDE the formation template (set by
   * dragging a player on the tactics pitch). Index = slot; sparse entries fall
   * back to the template, so a formation change keeps working.
   */
  slotPositions?: (BaseSlot | undefined)[];
  /**
   * Per-slot FIELDED position that overrides the formation template's (set by
   * picking a position for a player). Index = slot; sparse entries fall back to
   * the template. The engine receives it, so playing someone out of their own
   * position carries the familiarity cost the domain models.
   */
  slotFielded?: (Position | undefined)[];
}

/**
 * One of a club's saved tactical setups. A club keeps several of these
 * (`Club.tacticSlots`) and plays with whichever is `activeTacticId` — swapping
 * shape for an opponent no longer means overwriting the only tactic on file.
 * `formation`/`mentality` live here (not on the Club) precisely so each saved
 * tactic can have its own.
 */
export interface SavedTactic extends StoredTactics {
  /** Facade-generated ("t1", "t2"…), stable across renames. */
  readonly id: string;
  /** User-visible; defaults to a plain number ("1", "2"…). */
  name: string;
  formation: Formation;
  mentality: Mentality;
  /**
   * 0-100: how well the squad has drilled this exact setup. Grows with games
   * played under it, decays on the others, and takes a hit when the shape
   * itself changes — a real trade-off against switching formation every week.
   */
  familiarity: number;
}

const roleProvider = new DefaultRoleProvider();

/** Default RoleKey for a (slot) position. */
export function defaultRoleKey(position: Position): RoleKey {
  return roleProvider.defaultRoleFor(position).key as RoleKey;
}

/** Sensible default sliders derived from a mentality (mirrors TacticsBuilder). */
export function defaultInstructions(mentality: Mentality): StoredInstructions {
  const attack = mentalityToAttackBias(mentality); // [-1, 1]
  const around = (base: number) => Math.min(1, Math.max(0, base + attack * 0.2));
  return { tempo: around(0.5), pressing: around(0.5), lineHeight: around(0.5), width: 0.5, directness: around(0.5), markingScheme: MarkingScheme.Zonal };
}

/** A squad member reduced to what picking a shape needs. */
interface PoolEntry {
  readonly id: string;
  readonly ovr: number;
  readonly gk: boolean;
  readonly group: PositionGroup;
  readonly pos: Position;
  /** Rating in any position, for costing out-of-position fills. */
  readonly ratingAt: (position: Position) => number;
}

function buildPool(playerIds: readonly string[], dataById: ReadonlyMap<string, PlayerData>, devById: ReadonlyMap<string, PlayerDev>): PoolEntry[] {
  return playerIds
    .map((id) => ({ id, data: dataById.get(id), dev: devById.get(id) }))
    .filter((e) => e.data !== undefined)
    .map((e) => {
      const data = e.data as PlayerData;
      const pos = data.position as Position;
      const player = buildPlayer(data, e.dev);
      return {
        id: e.id,
        ovr: effectiveOverall(data, e.dev),
        gk: isGkData(data),
        group: positionGroup(pos),
        pos,
        ratingAt: (position: Position) => player.overall(position),
      };
    })
    .sort((a, b) => b.ovr - a.ovr || (a.id < b.id ? -1 : 1));
}

/**
 * Fill a formation from the pool (shared exact-position-first assignment) and
 * score the result, so `chooseFormation` can compare shapes: quality rewarded,
 * out-of-position fills penalised, an unfilled slot very bad.
 */
function fitFormation(pool: PoolEntry[], formation: Formation): { lineup: string[]; roles: Record<string, RoleKey>; used: Set<string>; score: number } {
  const ovrById = new Map(pool.map((p) => [p.id, p.ovr]));
  const assignable: AssignablePlayer[] = pool.map((p) => ({ id: p.id, position: p.pos, isGoalkeeper: p.gk, rating: p.ovr, ratingAt: p.ratingAt }));
  const { slots } = assignToFormation(assignable, formation);
  const template = getFormationTemplate(formation);
  const used = new Set<string>();
  const lineup: string[] = [];
  const roles: Record<string, RoleKey> = {};
  let score = 0;
  for (const [i, a] of slots.entries()) {
    if (!a) {
      score -= 40;
      continue;
    }
    used.add(a.playerId);
    lineup.push(a.playerId);
    roles[a.playerId] = defaultRoleKey(template[i]!.position);
    score += (ovrById.get(a.playerId) ?? 0) - a.penalty;
  }
  return { lineup, roles, used, score };
}

/** Pick the formation whose best XI fits the squad's real positions best. */
export function chooseFormation(playerIds: readonly string[], dataById: ReadonlyMap<string, PlayerData>, devById: ReadonlyMap<string, PlayerDev>): Formation {
  const pool = buildPool(playerIds, dataById, devById);
  let best: { f: Formation; score: number } | undefined;
  for (const f of Object.values(Formation)) {
    const { score } = fitFormation(pool, f);
    if (!best || score > best.score || (score === best.score && f < best.f)) best = { f, score };
  }
  return best?.f ?? Formation.F442;
}

export function autoPickXI(
  playerIds: readonly string[],
  formation: Formation,
  dataById: ReadonlyMap<string, PlayerData>,
  devById: ReadonlyMap<string, PlayerDev>,
): { lineup: string[]; bench: string[]; roles: Record<string, RoleKey> } {
  const pool = buildPool(playerIds, dataById, devById);
  const { lineup, roles, used } = fitFormation(pool, formation);
  const bench = pool.filter((p) => !used.has(p.id)).map((p) => p.id);
  return { lineup, bench, roles };
}

/** Build a complete StoredTactics for a squad by auto-picking its XI. */
export function autoTactics(
  playerIds: readonly string[],
  formation: Formation,
  mentality: Mentality,
  dataById: ReadonlyMap<string, PlayerData>,
  devById: ReadonlyMap<string, PlayerDev>,
): StoredTactics {
  return { ...autoPickXI(playerIds, formation, dataById, devById), instructions: defaultInstructions(mentality) };
}

/** Starting familiarity for a freshly auto-picked tactic — known, not yet drilled. */
export const DEFAULT_FAMILIARITY = 60;

/**
 * How many substitutes actually dress for a match. `StoredTactics.bench` lists
 * the WHOLE rest of the squad, ordered by preference — only the first
 * `MATCHDAY_BENCH_SIZE` of it are the real substitutes a match is built with;
 * the rest are reserves who don't travel. Reordering that prefix (moving a
 * reserve above the line, pushing someone else below it) IS "picking the bench".
 *
 * Twelve, which is what the Brasileirão actually names, so an XI plus this bench
 * is a squad of 23. Note this is who is AVAILABLE, not how many changes you get
 * — that stays with `SubstitutionRules` (five, in three windows).
 */
export const MATCHDAY_BENCH_SIZE = 12;

/**
 * Build a brand-new saved tactic for a squad: CHOOSES the formation that best
 * suits the squad's real positions, then auto-picks the XI for it — so a new
 * tactic lines up sensibly out of the box. Caller assigns `id`/`name`.
 */
export function buildDefaultTactic(
  playerIds: readonly string[],
  mentality: Mentality,
  dataById: ReadonlyMap<string, PlayerData>,
  devById: ReadonlyMap<string, PlayerDev>,
): Omit<SavedTactic, "id" | "name"> {
  const formation = chooseFormation(playerIds, dataById, devById);
  return { ...autoTactics(playerIds, formation, mentality, dataById, devById), formation, mentality, familiarity: DEFAULT_FAMILIARITY };
}
