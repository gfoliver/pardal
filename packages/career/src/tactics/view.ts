import { getFormationTemplate, type Position, type RoleKey } from "@fut/domain";
import { defaultRoleKey, MATCHDAY_BENCH_SIZE, type SavedTactic } from "./StoredTactics.js";

/**
 * The tactics board's view model, built from a tactic and a squad — and from nothing else.
 *
 * This was a `Career` method reading four other `Career` methods, which made the board a career-only
 * screen. What it actually needs is a tactic, the squad's ids, a way to describe one player and a way to
 * score a fit; a career supplies those from its own state and a multiplayer friendly from the dataset it
 * already ships. Injected rather than imported, because "who is this player" genuinely differs: a career
 * knows his fitness, his injury and the number the manager gave him, and a one-off friendly knows none of
 * that and must not invent it.
 */

/** What the board shows for one player. The caller decides how to answer. */
export interface TacticsPlayerLike {
  readonly playerId: string;
  readonly name: string;
  readonly position: string;
  readonly overall: number;
}

export interface TacticsSlotLike<P> {
  readonly slot: number;
  readonly position: Position;
  readonly depth: number;
  readonly width: number;
  readonly role: RoleKey;
  readonly player?: P;
  readonly fit?: number;
}

export interface TacticsViewLike<P> {
  readonly clubId: string;
  readonly formation: SavedTactic["formation"];
  readonly mentality: SavedTactic["mentality"];
  readonly instructions: SavedTactic["instructions"];
  readonly slots: readonly TacticsSlotLike<P>[];
  readonly bench: readonly P[];
  readonly reserves: readonly P[];
  readonly tactics: readonly { id: string; name: string; formation: SavedTactic["formation"]; familiarity: number }[];
  readonly activeTacticId: string;
}

export interface TacticsViewSource<P extends TacticsPlayerLike> {
  readonly clubId: string;
  readonly tactic: SavedTactic;
  /** Every player the club has, which is what tops the reserve list up after a signing. */
  readonly squadIds: readonly string[];
  /** All saved tactics, for the drawer. A mode with only one passes just that one. */
  readonly saved: readonly SavedTactic[];
  readonly activeTacticId: string;
  /** Undefined for an id the caller cannot describe — he is then simply not shown. */
  player(id: string, role: RoleKey | undefined): P | undefined;
  fitAt(id: string, position: Position): number | undefined;
}

export function tacticsViewOf<P extends TacticsPlayerLike>(source: TacticsViewSource<P>): TacticsViewLike<P> {
  const t = source.tactic;
  const template = getFormationTemplate(t.formation);
  const slots = template.map((s, i) => {
    const id = t.lineup[i];
    // A dragged position overrides the template, and a chosen position overrides both.
    const custom = t.slotPositions?.[i];
    const fielded = t.slotFielded?.[i] ?? s.position;
    return {
      slot: i,
      position: fielded,
      depth: custom?.depth ?? s.depth,
      width: custom?.width ?? s.width,
      role: (id && t.roles[id]) || defaultRoleKey(fielded),
      player: id ? source.player(id, t.roles[id]) : undefined,
      fit: id ? source.fitAt(id, fielded) : undefined,
    };
  });

  /*
   * `t.bench` lists the WHOLE rest of the squad in preference order; only its first `MATCHDAY_BENCH_SIZE`
   * actually dress, and the rest are reserves. Squad members in neither list — a fresh signing — are
   * topped up at the back rather than dropped, because a player who exists and appears nowhere is a
   * player the manager cannot select.
   */
  const restIds = [...t.bench, ...source.squadIds.filter((id) => !t.lineup.includes(id) && !t.bench.includes(id))];
  const rest = restIds.map((id) => source.player(id, t.roles[id])).filter((p): p is P => p !== undefined);

  return {
    clubId: source.clubId,
    formation: t.formation,
    mentality: t.mentality,
    instructions: t.instructions,
    slots,
    bench: rest.slice(0, MATCHDAY_BENCH_SIZE),
    reserves: rest.slice(MATCHDAY_BENCH_SIZE),
    tactics: source.saved.map((s) => ({ id: s.id, name: s.name, formation: s.formation, familiarity: s.familiarity })),
    activeTacticId: source.activeTacticId,
  };
}
