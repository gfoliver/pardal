import { useMemo } from "react";
import { Search, Plus, Check, Eye, X } from "lucide-react";
import { toast } from "sonner";
import { PositionGroup, positionGroup, type Position } from "@fut/domain";
import { useApp } from "../../app/AppProviders";
import { useCareer } from "../../app/CareerProvider";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Overall } from "../../components/ui/game";
import { Flag } from "../../components/ui/flag";
import { PlayerPhoto } from "../../components/ui/player-photo";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";
import { EstimateText, StarBand } from "../../components/career/Estimate";
import { ScoutActions } from "../../components/career/ScoutActions";
import { DataGrid, FilterBar, SelectionBar, runQuery, useGridState, useSelection, type FieldSpec } from "../../components/data";
import { useFormat } from "../../lib/format";
import { groupBadge, useLabels } from "../../lib/labels";
import { cn } from "../../lib/utils";
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
  const { shortPos, posName, posOptions } = useLabels();

  const rows = useMemo(() => career?.transferTargets() ?? [], [career]);
  const seasonDays = career?.snapshot().totalDays;

  const REFUSAL: Record<string, string> = {
    atCapacity: t.scoutAtCapacity,
    alreadyWatching: t.scoutAlreadyWatching,
    nothingLeftToLearn: t.scoutFullyKnown,
    ownPlayer: t.scoutOwnPlayer,
  };

  /**
   * The market, as a set of questions the manager can actually ask.
   *
   * Note which fields are absent below the first scouting tier and which are not. Rating, value and
   * wage are `undefined` until a scout has filed something, so the grid excludes an unwatched player
   * from every range filter over them rather than guessing a zero. His CONTRACT is always there,
   * because when a deal runs out is public record — and "who is out of contract inside a year" is the
   * single most useful thing this screen can now answer.
   */
  const specs = useMemo<FieldSpec<TransferTarget>[]>(
    () => [
      {
        id: "name",
        label: t.player,
        kind: "text",
        required: true,
        width: 200,
        value: (r) => r.name,
        search: (r) => `${r.clubShort} ${shortPos(r.position)} ${posName(r.position)} ${r.position} ${r.nationality}`,
        cell: (r) => (
          <button className="flex w-full items-center gap-2 text-left hover:text-primary" onClick={() => onNavigate("player", r.playerId)}>
            <PlayerPhoto src={r.photo} alt={r.name} size={28} />
            <span className="min-w-0 flex-1 truncate font-medium text-fg">{r.name}</span>
          </button>
        ),
      },
      {
        id: "club",
        label: t.club,
        kind: "enum",
        width: 76,
        value: (r) => r.clubShort,
        cell: (r) => (
          <button className="truncate hover:text-primary" onClick={() => onNavigate("club", r.clubId)}>{r.clubShort}</button>
        ),
      },
      {
        id: "pos",
        label: t.position,
        kind: "enum",
        width: 64,
        value: (r) => r.position,
        options: (all) => posOptions(all, (r) => r.position),
        cell: (r) => <Tooltip><TooltipTrigger asChild><Badge variant={groupBadge(r.position)}>{shortPos(r.position)}</Badge></TooltipTrigger><TooltipContent>{posName(r.position)}</TooltipContent></Tooltip>,
      },
      {
        id: "line",
        label: t.positionLine,
        kind: "enum",
        hiddenByDefault: true,
        width: 64,
        value: (r) => String(positionGroup(r.position as Position)),
        options: () => [
          { value: String(PositionGroup.Goalkeeper), label: "GK" },
          { value: String(PositionGroup.Defence), label: "DEF" },
          { value: String(PositionGroup.Midfield), label: "MID" },
          { value: String(PositionGroup.Attack), label: "ATT" },
        ],
      },
      {
        id: "cover",
        label: t.otherPositions,
        kind: "text",
        hiddenByDefault: true,
        width: 90,
        value: (r) => r.secondaryPositions.map(shortPos).join(" "),
        cell: (r) =>
          r.secondaryPositions.length === 0 ? <span className="text-fg-faint">—</span> : (
            <span className="flex gap-1">{r.secondaryPositions.map((p) => <Badge key={p} variant="muted">{shortPos(p)}</Badge>)}</span>
          ),
      },
      {
        id: "nat",
        label: t.nationality,
        kind: "enum",
        hiddenByDefault: true,
        align: "center",
        width: 64,
        value: (r) => r.nationality,
        cell: (r) => <Tooltip><TooltipTrigger asChild><span className="inline-block align-middle"><Flag nationality={r.nationality} /></span></TooltipTrigger><TooltipContent>{r.nationality}</TooltipContent></Tooltip>,
      },
      { id: "age", label: t.age, kind: "number", align: "center", width: 56, value: (r) => r.age },
      {
        id: "known",
        label: t.knowledge,
        kind: "number",
        align: "center",
        width: 80,
        // No `better`, deliberately. Knowing one player better than another is a fact about our
        // scouting, not about the players, and a side-by-side that crowned the better-watched one
        // would be answering a different question from the one being asked.
        value: (r) => r.confidence,
        cell: (r) => <Confidence value={r.confidence} />,
      },
      {
        id: "ovr",
        label: t.overall,
        kind: "number",
        align: "center",
        width: 64,
        better: "higher",
        // Undefined when unscouted, so he is in no rating range at all — not in "under 60".
        value: (r) => r.overall,
        // Exact once we know him, a letter when we barely do, nothing before that.
        cell: (r) =>
          r.overall !== undefined ? <Overall value={r.overall} />
            : r.overallGrade ? <span className="font-semibold text-fg-muted">{r.overallGrade}</span>
              : <span className="text-fg-faint">?</span>,
      },
      {
        id: "pot",
        label: t.potential,
        kind: "number",
        align: "center",
        width: 90,
        better: "higher",
        value: (r) => r.potential?.mid,
        cell: (r) => <StarBand e={r.potential} />,
      },
      {
        id: "value",
        label: t.value,
        kind: "money",
        align: "right",
        width: 108,
        // Undeclared: a valuation is a price to a buyer and a measure of quality to everyone else.
        // The band's midpoint is what a range filter can compare; the cell still shows the band, so
        // the screen never pretends the estimate is a single figure.
        value: (r) => r.value?.mid,
        cell: (r) => <EstimateText e={r.value} format={(n) => fmt.money(n, { compact: true })} />,
      },
      {
        id: "wage",
        label: t.wage,
        kind: "money",
        align: "right",
        hiddenByDefault: true,
        width: 108,
        better: "lower",
        value: (r) => r.wageDemand?.mid,
        cell: (r) => <EstimateText e={r.wageDemand} format={(n) => fmt.money(n, { compact: true })} />,
      },
      {
        id: "expires",
        label: t.expires,
        kind: "days",
        align: "right",
        width: 96,
        perYear: seasonDays,
        value: (r) => r.contractDaysLeft,
        cell: (r) =>
          r.contractDaysLeft === undefined || seasonDays === undefined ? <span className="text-fg-faint">—</span> : (
            <span className={cn("tabular-nums", r.contractDaysLeft <= 180 ? "font-semibold text-gold" : "text-fg-muted")}>
              {fmt.duration(r.contractDaysLeft, seasonDays)}
            </span>
          ),
      },
      {
        id: "listed",
        label: t.listedBadge,
        kind: "bool",
        align: "center",
        width: 72,
        value: (r) => r.askingPrice !== undefined,
        cell: (r) =>
          r.askingPrice === undefined ? <span className="text-fg-faint">—</span> : (
            <Tooltip>
              <TooltipTrigger asChild><Badge variant="primary">{fmt.money(r.askingPrice, { compact: true })}</Badge></TooltipTrigger>
              <TooltipContent>{t.askingPrice}</TooltipContent>
            </Tooltip>
          ),
      },
      {
        id: "shortlisted",
        label: t.target,
        kind: "bool",
        hiddenByDefault: true,
        align: "center",
        width: 72,
        // Filterable so "everyone I have already flagged" and "everyone I have not" are both one tap,
        // which is the difference between a shortlist and a list you have to remember.
        value: (r) => career?.isTarget(r.playerId) ?? false,
      },
      {
        id: "actions",
        label: "",
        longLabel: t.actionsLabel,
        kind: "text",
        required: true,
        align: "right",
        width: 176,
        // A control, not a fact: nothing to sort or search on.
        value: () => undefined,
        // Shared with the club page's squad tab, so "watch him / shortlist him" behaves identically
        // wherever the manager noticed him.
        cell: (r) => <ScoutActions playerId={r.playerId} name={r.name} />,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, fmt, shortPos, posName, seasonDays, career, onNavigate],
  );

  const state = useGridState("scouting", specs, { field: "known", dir: "desc" });
  const selection = useSelection();
  const shown = useMemo(() => runQuery(rows, specs, state.query), [rows, specs, state.query]);

  if (!career) return null;
  const desk = career.scoutingView();

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
        <CardContent className="flex flex-col gap-3 py-3">
          <FilterBar specs={specs} rows={rows} state={state} shown={shown.length} total={rows.length} />
          {/* The screen the comparison was really built for: two strikers, one budget. */}
          <SelectionBar
            rows={rows}
            rowKey={(r) => r.playerId}
            specs={specs}
            selection={selection}
            heading={(r) => (
              <span className="flex items-center gap-2">
                <PlayerPhoto src={r.photo} alt={r.name} size={28} />
                <span className="min-w-0">
                  <button
                    className="block min-w-0 truncate text-left font-semibold text-fg outline-none hover:text-primary"
                    onClick={() => onNavigate("player", r.playerId)}
                  >
                    {r.name}
                  </button>
                  <span className="text-2xs font-normal text-fg-faint">{r.clubShort}</span>
                </span>
              </span>
            )}
          />
          <DataGrid rows={shown} state={state} rowKey={(r) => r.playerId} selection={selection} className="max-h-[calc(100vh-19rem)]" />
        </CardContent>
      </Card>
    </div>
  );
}
