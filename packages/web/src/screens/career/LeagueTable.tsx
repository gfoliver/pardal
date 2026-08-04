import { useMemo } from "react";
import type { RoundView } from "@fut/career";
import { useApp } from "../../app/AppProviders";
import { useCareer } from "../../app/CareerProvider";
import { Card, CardContent } from "../../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Crest } from "../../components/ui/crest";
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

function Standings({ onNavigate }: { onNavigate: (s: ScreenId, param?: string) => void }) {
  const { t } = useApp();
  const { career } = useCareer();
  if (!career) return null;
  const snap = career.snapshot();
  const table = career.table("league");

  return (
    <Card>
      <CardContent className="py-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">#</TableHead>
              <TableHead>{t.club}</TableHead>
              <TableHead className="text-center">P</TableHead>
              <TableHead className="text-center">{t.won}</TableHead>
              <TableHead className="text-center">{t.drawn}</TableHead>
              <TableHead className="text-center">{t.lost}</TableHead>
              <TableHead className="text-center">{t.goalsFor}</TableHead>
              <TableHead className="text-center">{t.goalsAgainst}</TableHead>
              {/* The table was ordered on goal difference without ever showing it, so two clubs
                  level on points looked arbitrarily ranked. */}
              <TableHead className="text-center">{t.goalDifference}</TableHead>
              <TableHead className="text-right">{t.points}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {table.map((row, i) => (
              <TableRow key={row.teamId} data-active={row.teamId === snap.managedClubId}>
                <TableCell className="tabular-nums text-fg-faint">{i + 1}</TableCell>
                <TableCell className="font-medium"><button className="flex items-center gap-2 hover:text-primary" onClick={() => onNavigate("club", row.teamId)}><Crest src={career.clubCrest(row.teamId)} code={snap.clubs[row.teamId]?.shortName} size={18} />{career.clubNickname(row.teamId)}</button></TableCell>
                <TableCell className="text-center tabular-nums">{row.played}</TableCell>
                <TableCell className="text-center tabular-nums">{row.won}</TableCell>
                <TableCell className="text-center tabular-nums">{row.drawn}</TableCell>
                <TableCell className="text-center tabular-nums">{row.lost}</TableCell>
                <TableCell className="text-center tabular-nums">{row.goalsFor}</TableCell>
                <TableCell className="text-center tabular-nums">{row.goalsAgainst}</TableCell>
                <TableCell className="text-center tabular-nums">{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{row.points}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
