import { useMemo } from "react";
import { PositionGroup, positionGroup, type Position } from "@fut/domain";
import { useApp } from "../../app/AppProviders";
import { useCareer } from "../../app/CareerProvider";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent } from "../../components/ui/card";
import { Attr, Overall } from "../../components/ui/game";
import { Flag } from "../../components/ui/flag";
import { PlayerPhoto } from "../../components/ui/player-photo";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";
import { PlayerContextMenu, PlayerRowMenu } from "../../components/career/PlayerMenu";
import { DataGrid, FilterBar, runQuery, useGridState, type FieldSpec } from "../../components/data";
import { useFormat } from "../../lib/format";
import { SIX_ATTRS, groupBadge, useLabels } from "../../lib/labels";
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

  const rows = useMemo(() => career?.squad() ?? [], [career]);
  // A season IS the game's year: contracts, ageing and expiry are all counted in them. Threaded into
  // the field spec so a contract filter can be typed in years without anyone assuming 365 days.
  const seasonDays = career?.snapshot().totalDays;

  /**
   * Every field of a squad, declared once.
   *
   * The grid, the filter menu and the column picker all read this, so a column cannot be sortable but
   * unfilterable, or filterable under a name different from its header. `value` is what gets compared
   * and searched; `cell` is what the manager reads. Keeping them apart is what lets market value sort
   * numerically while displaying as "R$ 12,4 mi".
   *
   * The six attributes and nationality arrive hidden. The default layout is the one a manager wants
   * on opening the screen — not every fact we hold about a player — and the column picker is one tap
   * away for the day he is hunting for pace.
   */
  const specs = useMemo<FieldSpec<SquadEntry>[]>(
    () => [
      {
        id: "name",
        label: t.player,
        kind: "text",
        required: true,
        width: 210,
        value: (r) => r.name,
        // Everything the row DISPLAYS is searchable, not just the raw enum: typing the abbreviation
        // actually on screen — "ZAG" — has to find the centre-backs.
        search: (r) => `${shortPos(r.position)} ${posName(r.position)} ${r.position} ${r.nationality}`,
        cell: (r) => (
          <span className="flex items-center gap-2">
            <PlayerPhoto src={r.photo} alt={r.name} size={28} />
            {/* The NAME is the link, not the row. A whole clickable row swallowed everything else
                that lives in it — the actions menu, a dialog's backdrop, a tooltip — and sent the
                manager to a profile he had not asked for. */}
            <button
              className="min-w-0 flex-1 truncate text-left font-medium text-fg outline-none hover:text-primary focus-visible:text-primary"
              onClick={() => onNavigate("player", r.playerId)}
            >
              {r.name}
            </button>
            {r.injured && <Badge variant="gold">{t.out}</Badge>}
            {/* On the block, said where the manager reads his squad — not only on the transfers
                screen, or he has to go looking to find out who he listed. */}
            {r.askingPrice !== undefined && (
              <Tooltip>
                <TooltipTrigger asChild><Badge variant="muted">{t.listedBadge}</Badge></TooltipTrigger>
                <TooltipContent>{t.askingPrice}: {fmt.money(r.askingPrice, { compact: true })}</TooltipContent>
              </Tooltip>
            )}
          </span>
        ),
      },
      {
        id: "shirt",
        label: "#",
        longLabel: t.shirtNumber,
        kind: "number",
        align: "center",
        width: 48,
        // Undefined, not 999: an unnumbered player has no number, and the grid sinks unknowns at both
        // ends of a sort rather than pretending he wears 999.
        value: (r) => r.shirtNumber,
      },
      {
        id: "pos",
        label: t.position,
        kind: "enum",
        width: 64,
        value: (r) => r.position,
        options: () => [], // fall through to the positions actually in the squad
        cell: (r) => (
          <Tooltip>
            <TooltipTrigger asChild><Badge variant={groupBadge(r.position)}>{shortPos(r.position)}</Badge></TooltipTrigger>
            <TooltipContent>{posName(r.position)}</TooltipContent>
          </Tooltip>
        ),
      },
      {
        id: "line",
        label: t.positionLine,
        longLabel: t.positionLine,
        kind: "enum",
        hiddenByDefault: true,
        width: 64,
        // By LINE as well as by exact position, because "show me the defenders" is the question a
        // manager actually asks — nobody scans a squad looking for wing-backs only.
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
          r.secondaryPositions.length === 0 ? (
            <span className="text-fg-faint">—</span>
          ) : (
            <span className="flex gap-1">
              {r.secondaryPositions.map((p) => (
                <Badge key={p} variant="muted">{shortPos(p)}</Badge>
              ))}
            </span>
          ),
      },
      {
        id: "nat",
        label: t.nationality,
        kind: "enum",
        hiddenByDefault: true,
        width: 64,
        align: "center",
        value: (r) => r.nationality,
        cell: (r) => (
          <Tooltip>
            <TooltipTrigger asChild><span className="inline-block align-middle"><Flag nationality={r.nationality} /></span></TooltipTrigger>
            <TooltipContent>{r.nationality}</TooltipContent>
          </Tooltip>
        ),
      },
      { id: "age", label: t.age, kind: "number", align: "center", width: 56, value: (r) => r.age },
      {
        id: "ovr",
        label: t.overall,
        kind: "number",
        align: "center",
        width: 64,
        value: (r) => r.overall,
        cell: (r) => <Overall value={r.overall} />,
      },
      {
        id: "pa",
        label: t.potential,
        kind: "number",
        align: "center",
        width: 80,
        value: (r) => r.potentialAbility,
        cell: (r) => (
          <Tooltip>
            <TooltipTrigger asChild><span className="inline-block align-middle"><AbilityBar ca={r.currentAbility} pa={r.potentialAbility} /></span></TooltipTrigger>
            <TooltipContent>{r.currentAbility} / {r.potentialAbility}</TooltipContent>
          </Tooltip>
        ),
      },
      // The six summary categories, each filterable on its own — "a full-back quicker than 80" is a
      // real question and it used to be unanswerable without opening every profile in the squad.
      // Same list the profile radar draws, so the two views cannot label them differently.
      ...SIX_ATTRS.map<FieldSpec<SquadEntry>>(({ key, labelKey, axis }) => ({
        id: `attr-${key}`,
        label: axis,
        longLabel: t[labelKey],
        kind: "number",
        align: "center",
        hiddenByDefault: true,
        width: 52,
        value: (r) => r.attrs[key],
        cell: (r) => <Attr value={r.attrs[key]} />,
      })),
      {
        id: "fit",
        label: t.condition,
        kind: "number",
        align: "center",
        width: 72,
        value: (r) => Math.round(r.fitness),
        cell: (r) => <span className={cn("tabular-nums", r.fitness < 60 ? "text-gold" : "text-fg-muted")}>{Math.round(r.fitness)}%</span>,
      },
      {
        id: "status",
        label: t.role,
        kind: "enum",
        width: 88,
        value: (r) => r.contract?.squadStatus,
        options: (all) => {
          const seen = new Set<string>();
          for (const r of all) if (r.contract) seen.add(r.contract.squadStatus);
          return [...seen].map((v) => ({ value: v, label: statusName(v as never) }));
        },
        cell: (r) => <span className="text-xs text-fg-muted">{statusName(r.contract?.squadStatus)}</span>,
      },
      {
        id: "value",
        label: t.marketValue,
        kind: "money",
        align: "right",
        width: 96,
        value: (r) => r.value,
        cell: (r) => <span className="tabular-nums">{fmt.money(r.value, { compact: true })}</span>,
      },
      {
        id: "wage",
        label: t.wage,
        kind: "money",
        align: "right",
        width: 96,
        value: (r) => r.contract?.wage,
        cell: (r) => (r.contract ? <span className="tabular-nums">{fmt.money(r.contract.wage, { compact: true })}</span> : <span className="text-fg-faint">—</span>),
      },
      {
        id: "expires",
        label: t.expires,
        kind: "days",
        align: "right",
        width: 96,
        perYear: seasonDays,
        value: (r) => r.contractDaysLeft,
        // A deal running down is the one squad fact that needs to shout. Read as years and months,
        // with the date itself a hover away — "266 days left" is a number nobody converts in their head.
        cell: (r) =>
          r.contractDaysLeft === undefined || seasonDays === undefined ? (
            <span className="text-fg-faint">—</span>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={cn("tabular-nums", r.contractDaysLeft <= CONTRACT_WARN_DAYS ? "font-semibold text-gold" : "text-fg-muted")}>
                  {fmt.duration(r.contractDaysLeft, seasonDays)}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {r.contract && career
                  ? `${t.contractUntil} ${fmt.civil(career.civilDate(r.contract.expiry))}`
                  : fmt.t(t.daysLeft, { n: Math.max(0, r.contractDaysLeft) })}
              </TooltipContent>
            </Tooltip>
          ),
      },
      {
        id: "injured",
        label: t.out,
        longLabel: t.injuredLabel,
        kind: "bool",
        hiddenByDefault: true,
        width: 56,
        align: "center",
        value: (r) => r.injured,
      },
      {
        id: "listed",
        label: t.listedBadge,
        kind: "bool",
        hiddenByDefault: true,
        width: 64,
        align: "center",
        value: (r) => r.askingPrice !== undefined,
      },
      {
        id: "actions",
        label: "",
        longLabel: t.actionsLabel,
        kind: "text",
        required: true,
        align: "center",
        width: 44,
        // No value: this column is a control, not a fact, so there is nothing to sort or search on.
        // It stays required because the right-click menu is not discoverable on a touch screen, and
        // this button is the only way to reach a player's actions there.
        value: () => undefined,
        cell: (r) => <PlayerRowMenu playerId={r.playerId} context="squad" onNavigate={onNavigate} label={t.actionsLabel} />,
      },
    ],
    [t, fmt, shortPos, posName, statusName, seasonDays, career, onNavigate],
  );

  const state = useGridState("squad", specs, { field: "ovr", dir: "desc" });
  const shown = useMemo(() => runQuery(rows, specs, state.query), [rows, specs, state.query]);

  if (!career) return null;

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
        <CardContent className="flex flex-col gap-3 py-3">
          <FilterBar specs={specs} rows={rows} state={state} shown={shown.length} total={rows.length} />
          <DataGrid
            rows={shown}
            state={state}
            rowKey={(r) => r.playerId}
            className="max-h-[calc(100vh-19rem)]"
            rowWrapper={(r, rendered) => (
              <PlayerContextMenu asChild playerId={r.playerId} context="squad" onNavigate={onNavigate}>
                {rendered}
              </PlayerContextMenu>
            )}
          />
        </CardContent>
      </Card>
    </div>
  );
}
