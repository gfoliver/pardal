import { PositionGroup, positionGroup, type Position } from "@fut/domain";
import { useApp } from "../../app/AppProviders";
import { useCareer } from "../../app/CareerProvider";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent } from "../../components/ui/card";
import { DataTable, type Column, type Facet } from "../../components/ui/data-table";
import { Overall } from "../../components/ui/game";
import { PlayerPhoto } from "../../components/ui/player-photo";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";
import { PlayerContextMenu, PlayerRowMenu } from "../../components/career/PlayerMenu";
import { useFormat } from "../../lib/format";
import { groupBadge, useLabels } from "../../lib/labels";
import { cn } from "../../lib/utils";
import type { ScreenId } from "../../layout/Shell";
import type { SquadEntry } from "@fut/career";

/** Under this many days left, a contract is a problem rather than a fact. */
const CONTRACT_WARN_DAYS = 180;

/** Ability now, with the room left to grow drawn behind it. */
function AbilityBar({ ca, pa }: { ca: number; pa: number }) {
  const pct = (v: number) => Math.max(0, Math.min(100, (v / 200) * 100));
  return (
    <div className="relative h-1.5 w-16 overflow-hidden rounded-full bg-surface-2">
      <div className="absolute inset-y-0 left-0 rounded-full bg-primary opacity-25" style={{ width: `${pct(pa)}%` }} />
      <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${pct(ca)}%` }} />
    </div>
  );
}

export function Squad({ onNavigate }: { onNavigate: (s: ScreenId, param?: string) => void }) {
  const { t } = useApp();
  const { career } = useCareer();
  const fmt = useFormat();
  const { shortPos, statusName, posName } = useLabels();
  if (!career) return null;
  const rows = career.squad();

  const columns: Column<SquadEntry>[] = [
    {
      key: "shirt",
      header: "#",
      // Sorts unnumbered players last rather than first: a blank is "not
      // assigned", not "number zero".
      cell: (r) => <span className="tabular-nums text-fg-muted">{r.shirtNumber ?? "—"}</span>,
      sortValue: (r) => r.shirtNumber ?? 999,
    },
    {
      key: "name",
      header: t.player,
      cell: (r) => (
        <span className="flex items-center gap-2">
          <PlayerPhoto src={r.photo} alt={r.name} size={28} />
          <span className="font-medium text-fg">{r.name}</span>
          {r.injured && <Badge variant="gold">{t.out}</Badge>}
        </span>
      ),
      sortValue: (r) => r.name,
    },
    {
      key: "pos",
      header: t.position,
      cell: (r) => (
        <Tooltip><TooltipTrigger asChild><Badge variant={groupBadge(r.position)}>{shortPos(r.position)}</Badge></TooltipTrigger><TooltipContent>{posName(r.position)}</TooltipContent></Tooltip>
      ),
      sortValue: (r) => r.position,
    },
    { key: "age", header: t.age, align: "center", cell: (r) => r.age, sortValue: (r) => r.age },
    { key: "ovr", header: t.overall, align: "center", cell: (r) => <Overall value={r.overall} />, sortValue: (r) => r.overall },
    {
      key: "ability",
      header: t.potential,
      align: "center",
      cell: (r) => (
        <Tooltip>
          <TooltipTrigger asChild><span className="inline-block align-middle"><AbilityBar ca={r.currentAbility} pa={r.potentialAbility} /></span></TooltipTrigger>
          <TooltipContent>{r.currentAbility} / {r.potentialAbility}</TooltipContent>
        </Tooltip>
      ),
      sortValue: (r) => r.potentialAbility,
    },
    {
      key: "fit",
      header: t.condition,
      align: "center",
      cell: (r) => <span className={cn("tabular-nums", r.fitness < 60 ? "text-gold" : "text-fg-muted")}>{Math.round(r.fitness)}%</span>,
      sortValue: (r) => r.fitness,
    },
    { key: "status", header: t.role, cell: (r) => <span className="text-xs text-fg-muted">{statusName(r.contract?.squadStatus)}</span>, sortValue: (r) => r.contract?.squadStatus ?? "" },
    { key: "value", header: t.marketValue, align: "right", cell: (r) => <span className="tabular-nums">{fmt.money(r.value, { compact: true })}</span>, sortValue: (r) => r.value },
    { key: "wage", header: t.wage, align: "right", cell: (r) => (r.contract ? fmt.money(r.contract.wage, { compact: true }) : "—"), sortValue: (r) => r.contract?.wage ?? 0 },
    {
      key: "expires",
      header: t.expires,
      align: "right",
      // A deal running down is the one squad fact that needs to shout.
      cell: (r) =>
        r.contractDaysLeft === undefined ? "—" : (
          <span className={cn("tabular-nums", r.contractDaysLeft <= CONTRACT_WARN_DAYS ? "font-semibold text-gold" : "text-fg-muted")}>
            {fmt.t(t.daysLeft, { n: Math.max(0, r.contractDaysLeft) })}
          </span>
        ),
      sortValue: (r) => r.contractDaysLeft ?? 99999,
    },
  ];

  // Filter by line, not by the nine exact positions — nobody scans a squad
  // looking for "wing-backs only".
  const facets: Facet<SquadEntry>[] = [
    {
      key: "group",
      allLabel: t.allFilter,
      valueOf: (r) => String(positionGroup(r.position as Position)),
      options: [
        { value: String(PositionGroup.Goalkeeper), label: "GK" },
        { value: String(PositionGroup.Defence), label: "DEF" },
        { value: String(PositionGroup.Midfield), label: "MID" },
        { value: String(PositionGroup.Attack), label: "ATT" },
      ],
    },
  ];

  const expiring = rows.filter((r) => (r.contractDaysLeft ?? Infinity) <= CONTRACT_WARN_DAYS).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.squadTitle}</h1>
        <p className="text-sm text-fg-muted">
          {rows.length} {t.player.toLowerCase()}s
          {expiring > 0 && <span className="text-gold"> · {fmt.t(t.expiringCount, { n: expiring })}</span>}
        </p>
      </div>
      <Card>
        <CardContent className="py-3">
          <DataTable
            columns={columns}
            rows={rows}
            getRowId={(r) => r.playerId}
            onRowClick={(r) => onNavigate("player", r.playerId)}
            initialSort={{ key: "ovr", dir: "desc" }}
            filterText={(r) => `${r.name} ${r.position}`}
            searchPlaceholder={`${t.player}…`}
            facets={facets}
            rowActions={(r) => <PlayerRowMenu playerId={r.playerId} context="squad" onNavigate={onNavigate} label={t.actionsLabel} />}
            rowWrapper={(r, rendered) => (
              <PlayerContextMenu playerId={r.playerId} context="squad" onNavigate={onNavigate}>
                {rendered}
              </PlayerContextMenu>
            )}
          />
        </CardContent>
      </Card>
    </div>
  );
}
