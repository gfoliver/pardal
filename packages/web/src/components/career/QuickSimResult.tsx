import { Star } from "lucide-react";
import { useApp } from "../../app/AppProviders";
import { useCareer } from "../../app/CareerProvider";
import type { QuickSimResult } from "../../app/CareerProvider";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Crest } from "../ui/crest";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { shortPlayerName } from "../../lib/names";
import { cn } from "../../lib/utils";

/**
 * The result of a match the manager chose not to watch.
 *
 * Quick-simming used to resolve the fixture in complete silence — the score
 * only turned up later in the table. This is the full-time whistle for that
 * path: the scoreline, who scored, the best player and how the rest of the
 * round went, in one modal you dismiss and move on from.
 */
export function QuickSimResultDialog({ result, onClose }: { result: QuickSimResult | null; onClose: () => void }) {
  const { t } = useApp();
  const { career } = useCareer();
  const summary = result && career ? career.matchSummary(result.round, result.homeId, result.awayId) : null;
  if (!career || !summary) return null;

  const managed = career.managedClubId;
  const nick = (id: string) => career.clubNickname(id);
  const mine = summary.homeId === managed;
  const my = mine ? summary.homeScore : summary.awayScore;
  const theirs = mine ? summary.awayScore : summary.homeScore;
  const drew = my === theirs;
  const won = my > theirs;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t.fullTime}</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          {/* Scoreline. The badge names the outcome so the number doesn't have
              to be read twice to know which way it went. */}
          <div className="flex flex-col items-center gap-2">
            <Badge variant={drew ? "muted" : won ? "primary" : "danger"}>
              {drew ? t.resultDraw : won ? t.resultWin : t.resultLoss}
            </Badge>
            <div className="flex w-full items-center justify-center gap-3">
              <span className="flex flex-1 items-center justify-end gap-2 text-right">
                <span className={cn("truncate text-sm", mine && "font-semibold")}>{nick(summary.homeId)}</span>
                <Crest src={career.clubCrest(summary.homeId)} code={career.clubShort(summary.homeId)} size={26} />
              </span>
              <span className="serif shrink-0 text-3xl font-bold tabular-nums">
                {summary.homeScore} : {summary.awayScore}
              </span>
              <span className="flex flex-1 items-center gap-2">
                <Crest src={career.clubCrest(summary.awayId)} code={career.clubShort(summary.awayId)} size={26} />
                <span className={cn("truncate text-sm", !mine && "font-semibold")}>{nick(summary.awayId)}</span>
              </span>
            </div>
            {summary.scorers.length > 0 && (
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-0.5 text-xs text-fg-muted">
                {summary.scorers.map((g, i) => (
                  <span key={i}>
                    <span className="font-medium text-fg">{shortPlayerName(g.name)}</span>
                    <span className="text-fg-faint"> · {career.clubShort(g.teamId)}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {summary.motm && (
            <div className="flex items-center gap-2 rounded-md border border-hairline bg-surface-2 px-3 py-2">
              <Star className="size-4 shrink-0 fill-gold text-gold" />
              <span className="text-2xs uppercase tracking-caps text-fg-faint">{t.manOfTheMatch}</span>
              <span className="ml-auto truncate text-sm font-medium">{shortPlayerName(summary.motm.name)}</span>
              <span className="text-2xs text-fg-faint">{career.clubShort(summary.motm.teamId)}</span>
              <span className="text-sm font-bold tabular-nums text-gold">{summary.motm.rating.toFixed(1)}</span>
            </div>
          )}

          {summary.otherResults.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-2xs uppercase tracking-caps text-fg-faint">{t.otherResults}</span>
              <div className="flex max-h-48 flex-col overflow-y-auto text-xs">
                {summary.otherResults.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 border-b border-hairline py-1 last:border-0">
                    <Crest src={career.clubCrest(r.homeId)} code={career.clubShort(r.homeId)} size={14} />
                    <span className="flex-1 truncate">{nick(r.homeId)}</span>
                    <span className="font-semibold tabular-nums">{r.homeScore}–{r.awayScore}</span>
                    <span className="flex-1 truncate text-right">{nick(r.awayId)}</span>
                    <Crest src={career.clubCrest(r.awayId)} code={career.clubShort(r.awayId)} size={14} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="primary" onClick={onClose}>{t.continue}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
