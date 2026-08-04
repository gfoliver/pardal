import { Play, Trash2 } from "lucide-react";
import { useApp } from "../../app/AppProviders";
import { Button } from "../../components/ui/button";
import { Crest } from "../../components/ui/crest";
import { getDataset } from "../../lib/career/dataset";
import type { SaveSlot } from "../../lib/career/storage";
import { useFormat } from "../../lib/format";
import { cn } from "../../lib/utils";

/**
 * The saved careers, as the thing you click to keep playing.
 *
 * Each row carries the crest, because a manager recognises his save by the badge long before he
 * reads the club's name — and with several saves running that is the only fast way to tell them
 * apart.
 */
export function SaveList({ slots, onLoad, onDelete }: {
  slots: readonly SaveSlot[];
  onLoad: (slotId: string) => void;
  onDelete: (slotId: string) => void;
}) {
  const { t } = useApp();
  const fmt = useFormat();

  return (
    <ul className="flex flex-col gap-2">
      {slots.map((s) => {
        /*
         * A save whose dataset we no longer ship cannot be opened. Saying so — and leaving the
         * delete button working — beats a row that silently does nothing when clicked.
         */
        const playable = getDataset(s.snapshot.datasetId) !== undefined;
        const clubId = s.snapshot.managedClubId;
        const club = s.snapshot.clubs[clubId];
        const crest = club?.crest;
        const short = club?.shortName ?? s.name;
        /*
         * The common name, not the legal one. `SaveSlot.name` is stamped from `club.name`, so a row
         * read "Fluminense Football Club" while the club picker two clicks earlier said
         * "Fluminense" — the same club under two names on adjacent screens.
         */
        const label = club?.nickname ?? s.name;
        return (
          <li
            key={s.slotId}
            className={cn(
              "group flex items-center gap-3 rounded-lg border border-border bg-surface-1 p-2.5 transition-colors",
              playable ? "hover:border-border-strong hover:bg-surface-2" : "opacity-60",
            )}
          >
            <button
              type="button"
              onClick={() => playable && onLoad(s.slotId)}
              disabled={!playable}
              className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-not-allowed"
            >
              <Crest src={crest} code={short} size={36} />
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-sm font-semibold", playable ? "text-fg" : "text-fg-faint line-through")}>
                  {label}
                </span>
                {/* The IN-GAME date, not the wall clock: "where am I in this save" is the
                    question, and a real-world timestamp answers a different one. */}
                <span className="block truncate text-xs text-fg-faint">
                  {playable ? fmt.seasonDate(s.snapshot.currentDate) : t.datasetGone}
                </span>
              </span>
              {playable && (
                <span className="hidden shrink-0 items-center gap-1 text-xs font-medium text-primary group-hover:inline-flex">
                  <Play className="size-3.5" />
                  {t.continueCareer}
                </span>
              )}
            </button>
            <Button variant="ghost" size="icon-sm" aria-label={t.deleteSave} onClick={() => onDelete(s.slotId)}>
              <Trash2 />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
