import { useState } from "react";
import { Play, Trash2 } from "lucide-react";
import { useApp } from "../../app/AppProviders";
import { Confirm } from "../../components/ui/alert-dialog";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { Crest } from "../../components/ui/crest";
import { isShipped } from "../../lib/career/dataset";
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
export function SaveList({ slots, opening, onLoad, onDelete }: {
  slots: readonly SaveSlot[];
  /**
   * The save currently being opened, if any.
   *
   * Every row goes inert while one is loading — not just the one pressed. Opening a career fetches the
   * squad data and rehydrates a season; a second click on a second save while the first is in flight is
   * two careers racing to be the one that mounts.
   */
  opening?: string | null;
  onLoad: (slotId: string) => void;
  onDelete: (slotId: string) => void;
}) {
  const { t } = useApp();
  const fmt = useFormat();
  /**
   * Which save the bin was pressed on, if any.
   *
   * This is the most destructive thing in the app and it used to happen on ONE click of an icon
   * button, sitting next to the button that continues the career, on a row a thumb has to hit
   * precisely. Seasons of play, gone, with nothing to undo it and no backup anywhere.
   */
  const [pending, setPending] = useState<SaveSlot | null>(null);

  return (
    <ul className="flex flex-col gap-2">
      {slots.map((s) => {
        /*
         * A save whose dataset we no longer ship cannot be opened. Saying so — and leaving the
         * delete button working — beats a row that silently does nothing when clicked.
         *
         * Answered from the manifest, so drawing this list does not fetch a single dataset.
         */
        const playable = isShipped(s.snapshot.datasetId);
        /** This row is the one loading; `busy` is "any row is". */
        const mine = opening === s.slotId;
        const busy = opening != null;
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
              disabled={!playable || busy}
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
              {/* The spinner REPLACES the hover affordance rather than sitting beside it: "continue"
                  and "continuing" are not two things to read at once. */}
              {mine ? (
                <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-primary">
                  <Spinner className="text-primary" />
                  {t.loadingCareer}
                </span>
              ) : (
                playable && (
                  <span className="hidden shrink-0 items-center gap-1 text-xs font-medium text-primary group-hover:inline-flex">
                    <Play className="size-3.5" />
                    {t.continueCareer}
                  </span>
                )
              )}
            </button>
            <Button variant="ghost" size="icon-sm" aria-label={t.deleteSave} disabled={busy} onClick={() => setPending(s)}>
              <Trash2 />
            </Button>
          </li>
        );
      })}

      {/* The club and the in-game date, so he can see WHICH career he is about to lose — with several
          saves running, "delete this career?" alone does not identify one. */}
      <Confirm
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title={t.confirmDeleteSaveTitle}
        body={fmt.t(t.confirmDeleteSaveBody, {
          name: pending ? (pending.snapshot.clubs[pending.snapshot.managedClubId]?.nickname ?? pending.name) : "",
          date: pending ? fmt.seasonDate(pending.snapshot.currentDate) : "",
        })}
        confirmLabel={t.deleteAction}
        cancelLabel={t.cancel}
        danger
        onConfirm={() => {
          if (pending) onDelete(pending.slotId);
          setPending(null);
        }}
      />
    </ul>
  );
}
