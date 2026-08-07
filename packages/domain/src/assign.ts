import { type FormationSlot, getFormationTemplate } from "./formations.js";
import type { Formation } from "./Tactics.js";
import { Position, PositionGroup, positionGroup } from "./types.js";

/** The minimum a player must expose to be fitted into a formation. */
export interface AssignablePlayer {
  readonly id: string;
  /** The player's natural position — what "exact fit" is judged against. */
  readonly position: Position;
  readonly isGoalkeeper: boolean;
  /** Quality (any scale, higher is better) — traded off against positional fit. */
  readonly rating: number;
  /**
   * How good the player is AT a given position, on the same scale as `rating` —
   * i.e. `Player.overall(position)`, which already re-weights the attributes for
   * that job and applies the out-of-position debuff. Supply it and the cost of
   * fielding someone out of position is the real, modelled cost rather than a
   * flat estimate.
   */
  readonly ratingAt?: (position: Position) => number;
}

/** Where a player ended up, and how well the slot suits them. */
export interface SlotAssignment {
  readonly slot: number;
  readonly playerId: string;
  /** exact = natural position; group = right area of the pitch; out = neither. */
  readonly fit: "exact" | "group" | "out";
  /** Rating points this fill costs, in the same units as `rating`. */
  readonly penalty: number;
}

export interface FormationAssignment {
  /** Slot index → assignment (sparse only if there were fewer than 11 players). */
  readonly slots: readonly (SlotAssignment | undefined)[];
  /** Players left over, best first. */
  readonly unused: readonly string[];
}

const LINE: Record<PositionGroup, number> = {
  [PositionGroup.Goalkeeper]: 0,
  [PositionGroup.Defence]: 1,
  [PositionGroup.Midfield]: 2,
  [PositionGroup.Attack]: 3,
};

/**
 * What it costs (in rating points) to field a player in a given slot.
 *
 * When the player can say how good they'd be there (`ratingAt`) that IS the
 * cost: the drop from their rating in their own position to their rating in the
 * slot's, which the domain already models via position weights and the
 * out-of-position debuff. Otherwise fall back to an estimate by distance between
 * the two jobs — the same area of the pitch is cheap, each line further away
 * hurts more, so a winger fills in at full-back long before a striker does.
 *
 * Goalkeeping is non-negotiable either way: an outfielder in goal (or a keeper
 * outfield) is only ever a last resort.
 */
export function fitPenalty(player: Pick<AssignablePlayer, "position" | "isGoalkeeper" | "ratingAt">, slot: Position): number {
  const slotIsGk = slot === Position.Goalkeeper;
  if (slotIsGk !== player.isGoalkeeper) return 200;
  if (player.position === slot) return 0;
  if (player.ratingAt) return Math.max(0, player.ratingAt(player.position) - player.ratingAt(slot));
  const distance = Math.abs(LINE[positionGroup(player.position)] - LINE[positionGroup(slot)]);
  return distance === 0 ? 7 : distance === 1 ? 18 : 34;
}

/**
 * Fit players to a formation's slots so the ELEVEN AS A WHOLE make sense —
 * maximising quality on the pitch minus what each out-of-position fill costs
 * (see {@link fitPenalty}). Solved exactly (Hungarian assignment) rather than
 * greedily: filling slots one at a time reads well until the last slot, where a
 * greedy pass will happily put a 89-rated striker at wing-back because he was
 * the best player left. With more players than slots, the best eleven fall out
 * of the same solve.
 *
 * Deterministic: input is ordered by rating desc, id asc before solving.
 *
 * Shared by squad auto-pick and by in-match formation changes, so a shape means
 * the same thing whoever asks for it.
 */
export function assignToFormation(players: readonly AssignablePlayer[], formation: Formation): FormationAssignment {
  return assignToSlots(players, getFormationTemplate(formation));
}

/**
 * The same solve against an EXPLICIT set of slots rather than a formation's own
 * eleven — what a side reduced to ten men needs, since its shape is a trimmed
 * template (see `trimFormation`) and not a formation any more, and what filling
 * the HOLES in a part-picked eleven needs, since the slots still to fill are a
 * scattered subset of one template.
 *
 * Only each slot's position is read, so a caller with nothing but a list of jobs
 * to fill need not invent pitch coordinates for them.
 */
export function assignToSlots(players: readonly AssignablePlayer[], template: readonly Pick<FormationSlot, "position">[]): FormationAssignment {
  const pool = [...players].sort((a, b) => b.rating - a.rating || (a.id < b.id ? -1 : 1));
  const slots: (SlotAssignment | undefined)[] = template.map(() => undefined);
  if (pool.length === 0) return { slots, unused: [] };

  // Rows = slots, columns = players. Cost is "rating points given up": the gap to
  // the best available player plus the positional penalty. Minimising the total
  // therefore maximises Σ(rating − penalty) across the whole shape.
  const best = pool[0]!.rating;
  const cost = template.map((slot) => pool.map((p) => best - p.rating + fitPenalty(p, slot.position)));
  const chosen = solveAssignment(cost);

  const used = new Set<string>();
  for (const [i, col] of chosen.entries()) {
    const player = col >= 0 ? pool[col] : undefined;
    const slot = template[i];
    if (!player || !slot) continue;
    used.add(player.id);
    const penalty = fitPenalty(player, slot.position);
    const fit = player.position === slot.position ? "exact" : positionGroup(player.position) === positionGroup(slot.position) ? "group" : "out";
    slots[i] = { slot: i, playerId: player.id, fit, penalty };
  }
  return { slots, unused: pool.filter((p) => !used.has(p.id)).map((p) => p.id) };
}

/**
 * Hungarian algorithm (O(n²m) shortest-augmenting-path form) for a rectangular
 * cost matrix with rows ≤ columns: returns, for each row, the column assigned to
 * it (−1 if there were fewer columns than rows). Total cost is the minimum
 * possible; ties break toward lower indices, which keeps it deterministic.
 */
function solveAssignment(cost: readonly (readonly number[])[]): number[] {
  const n = cost.length;
  const m = n > 0 ? cost[0]!.length : 0;
  const result = new Array<number>(n).fill(-1);
  if (n === 0 || m === 0) return result;
  if (m < n) {
    // Fewer players than slots: solve the transpose (slots become columns) so
    // every player is placed and the surplus slots stay empty.
    const transposed = Array.from({ length: m }, (_, j) => Array.from({ length: n }, (_, i) => cost[i]![j]!));
    for (const [row, col] of solveAssignment(transposed).entries()) if (col >= 0) result[col] = row;
    return result;
  }

  const INF = Number.POSITIVE_INFINITY;
  const u = new Array<number>(n + 1).fill(0); // row potentials
  const v = new Array<number>(m + 1).fill(0); // column potentials
  const match = new Array<number>(m + 1).fill(0); // column → row (1-based; 0 = free)
  const way = new Array<number>(m + 1).fill(0); // column → previous column on the path

  for (let i = 1; i <= n; i++) {
    match[0] = i;
    let j0 = 0;
    const minv = new Array<number>(m + 1).fill(INF);
    const used = new Array<boolean>(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = match[j0]!;
      let delta = INF;
      let j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1]![j - 1]! - u[i0]! - v[j]!;
        if (cur < minv[j]!) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j]! < delta) {
          delta = minv[j]!;
          j1 = j;
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[match[j]!] = u[match[j]!]! + delta;
          v[j] = v[j]! - delta;
        } else {
          minv[j] = minv[j]! - delta;
        }
      }
      j0 = j1;
    } while (match[j0] !== 0);
    // Walk the augmenting path back, flipping the matching along it.
    do {
      const j1 = way[j0]!;
      match[j0] = match[j1]!;
      j0 = j1;
    } while (j0);
  }

  for (let j = 1; j <= m; j++) if (match[j]! > 0) result[match[j]! - 1] = j - 1;
  return result;
}
