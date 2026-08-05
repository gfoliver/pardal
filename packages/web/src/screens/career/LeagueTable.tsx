import { useMemo } from "react";
import type { RoundView } from "@fut/career";
import { useApp } from "../../app/AppProviders";
import { useCareer } from "../../app/CareerProvider";
import { Card, CardContent } from "../../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { DataGrid, FilterBar, runQuery, useGridState, type FieldSpec } from "../../components/data";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Crest } from "../../components/ui/crest";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { loadedDataset } from "../../lib/career/dataset";
import { useFormat } from "../../lib/format";
import { cn } from "../../lib/utils";
import type { ScreenId } from "../../layout/Shell";

export function LeagueTable({ onNavigate }: { onNavigate: (s: ScreenId, param?: string) => void }) {
  const { t } = useApp();
  const { career } = useCareer();
  if (!career) return null;
  const snap = career.snapshot();
  // Synchronous: a career cannot exist without its dataset having been loaded first.
  const logo = loadedDataset(snap.datasetId)?.logo();
  const leagueName = snap.structure.divisions[0]?.name ?? t.league;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
        {logo && <Crest src={logo} size={32} />}
        {leagueName}
      </h1>

      <Tabs defaultValue="table" className="flex flex-col gap-5">
        <TabsList>
          <TabsTrigger value="table">{t.standings}</TabsTrigger>
          <TabsTrigger value="results">{t.results}</TabsTrigger>
          <TabsTrigger value="fixtures">{t.fixtures}</TabsTrigger>
        </TabsList>
        <TabsContent value="table"><Standings onNavigate={onNavigate} /></TabsContent>
        <TabsContent value="results"><Rounds mode="results" onNavigate={onNavigate} /></TabsContent>
        <TabsContent value="fixtures"><Rounds mode="fixtures" onNavigate={onNavigate} /></TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * A standings row with its LEAGUE POSITION attached.
 *
 * The position has to be a field, not the row's index. Once the manager sorts by goals against to see
 * who defends best, the row order is no longer the league order — and a "#" column reading 1..20 down
 * a re-sorted table would be inventing a table nobody is in.
 */
type RankedRow = ReturnType<NonNullable<ReturnType<typeof useCareer>["career"]>["table"]>[number] & { pos: number };

function Standings({ onNavigate }: { onNavigate: (s: ScreenId, param?: string) => void }) {
  const { t } = useApp();
  const { career } = useCareer();
  /*
   * The one list that stays a TABLE on a phone.
   *
   * Cards are the right answer for a squad, where a row is a name plus twenty numbers. A league table
   * is not that shape: its columns are two characters wide, and a card per club would spend a whole
   * box on four figures that fit one line — while destroying the thing a standings table is FOR, which
   * is reading a column straight down.
   *
   * It fits by being cut down rather than by scrolling sideways: club, played, goal difference, points.
   * Won/drawn/lost and goals for/against are still there in the column picker, so nothing is lost —
   * they are just not what a phone opens on. Goal difference stays because the table is ORDERED on it.
   */
  const narrow = !useMediaQuery("(min-width: 768px)");

  const rows = useMemo<RankedRow[]>(
    () => (career?.table("league") ?? []).map((r, i) => ({ ...r, pos: i + 1 })),
    [career],
  );

  const specs = useMemo<FieldSpec<RankedRow>[]>(
    () => [
      {
        id: "club",
        label: t.club,
        kind: "text",
        required: true,
        width: narrow ? 150 : 190,
        value: (r) => career?.clubNickname(r.teamId) ?? r.teamId,
        cell: (r) => (
          <button className="flex w-full items-center gap-2 hover:text-primary" onClick={() => onNavigate("club", r.teamId)}>
            <span className="w-5 shrink-0 text-right tabular-nums text-fg-faint">{r.pos}</span>
            <Crest src={career?.clubCrest(r.teamId)} code={career?.clubShort(r.teamId)} size={18} />
            <span className="min-w-0 flex-1 truncate">{career?.clubNickname(r.teamId)}</span>
          </button>
        ),
      },
      { id: "played", label: "P", longLabel: t.played, kind: "number", align: "center", width: narrow ? 38 : 48, value: (r) => r.played },
      { id: "won", label: t.won, kind: "number", align: "center", width: 44, hiddenByDefault: narrow, value: (r) => r.won },
      { id: "drawn", label: t.drawn, kind: "number", align: "center", width: 44, hiddenByDefault: narrow, value: (r) => r.drawn },
      { id: "lost", label: t.lost, kind: "number", align: "center", width: 44, hiddenByDefault: narrow, value: (r) => r.lost },
      { id: "gf", label: t.goalsFor, kind: "number", align: "center", width: 48, hiddenByDefault: narrow, value: (r) => r.goalsFor },
      { id: "ga", label: t.goalsAgainst, kind: "number", align: "center", width: 48, hiddenByDefault: narrow, value: (r) => r.goalsAgainst },
      {
        id: "gd",
        label: t.goalDifference,
        kind: "number",
        align: "center",
        width: narrow ? 44 : 52,
        // The table is ORDERED on this, so it has to be visible: two clubs level on points looked
        // arbitrarily ranked without it.
        value: (r) => r.goalDifference,
        cell: (r) => <span className="tabular-nums">{r.goalDifference > 0 ? `+${r.goalDifference}` : r.goalDifference}</span>,
      },
      {
        id: "points",
        label: t.points,
        kind: "number",
        align: "right",
        width: narrow ? 46 : 56,
        value: (r) => r.points,
        cell: (r) => <span className="font-semibold tabular-nums">{r.points}</span>,
      },
      {
        id: "ppg",
        label: t.pointsPerGame,
        kind: "number",
        align: "right",
        hiddenByDefault: true,
        width: 64,
        // Undefined before a ball is kicked rather than 0: a club that has played nothing has no
        // average, and calling it zero would rank it below a side that has actually been beaten.
        value: (r) => (r.played > 0 ? Math.round((r.points / r.played) * 100) / 100 : undefined),
      },
    ],
    [t, career, onNavigate, narrow],
  );

  const state = useGridState("league.standings", specs, { field: "points", dir: "desc" });
  const shown = useMemo(() => runQuery(rows, specs, state.query), [rows, specs, state.query]);
  if (!career) return null;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-3">
        <FilterBar specs={specs} rows={rows} state={state} shown={shown.length} total={rows.length} />
        <DataGrid
          rows={shown}
          state={state}
          rowKey={(r) => r.teamId}
          isActive={(r) => r.teamId === career.snapshot().managedClubId}
          mobile="table"
        />
      </CardContent>
    </Card>
  );
}

/**
 * The fixture list, round by round.
 *
 * Two readings of one list rather than two screens: "results" walks backwards
 * from the most recent matchday, "fixtures" forwards from the next one. A round
 * caught halfway — the AI games played, ours still to come — belongs in both,
 * and appears in both.
 */
function Rounds({ mode, onNavigate }: { mode: "results" | "fixtures"; onNavigate: (s: ScreenId, param?: string) => void }) {
  const { t } = useApp();
  const { career } = useCareer();
  const fmt = useFormat();
  const rounds = useMemo(() => career?.rounds("league") ?? [], [career]);
  if (!career) return null;

  const shown = mode === "results"
    ? rounds.filter((r) => r.matches.some((m) => m.played)).reverse()
    : rounds.filter((r) => r.matches.some((m) => !m.played));

  if (shown.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-fg-muted">
          {mode === "results" ? t.noResultsYet : t.seasonFinished}
        </CardContent>
      </Card>
    );
  }

  const season = career.snapshot().currentDate.season;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {shown.map((r) => (
        <RoundCard
          key={r.round}
          round={r}
          date={fmt.civil(career.civilDate({ season, dayOfSeason: r.day }))}
          label={`${t.round} ${r.round}`}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
}

function RoundCard({
  round,
  date,
  label,
  onNavigate,
}: {
  round: RoundView;
  date: string;
  label: string;
  onNavigate: (s: ScreenId, param?: string) => void;
}) {
  const { career } = useCareer();
  if (!career) return null;
  const nick = (id: string) => career.clubNickname(id);
  const club = (id: string) => (
    <button className="flex min-w-0 items-center gap-1.5 truncate hover:text-primary" onClick={() => onNavigate("club", id)}>
      <Crest src={career.clubCrest(id)} code={career.clubShort(id)} size={16} />
      <span className="truncate">{nick(id)}</span>
    </button>
  );

  return (
    <Card>
      <CardContent className="flex flex-col gap-1 py-3">
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-2xs font-bold uppercase tracking-caps text-fg-faint">{label}</span>
          <span className="text-2xs text-fg-faint">{date}</span>
        </div>
        {round.matches.map((m, i) => (
          <div
            key={i}
            className={cn(
              "grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-sm px-1 py-1 text-sm",
              // Our game is the one the eye is looking for in a list of ten.
              m.mine && "bg-surface-2 font-medium",
            )}
          >
            <span className="flex justify-end">{club(m.homeId)}</span>
            <span className={cn("shrink-0 tabular-nums", m.played ? "font-semibold" : "text-fg-faint")}>
              {m.played ? `${m.homeScore}–${m.awayScore}` : "–"}
            </span>
            <span className="flex justify-start">{club(m.awayId)}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
