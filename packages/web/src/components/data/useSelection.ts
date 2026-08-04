import { useCallback, useMemo, useState } from "react";

/**
 * A handful of rows, held to be looked at together.
 *
 * Deliberately NOT part of `useGridState`, and not persisted. A layout is a standing decision — these
 * columns, this order — and it should still be true tomorrow. A selection is a sentence in the middle
 * of a thought: "these two centre-backs, which one". Restoring it on a reload would leave the manager
 * with three players ticked and no memory of why.
 *
 * Capped, and the cap is a real design constraint rather than a safety valve: the point of a selection
 * is a side-by-side comparison, and four columns is about what a phone can show before the numbers
 * stop being comparable at a glance. At the cap the remaining checkboxes go disabled, which says so
 * without a message.
 */
export interface Selection {
  /** In the order they were picked, so the comparison columns do not rearrange as he adds one. */
  readonly ids: readonly string[];
  readonly max: number;
  readonly full: boolean;
  has: (id: string) => boolean;
  toggle: (id: string) => void;
  clear: () => void;
}

const MAX = 4;

export function useSelection(max: number = MAX): Selection {
  const [ids, setIds] = useState<readonly string[]>([]);

  const toggle = useCallback(
    (id: string) =>
      setIds((cur) => {
        if (cur.includes(id)) return cur.filter((x) => x !== id);
        // Silently ignored at the cap rather than dropping the oldest: he ticked those on purpose, and
        // a pick that quietly evicts an earlier one is a pick he has to audit. The UI disables instead.
        return cur.length >= max ? cur : [...cur, id];
      }),
    [max],
  );

  const clear = useCallback(() => setIds([]), []);
  const set = useMemo(() => new Set(ids), [ids]);

  return useMemo(
    () => ({ ids, max, full: ids.length >= max, has: (id: string) => set.has(id), toggle, clear }),
    [ids, max, set, toggle, clear],
  );
}
