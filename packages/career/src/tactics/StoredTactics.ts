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
 * Formation + mentality stay on the Club and compose the full engine
 * `TeamInstructions` at match time.
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

/**
 * Return the club's stored tactics, auto-picking a default if it has none.
 * Also CHOOSES the formation that best suits the squad's real positions (and
 * writes it onto the club), so each side lines up sensibly out of the box.
 */
export function ensureTactics(
  club: { formation: Formation; mentality: Mentality; squad: { playerIds: string[] }; tactics?: StoredTactics },
  dataById: ReadonlyMap<string, PlayerData>,
  devById: ReadonlyMap<string, PlayerDev>,
): StoredTactics {
  if (club.tactics) return club.tactics;
  club.formation = chooseFormation(club.squad.playerIds, dataById, devById);
  return autoTactics(club.squad.playerIds, club.formation, club.mentality, dataById, devById);
}

/** Build a complete StoredTactics for a club by auto-picking its XI. */
export function autoTactics(
  playerIds: readonly string[],
  formation: Formation,
  mentality: Mentality,
  dataById: ReadonlyMap<string, PlayerData>,
  devById: ReadonlyMap<string, PlayerDev>,
): StoredTactics {
  return { ...autoPickXI(playerIds, formation, dataById, devById), instructions: defaultInstructions(mentality) };
}
