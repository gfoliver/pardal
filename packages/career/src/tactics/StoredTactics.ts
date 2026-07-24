import {
  DefaultRoleProvider,
  type Formation,
  getFormationTemplate,
  MarkingScheme,
  type Mentality,
  mentalityToAttackBias,
  Position,
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
 * Greedily fit the best available players to a formation's slots (own group
 * first, keeper to the keeper slot), returning lineup (slot order) + bench +
 * default roles. Deterministic (overall desc, id tiebreak).
 */
export function autoPickXI(
  playerIds: readonly string[],
  formation: Formation,
  dataById: ReadonlyMap<string, PlayerData>,
  devById: ReadonlyMap<string, PlayerDev>,
): { lineup: string[]; bench: string[]; roles: Record<string, RoleKey> } {
  const pool = playerIds
    .map((id) => ({ id, data: dataById.get(id), dev: devById.get(id) }))
    .filter((e) => e.data !== undefined)
    .map((e) => {
      const data = e.data as PlayerData;
      return { id: e.id, ovr: effectiveOverall(data, e.dev), gk: isGkData(data), group: positionGroup(data.position as Position) };
    })
    .sort((a, b) => b.ovr - a.ovr || (a.id < b.id ? -1 : 1));

  const used = new Set<string>();
  const lineup: string[] = [];
  const roles: Record<string, RoleKey> = {};
  for (const slot of getFormationTemplate(formation)) {
    const wantGk = slot.position === Position.Goalkeeper;
    const group = positionGroup(slot.position);
    const pick =
      pool.find((p) => !used.has(p.id) && (wantGk ? p.gk : !p.gk && p.group === group)) ??
      pool.find((p) => !used.has(p.id) && (wantGk ? p.gk : !p.gk)) ??
      pool.find((p) => !used.has(p.id));
    if (pick) {
      used.add(pick.id);
      lineup.push(pick.id);
      roles[pick.id] = defaultRoleKey(slot.position);
    }
  }
  const bench = pool.filter((p) => !used.has(p.id)).map((p) => p.id);
  return { lineup, bench, roles };
}

/** Return the club's stored tactics, auto-picking a default if it has none. */
export function ensureTactics(
  club: { formation: Formation; mentality: Mentality; squad: { playerIds: string[] }; tactics?: StoredTactics },
  dataById: ReadonlyMap<string, PlayerData>,
  devById: ReadonlyMap<string, PlayerDev>,
): StoredTactics {
  return club.tactics ?? autoTactics(club.squad.playerIds, club.formation, club.mentality, dataById, devById);
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
