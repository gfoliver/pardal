import {
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
import { effectiveOverall, isGkData } from "../build/PlayerFactory.js";

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

/**
 * Fit the best available players to a formation, preferring each player's EXACT
 * position (a left-back to a full-back slot, a defensive mid to the DM slot,
 * a winger to a wide slot — never just "any defender anywhere"), then same
 * group, then anyone. Deterministic (overall desc, id tiebreak).
 */
interface PoolEntry {
  readonly id: string;
  readonly ovr: number;
  readonly gk: boolean;
  readonly group: PositionGroup;
  readonly pos: Position;
}

function buildPool(playerIds: readonly string[], dataById: ReadonlyMap<string, PlayerData>, devById: ReadonlyMap<string, PlayerDev>): PoolEntry[] {
  return playerIds
    .map((id) => ({ id, data: dataById.get(id), dev: devById.get(id) }))
    .filter((e) => e.data !== undefined)
    .map((e) => {
      const data = e.data as PlayerData;
      const pos = data.position as Position;
      return { id: e.id, ovr: effectiveOverall(data, e.dev), gk: isGkData(data), group: positionGroup(pos), pos };
    })
    .sort((a, b) => b.ovr - a.ovr || (a.id < b.id ? -1 : 1));
}

/** Greedy slot fill (exact → same-group → any) + a fit score for that formation. */
function fitFormation(pool: PoolEntry[], formation: Formation): { lineup: string[]; roles: Record<string, RoleKey>; used: Set<string>; score: number } {
  const used = new Set<string>();
  const lineup: string[] = [];
  const roles: Record<string, RoleKey> = {};
  let score = 0;
  for (const slot of getFormationTemplate(formation)) {
    const wantGk = slot.position === Position.Goalkeeper;
    const grp = positionGroup(slot.position);
    const pick =
      pool.find((p) => !used.has(p.id) && p.pos === slot.position) ??
      pool.find((p) => !used.has(p.id) && (wantGk ? p.gk : !p.gk && p.group === grp)) ??
      pool.find((p) => !used.has(p.id) && (wantGk ? p.gk : !p.gk)) ??
      pool.find((p) => !used.has(p.id));
    if (pick) {
      used.add(pick.id);
      lineup.push(pick.id);
      roles[pick.id] = defaultRoleKey(slot.position);
      // Reward quality; penalise out-of-position fills so the best formation wins.
      const penalty = pick.pos === slot.position ? 0 : positionGroup(pick.pos) === grp ? 7 : 22;
      score += pick.ovr - penalty;
    } else {
      score -= 40; // an unfilled slot is very bad
    }
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
