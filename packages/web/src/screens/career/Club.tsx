import { useMemo } from "react";
import { Star } from "lucide-react";
import { useApp } from "../../app/AppProviders";
import { useCareer } from "../../app/CareerProvider";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";
import { Overall } from "../../components/ui/game";
import { Pitch, type PitchSpot } from "../../components/pitch";
import { Crest } from "../../components/ui/crest";
import { Flag } from "../../components/ui/flag";
import { TeamShirt } from "../../components/ui/team-shirt";
import { EstimateText, StarBand } from "../../components/career/Estimate";
import { PlayerContextMenu } from "../../components/career/PlayerMenu";
import { ScoutActions } from "../../components/career/ScoutActions";
import { DataGrid, FilterBar, SelectionBar, runQuery, useGridState, useSelection, type FieldSpec } from "../../components/data";
import { useFormat } from "../../lib/format";
import { lineupSpots } from "../../lib/lineup";
import { groupBadge, useLabels } from "../../lib/labels";
import { cn } from "../../lib/utils";
import type { UIStringKey } from "../../i18n/strings";
import type { ScreenId } from "../../layout/Shell";
import type { ClubHighlight, SquadEntry, TacticsView, TransferTarget } from "@fut/career";
import type { ClubKit } from "@fut/competition";

const FORM_TONE: Record<string, string> = { W: "bg-[var(--pos-mid)] text-[var(--text-on-accent)]", D: "bg-surface-3 text-fg-muted", L: "bg-danger text-[var(--text-on-accent)]" };

function Stars({ n }: { n: number }) {
  return <span className="inline-flex">{Array.from({ length: 5 }, (_, i) => <Star key={i} className={i < n ? "size-3.5 fill-gold text-gold" : "size-3.5 text-fg-faint"} />)}</span>;
}

export function Club({ clubId, onNavigate }: { clubId: string; onNavigate: (s: ScreenId, param?: string) => void }) {
  const { t } = useApp();
  const { career } = useCareer();
  const fmt = useFormat();
  const { shortPos } = useLabels();
  if (!career) return null;
  const c = career.clubDetail(clubId);
  if (!c) {
    return (
      <div className="flex flex-col gap-4">
        <Button size="sm" variant="ghost" className="self-start" onClick={() => onNavigate("league")}>{t.league}</Button>
        <p className="text-sm text-fg-muted">—</p>
      </div>
    );
  }
  const kit = career.snapshot().clubs[clubId]?.kits?.home;
  const squad = career.squad(clubId);
  const tactics = career.tacticsView(clubId);
  const isMine = clubId === career.snapshot().managedClubId;
  /*
   * What the tooltip may say about a player's ability.
   *
   * A `TacticsView` carries the TRUE overall for whatever club it describes, and this page prints it
   * — so a rival's XI was handing out eleven exact ratings for players nobody had scouted, on the
   * page you reach by clicking a crest in the league table. That is the number the whole scouting
   * model exists to withhold. Our own squad is unchanged; for anyone else it now reads at the same
   * fidelity the scouting screen would give: the exact figure once we know him, a letter grade when
   * we barely do, and nothing at all before that.
   */
  const shownRating = (playerId: string, trueOverall: number): string | undefined => {
    if (isMine) return String(trueOverall);
    const p = career.playerDetail(playerId);
    return p?.overall !== undefined ? String(p.overall) : p?.overallGrade;
  };
  const spots = tactics
    ? lineupSpots(tactics, squad, shortPos, (pos, k) => <TeamShirt kit={k} size={38} label={pos} />, kit, shownRating)
    : [];
  // THIS club's division, not the manager's: the table below highlights the club the page is about,
  // and a rival a tier down has no row in ours.
  const table = career.table(c?.leagueCompetitionId);

  const highlight = (labelKey: UIStringKey, h: ClubHighlight | undefined, suffix?: string) =>
    h ? (
      <button className="flex w-full items-center gap-3 rounded-md px-1 py-1.5 text-left hover:bg-surface-2" onClick={() => onNavigate("player", h.playerId)}>
        <div className="flex-1">
          <div className="text-2xs uppercase tracking-wide text-fg-faint">{t[labelKey]}</div>
          <div className="text-sm font-medium text-fg">{h.name}</div>
        </div>
        <Badge variant="muted">{shortPos(h.position)}</Badge>
        <span className="w-10 text-right text-sm font-semibold tabular-nums text-fg">{h.figure}{suffix ?? ""}</span>
      </button>
    ) : null;

  /*
   * The rows we are entitled to.
   *
   * Squad size, ages, nationalities and injuries are public record — a squad list is published and
   * an injury is reported. Ratings and money are not: this game derives a player's value from his
   * ability, so a squad's total value is its rating in another currency, and printing it for a club
   * nobody has watched would hand over exactly what scouting exists to charge for. Those come back
   * undefined and the row is DROPPED rather than shown as zero or a dash, because a dash in a list of
   * figures still reads as a measurement that happened to fail.
   */
  const money = (v: number | undefined) => (v === undefined ? undefined : fmt.money(v, { compact: true }));
  const statRows = (
    [
      [t.playersLabel, String(c.squadCount)],
      [t.avgLevel, c.level === undefined ? undefined : String(c.level)],
      [t.avgAge, String(c.avgAge)],
      [t.totalValue, money(c.totalValue)],
      [t.avgValueLabel, money(c.avgValue)],
      [t.wageBill, money(c.wageBill)],
      [t.avgWage, money(c.avgWage)],
      [t.foreigners, String(c.foreigners)],
      [t.u21, String(c.u21)],
      [t.injuredCount, String(c.injured)],
    ] as [string, string | undefined][]
  ).filter((r): r is [string, string] => r[1] !== undefined);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-4">
        <Crest src={c.crest} code={c.shortName} size={64} className="rounded-lg" />
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{c.name}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
            <span>{c.leagueName}</span>
            <Stars n={c.reputationStars} />
          </div>
          {(c.city || c.stadium || c.founded) && (
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-fg-faint">
              {c.city && <span>{c.city}</span>}
              {c.stadium && <span>· {c.stadium}{c.capacity ? ` (${fmt.number(c.capacity)})` : ""}</span>}
              {c.founded && <span>· {c.founded}</span>}
            </div>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-4 text-sm">
            {/* A rival's board allocation is not published anywhere, so it is simply not here. */}
            {c.annualBudget !== undefined && (
              <span className="text-fg-muted">{t.annualBudget}: <span className="font-medium text-fg">{fmt.money(c.annualBudget, { compact: true })}</span></span>
            )}
            <span className="text-fg-muted">{t.campaign}: <span className="font-medium text-fg tabular-nums">{c.record.won}{t.won} {c.record.drawn}{t.drawn} {c.record.lost}{t.lost}</span></span>
            <span className="inline-flex items-center gap-1">
              {c.form.map((f, i) => <span key={i} className={cn("grid size-5 place-items-center rounded text-2xs font-bold", FORM_TONE[f])}>{f}</span>)}
            </span>
          </div>
        </div>
        {/* The squad's rating, when we have earned it. `ratedCount` says how far off we are when not. */}
        {c.level !== undefined ? (
          <Overall value={c.level} />
        ) : (
          <span className="rounded-sm bg-surface-2 px-2 py-1 text-xs text-fg-faint">
            {fmt.t(t.observedOf, { n: c.ratedCount, total: c.squadCount })}
          </span>
        )}
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{t.overviewTab}</TabsTrigger>
          {/* The count is on the tab because it is the honest headline for a rival: not "their squad"
              but "the part of their squad we have looked at". */}
          <TabsTrigger value="squad">
            {t.squadTab}
            {c.ratedCount < c.squadCount ? ` (${c.ratedCount}/${c.squadCount})` : ` (${c.squadCount})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="squad">
          <ClubSquad clubId={clubId} onNavigate={onNavigate} />
        </TabsContent>

        <TabsContent value="overview">
      {/* Identity/details column, then a nested grid pairing the lineup with the
          standings — nesting keeps the left column out of their row, so the
          pitch alone sets the height the standings matches (and scrolls in). */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
        {/* Coach + highlights + squad details */}
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader><CardTitle>{t.coach}</CardTitle></CardHeader>
            <CardContent className="flex items-center gap-3">
              <div className="grid size-12 place-items-center rounded-full bg-surface-2 text-sm font-bold text-fg-muted">{c.coach.name.split(" ").map((s) => s[0]).slice(0, 2).join("")}</div>
              <div className="flex-1">
                <div className="font-medium text-fg">{c.coach.name}</div>
                <div className="flex items-center gap-1.5 text-xs text-fg-muted"><Flag nationality={c.coach.nationality} size={12} /> · {c.coach.age}</div>
              </div>
              <Stars n={c.coach.stars} />
            </CardContent>
          </Card>
          {/* Nothing to highlight about a club we have not watched, and an empty card headed
              "Highlights" reads as a rendering fault rather than as an absence of knowledge. Goals
              and assists are match facts, so they can carry the card on their own. */}
          {(c.best || c.potential || c.scorer || c.assister) && (
          <Card>
            <CardHeader><CardTitle>{t.highlights}</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-1">
              {highlight("bestPlayer", c.best)}
              {highlight("highestPotential", c.potential, "★")}
              {highlight("topScorer", c.scorer)}
              {highlight("topAssister", c.assister)}
            </CardContent>
          </Card>
          )}
          <Card>
            <CardHeader><CardTitle>{t.squadOverview}</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-1.5 text-sm">
              {statRows.map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-3 border-b border-hairline pb-1 last:border-0 last:pb-0">
                  <span className="truncate text-fg-muted">{label}</span>
                  <span className="shrink-0 font-medium tabular-nums text-fg">{value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Lineup + standings share a row: the pitch sets the height */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,15rem)]">
        {/* Squad pitch */}
        <Card className="self-start">
          <CardHeader><CardTitle>{t.squad}</CardTitle></CardHeader>
          <CardContent className="p-3 sm:p-4"><div className="mx-auto max-w-md"><Pitch spots={spots} /></div></CardContent>
        </Card>

        {/* Standings — the wrapper adds no height of its own, so the row is sized
            by the pitch; the card fills it and the table scrolls inside. */}
        <div className="relative min-h-0">
        <Card className="flex h-full min-h-0 flex-col lg:absolute lg:inset-0">
          <CardHeader><CardTitle>{t.standings}</CardTitle></CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>{t.league}</TableHead>
                  <TableHead className="text-right">{t.points}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {table.map((r, i) => (
                  <TableRow key={r.teamId} data-active={r.teamId === clubId}>
                    <TableCell className="tabular-nums text-fg-faint">{i + 1}</TableCell>
                    <TableCell>
                      <button className="flex items-center gap-2 hover:text-primary" onClick={() => onNavigate("club", r.teamId)}>
                        <Crest src={career.clubCrest(r.teamId)} code={career.clubShort(r.teamId)} size={18} />
                        {career.clubShort(r.teamId)}
                      </button>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{r.points}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        </div>
        </div>
      </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Any club's whole squad, at the fidelity we have earned.
 *
 * Reads `clubSquad`, which is the SAME fogged row the scouting screen uses — so an unwatched rival's
 * ratings and values come through absent rather than exact, and there is one set of rules rather than
 * a second set here that could drift from it. For our own club every figure is exact, because our
 * confidence in our own players is total, so this needs no special case for the team we manage.
 */
function ClubSquad({ clubId, onNavigate }: { clubId: string; onNavigate: (s: ScreenId, param?: string) => void }) {
  const { t } = useApp();
  const { career } = useCareer();
  const fmt = useFormat();
  const { shortPos, posName, posOptions } = useLabels();

  const rows = useMemo(() => career?.clubSquad(clubId) ?? [], [career, clubId]);
  const seasonDays = career?.snapshot().totalDays;

  const specs = useMemo<FieldSpec<TransferTarget>[]>(
    () => [
      {
        id: "name",
        label: t.player,
        kind: "text",
        required: true,
        width: 200,
        value: (r) => r.name,
        search: (r) => `${shortPos(r.position)} ${posName(r.position)} ${r.nationality}`,
        cell: (r) => (
          <button
            className="w-full truncate text-left font-medium text-fg outline-none hover:text-primary focus-visible:text-primary"
            onClick={() => onNavigate("player", r.playerId)}
          >
            {r.name}
          </button>
        ),
      },
      {
        id: "pos",
        label: t.position,
        kind: "enum",
        width: 64,
        value: (r) => r.position,
        options: (all) => posOptions(all, (r) => r.position),
        cell: (r) => (
          <Tooltip><TooltipTrigger asChild><Badge variant={groupBadge(r.position)}>{shortPos(r.position)}</Badge></TooltipTrigger><TooltipContent>{posName(r.position)}</TooltipContent></Tooltip>
        ),
      },
      {
        id: "nat",
        label: t.nationality,
        kind: "enum",
        align: "center",
        width: 60,
        value: (r) => r.nationality,
        cell: (r) => <Tooltip><TooltipTrigger asChild><span className="inline-block align-middle"><Flag nationality={r.nationality} /></span></TooltipTrigger><TooltipContent>{r.nationality}</TooltipContent></Tooltip>,
      },
      { id: "age", label: t.age, kind: "number", align: "center", width: 56, value: (r) => r.age },
      {
        id: "known",
        label: t.knowledge,
        kind: "number",
        align: "center",
        width: 76,
        value: (r) => r.confidence,
        cell: (r) => (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex h-1.5 w-10 overflow-hidden rounded-full bg-surface-2 align-middle">
                <span className="block h-full rounded-full bg-primary" style={{ width: `${r.confidence}%` }} />
              </span>
            </TooltipTrigger>
            <TooltipContent>{r.confidence}%</TooltipContent>
          </Tooltip>
        ),
      },
      {
        id: "ovr",
        label: t.overall,
        kind: "number",
        align: "center",
        width: 64,
        better: "higher",
        // Absent, not zero, for a player we have not watched — so he is in no rating range either.
        // A side-by-side therefore cannot crown the one we happen to have scouted.
        value: (r) => r.overall,
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
        width: 88,
        better: "higher",
        value: (r) => r.potential?.mid,
        cell: (r) => <StarBand e={r.potential} />,
      },
      {
        id: "value",
        label: t.value,
        kind: "money",
        align: "right",
        width: 104,
        value: (r) => r.value?.mid,
        cell: (r) => <EstimateText e={r.value} format={(v) => fmt.money(v, { compact: true })} />,
      },
      {
        id: "expires",
        label: t.expires,
        kind: "days",
        align: "right",
        width: 90,
        perYear: seasonDays,
        // Public record, so it is here for the whole squad however little we know them.
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
        width: 68,
        value: (r) => r.askingPrice !== undefined,
        cell: (r) =>
          r.askingPrice === undefined ? <span className="text-fg-faint">—</span> : (
            <Tooltip><TooltipTrigger asChild><Badge variant="primary">{fmt.money(r.askingPrice, { compact: true })}</Badge></TooltipTrigger><TooltipContent>{t.askingPrice}</TooltipContent></Tooltip>
          ),
      },
      {
        id: "shortlisted",
        label: t.target,
        kind: "bool",
        hiddenByDefault: true,
        align: "center",
        width: 72,
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
        // A control, not a fact. Browsing a rival's squad is exactly when a player is worth watching,
        // so the buttons belong here and not only behind a right-click.
        value: () => undefined,
        cell: (r) => <ScoutActions playerId={r.playerId} name={r.name} />,
      },
    ],
    [t, fmt, shortPos, posName, seasonDays, onNavigate, career],
  );

  // Keyed per club would mean twenty stored layouts for one screen, so they share one.
  const state = useGridState("club.squad", specs, { field: "ovr", dir: "desc" });
  const selection = useSelection();
  const shown = useMemo(() => runQuery(rows, specs, state.query), [rows, specs, state.query]);

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-3">
        <FilterBar specs={specs} rows={rows} state={state} shown={shown.length} total={rows.length} />
        <SelectionBar
          rows={rows}
          rowKey={(r) => r.playerId}
          specs={specs}
          selection={selection}
          // No photo, to match this screen's own name column — a rival's squad list is drawn plainer
          // than our own, and the comparison should not be the one place that differs.
          heading={(r) => (
            <button
              className="min-w-0 truncate text-left font-semibold text-fg outline-none hover:text-primary"
              onClick={() => onNavigate("player", r.playerId)}
            >
              {r.name}
            </button>
          )}
        />
        <DataGrid
          rows={shown}
          state={state}
          rowKey={(r) => r.playerId}
          selection={selection}
          className="max-h-[calc(100vh-21rem)]"
          // "scouting" is the right context for anyone else's player: watch him, shortlist him, bid
          // for him. The same helper offers the squad actions for one of ours.
          rowWrapper={(r, rendered) => (
            <PlayerContextMenu asChild playerId={r.playerId} context="scouting" onNavigate={onNavigate}>
              {rendered}
            </PlayerContextMenu>
          )}
        />
      </CardContent>
    </Card>
  );
}
