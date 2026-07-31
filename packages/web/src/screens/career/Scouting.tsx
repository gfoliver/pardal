import { Search, Plus, Check, Eye, X } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "../../app/AppProviders";
import { useCareer } from "../../app/CareerProvider";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { DataTable, type Column } from "../../components/ui/data-table";
import { Overall } from "../../components/ui/game";
import { PlayerPhoto } from "../../components/ui/player-photo";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";
import { EstimateText, StarBand } from "../../components/career/Estimate";
import { useFormat } from "../../lib/format";
import { groupBadge, useLabels } from "../../lib/labels";
import type { ScreenId } from "../../layout/Shell";
import type { TransferTarget } from "@fut/career";

/** How well we know him, as a bar the eye can scan down a column. */
function Confidence({ value }: { value: number }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex h-1.5 w-12 overflow-hidden rounded-full bg-surface-2 align-middle">
          <span className="block h-full rounded-full bg-primary" style={{ width: `${value}%` }} />
        </span>
      </TooltipTrigger>
      <TooltipContent>{value}%</TooltipContent>
    </Tooltip>
  );
}

export function Scouting({ onNavigate }: { onNavigate: (s: ScreenId, param?: string) => void }) {
  const { t } = useApp();
  const { career, scout, cancelScout, addTarget } = useCareer();
  const fmt = useFormat();
  const { shortPos, posName } = useLabels();
  if (!career) return null;
  const rows = career.transferTargets();
  const desk = career.scoutingView();

  const REFUSAL: Record<string, string> = {
    atCapacity: t.scoutAtCapacity,
    alreadyWatching: t.scoutAlreadyWatching,
    nothingLeftToLearn: t.scoutFullyKnown,
    ownPlayer: t.scoutOwnPlayer,
  };

  const columns: Column<TransferTarget>[] = [
    {
      key: "name",
      header: t.player,
      cell: (r) => (
        <button className="flex items-center gap-2 text-left hover:text-primary" onClick={() => onNavigate("player", r.playerId)}>
          <PlayerPhoto src={r.photo} alt={r.name} size={28} />
          <span className="font-medium text-fg">{r.name}</span>
        </button>
      ),
      sortValue: (r) => r.name,
    },
    { key: "club", header: t.club, cell: (r) => r.clubShort, sortValue: (r) => r.clubShort },
    {
      key: "pos",
      header: t.position,
      cell: (r) => <Tooltip><TooltipTrigger asChild><Badge variant={groupBadge(r.position)}>{shortPos(r.position)}</Badge></TooltipTrigger><TooltipContent>{posName(r.position)}</TooltipContent></Tooltip>,
      sortValue: (r) => r.position,
    },
    { key: "age", header: t.age, align: "center", cell: (r) => r.age, sortValue: (r) => r.age },
    {
      key: "known",
      header: t.knowledge,
      align: "center",
      cell: (r) => <Confidence value={r.confidence} />,
      sortValue: (r) => r.confidence,
    },
    {
      key: "ovr",
      header: t.overall,
      align: "center",
      // Exact once we know him, a letter when we barely do, nothing before that.
      cell: (r) =>
        r.overall !== undefined ? <Overall value={r.overall} />
          : r.overallGrade ? <span className="font-semibold text-fg-muted">{r.overallGrade}</span>
            : <span className="text-fg-faint">?</span>,
      sortValue: (r) => r.overall ?? -1,
    },
    {
      key: "pot",
      header: t.potential,
      align: "center",
      cell: (r) => <StarBand e={r.potential} />,
      sortValue: (r) => r.potential?.mid ?? -1,
    },
    {
      key: "value",
      header: t.value,
      align: "right",
      cell: (r) => <EstimateText e={r.value} format={(n) => fmt.money(n, { compact: true })} />,
      sortValue: (r) => r.value?.mid ?? -1,
    },
    {
      key: "act",
      header: "",
      align: "right",
      cell: (r) => {
        const refusal = career.scoutRefusal(r.playerId);
        const watch = (
          <Button size="sm" variant="ghost" disabled={refusal !== null} onClick={() => scout(r.playerId)}>
            <Search /> {t.scout}
          </Button>
        );
        return (
          <div className="flex justify-end gap-1">
            {/* Disabled with a reason, rather than a button that silently does nothing. */}
            {refusal ? (
              <Tooltip><TooltipTrigger asChild><span>{watch}</span></TooltipTrigger><TooltipContent>{REFUSAL[refusal]}</TooltipContent></Tooltip>
            ) : watch}
            {career.isTarget(r.playerId) ? (
              <Button size="sm" variant="ghost" disabled><Check /> {t.target}</Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => { addTarget(r.playerId); toast(fmt.t(t.addedToTargets, { name: r.name })); }}><Plus /> {t.target}</Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.scouting}</h1>
        <p className="text-sm text-fg-muted">{fmt.t(t.scoutSlots, { used: desk.used, total: desk.capacity })}</p>
      </div>

      {desk.watching.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-2 py-4">
            <h2 className="text-xs font-bold uppercase tracking-wide text-fg-muted">{t.underObservation}</h2>
            {/* An observation now runs to the top of the ladder on its own. Saying so is
                the point — otherwise the manager waits for a report and then goes hunting
                for the button that used to be needed to send the scout back out. */}
            <p className="-mt-1 mb-1 text-xs text-fg-faint">{t.observationRunsOn}</p>
            {desk.watching.map((w) => (
              <div key={w.id} className="flex items-center gap-3 text-sm">
                <Eye className="size-3.5 shrink-0 text-primary" />
                <button className="flex-1 truncate text-left font-medium text-fg hover:text-primary" onClick={() => onNavigate("player", w.playerId)}>{w.playerName}</button>
                <span className="text-xs text-fg-muted">{w.confidence}% → {w.nextConfidence}%</span>
                <span className="w-20 text-right text-xs tabular-nums text-fg-faint">{fmt.t(t.daysLeft, { n: w.daysLeft })}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon-sm" variant="ghost" aria-label={t.stopWatching} onClick={() => cancelScout(w.id)}><X /></Button>
                  </TooltipTrigger>
                  <TooltipContent>{t.stopWatching}</TooltipContent>
                </Tooltip>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="py-3">
          <DataTable columns={columns} rows={rows} getRowId={(r) => r.playerId} initialSort={{ key: "known", dir: "desc" }} filterText={(r) => `${r.name} ${r.clubShort} ${r.position}`} searchPlaceholder={`${t.player}…`} />
        </CardContent>
      </Card>
    </div>
  );
}
