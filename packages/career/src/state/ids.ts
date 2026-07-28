import type { CareerState } from "./CareerState.js";

/**
 * Entity ids that come from the STATE, not from the module.
 *
 * These used to be module-level counters (`let offerSeq = 0`), which made an id
 * depend on how many offers had been created since the process started rather
 * than on the save. Two replays of the same command log produced different ids,
 * breaking the project's core promise that a save is its seed plus its log.
 *
 * The counter lives in the state and is serialized with it, so a replay — or a
 * server re-applying the log — mints exactly the same ids in the same order.
 */
export function nextId(state: CareerState, prefix: string): string {
  const n = state.nextEntityId ?? 1;
  state.nextEntityId = n + 1;
  return `${prefix}-${n}`;
}

/**
 * Where the counter must resume for a save written before it existed.
 *
 * Restarting at 1 would mint an id an old entity already holds, so this reads
 * the high-water mark off the ids actually present.
 */
export function highestExistingId(state: CareerState): number {
  let max = 0;
  const consider = (id: string | undefined) => {
    const m = id?.match(/-(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  };
  for (const m of state.inbox) consider(m.id);
  for (const o of state.transfers.offers) consider(o.id);
  return max;
}
