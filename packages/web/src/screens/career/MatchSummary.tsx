import type { ClubKit } from "@fut/competition";
import { getCatalog } from "@fut/i18n";
import { Star } from "lucide-react";
import { useApp } from "../../app/AppProviders";
import { useCareer } from "../../app/CareerProvider";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Crest } from "../../components/ui/crest";
import { TeamShirt } from "../../components/ui/team-shirt";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { LiveStats } from "../../components/match/LiveMatchView";
import type { SpatialReport } from "../../hooks/useSpatialMatch";
import { shortPlayerName } from "../../lib/names";
import { cn } from "../../lib/utils";
import type { ScreenId } from "../../layout/Shell";

/**
 * Broadcast-style full-time report: the scoreline with scorers, man of the
 * match, the match stats, the rest of the round and the table as it now stands.
 */
export function MatchSummary({
  report,
  round,
  kits,
  onNavigate,
}: {
  report: SpatialReport;
  round: number;
  kits: { home: ClubKit; away: ClubKit };
  onNavigate: (s: ScreenId, param?: string) => void;
}) {
  const { t, locale } = useApp();
  const { career } = useCareer();
  if (!career) return null;
  const cat = getCatalog(locale);
  const summary = career.matchSummary(round, report.homeTeamId, report.awayTeamId);
  const table = career.table("league");
  const managed = career.managedClubId;
  const nick = (id: string) => career.clubNickname(id);

  return (
    <div className="flex flex-col gap-6">
      {/* Scoreline */}
      <Card className="relative overflow-hidden">
        <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-[var(--brand-emerald)] to-[var(--brand-lime)]" />
        <CardContent className="flex flex-col items-center gap-3 py-6">
          <Badge variant="gold">{t.fullTime}</Badge>
          {/* Each side's goals sit UNDER that side's name, earliest first — a
              scoreline reads as two columns, not as one mixed list you have to
              decode by club abbreviation. */}
          <div className="grid w-full max-w-2xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-x-5">
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-3">
                <TeamShirt kit={kits.home} size={34} />
                <Crest src={career.clubCrest(report.homeTeamId)} code={career.clubShort(report.homeTeamId)} size={34} />
                <span className="serif text-lg font-semibold">{nick(report.homeTeamId)}</span>
              </div>
              <ScorerList goals={summary?.scorers} teamId={report.homeTeamId} align="right" />
            </div>
            <span className="serif text-4xl font-bold tabular-nums">{report.homeScore} : {report.awayScore}</span>
            <div className="flex flex-col items-start gap-2">
              <div className="flex items-center gap-3">
                <span className="serif text-lg font-semibold">{nick(report.awayTeamId)}</span>
                <Crest src={career.clubCrest(report.awayTeamId)} code={career.clubShort(report.awayTeamId)} size={34} />
                <TeamShirt kit={kits.away} size={34} />
              </div>
              <ScorerList goals={summary?.scorers} teamId={report.awayTeamId} align="left" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        {/* Man of the match + stats */}
        <div className="flex flex-col gap-6">
          {summary?.motm && (
            <Card>
              <CardHeader><CardTitle>{t.manOfTheMatch}</CardTitle></CardHeader>
              <CardContent>
                <button
                  className="flex w-full items-center gap-3 rounded-md px-1 py-1 text-left hover:bg-surface-2"
                  onClick={() => onNavigate("player", summary.motm!.playerId)}
                >
                  <TeamShirt kit={summary.motm.teamId === report.homeTeamId ? kits.home : kits.away} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-fg">{shortPlayerName(summary.motm.name)}</div>
                    <div className="text-xs text-fg-muted">
                      {career.clubShort(summary.motm.teamId)}
                      {summary.motm.goals > 0 && ` · ${summary.motm.goals} ${t.goalsScored}`}
                    </div>
                  </div>
                  <span className="flex items-center gap-1 text-sm font-bold tabular-nums text-gold">
                    <Star className="size-4 fill-gold text-gold" />
                    {summary.motm.rating.toFixed(1)}
                  </span>
                </button>
              </CardContent>
            </Card>
          )}
          <LiveStats stats={report.stats} cat={cat} />
        </div>

        {/* Rest of the round */}
        <Card>
          <CardHeader><CardTitle>{t.otherResults}</CardTitle></CardHeader>
          <CardContent className="flex max-h-[26rem] flex-col gap-1 overflow-y-auto text-sm">
            {!summary || summary.otherResults.length === 0 ? (
              <p className="py-4 text-center text-fg-muted">—</p>
            ) : (
              summary.otherResults.map((r, i) => (
                <div key={i} className="flex items-center gap-2 border-b border-hairline py-1.5 last:border-0">
                  <Crest src={career.clubCrest(r.homeId)} code={career.clubShort(r.homeId)} size={16} />
                  <span className="flex-1 truncate">{nick(r.homeId)}</span>
                  <span className="font-semibold tabular-nums">{r.homeScore}–{r.awayScore}</span>
                  <span className="flex-1 truncate text-right">{nick(r.awayId)}</span>
                  <Crest src={career.clubCrest(r.awayId)} code={career.clubShort(r.awayId)} size={16} />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Table as it stands */}
        <Card className="flex max-h-[26rem] flex-col">
          <CardHeader><CardTitle>{t.standings}</CardTitle></CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>{t.club}</TableHead>
                  <TableHead className="text-right">{t.points}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {table.map((r, i) => (
                  <TableRow key={r.teamId} data-active={r.teamId === managed}>
                    <TableCell className="tabular-nums text-fg-faint">{i + 1}</TableCell>
                    <TableCell>
                      <button className={cn("flex items-center gap-2 hover:text-primary", r.teamId === managed && "font-semibold")} onClick={() => onNavigate("club", r.teamId)}>
                        <Crest src={career.clubCrest(r.teamId)} code={career.clubShort(r.teamId)} size={16} />
                        {nick(r.teamId)}
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

      <div className="flex justify-center">
        <Button variant="primary" onClick={() => onNavigate("home")}>{t.continue}</Button>
      </div>
    </div>
  );
}

/** One goal as the summary needs it. */
export interface ScoredGoal {
  readonly name: string;
  readonly teamId: string;
  readonly assistName?: string;
  readonly minute?: number;
  readonly penalty?: boolean;
}

/**
 * One side's goals, EARLIEST FIRST. Sorted here rather than trusting the stored
 * order, and a goal with no recorded minute (a career saved before minutes were
 * kept) sinks to the bottom instead of jumping the list.
 */
export function goalsFor(goals: readonly ScoredGoal[] | undefined, teamId: string): ScoredGoal[] {
  return (goals ?? [])
    .filter((g) => g.teamId === teamId)
    .slice()
    .sort((a, b) => (a.minute ?? Number.POSITIVE_INFINITY) - (b.minute ?? Number.POSITIVE_INFINITY));
}

/**
 * One side's goals, earliest minute first: scorer, the minute, an assist in
 * brackets and a note when it came from the spot. Sorted here rather than
 * relying on the stored order, because a goal without a recorded minute (an old
 * save) must not jump the list — it sinks to the bottom instead.
 */
function ScorerList({
  goals,
  teamId,
  align,
}: {
  goals?: readonly ScoredGoal[];
  teamId: string;
  align: "left" | "right";
}) {
  const mine = goalsFor(goals, teamId);
  if (mine.length === 0) return null;
  return (
    <ul className={cn("flex flex-col gap-0.5 text-xs text-fg-muted", align === "right" ? "items-end text-right" : "items-start text-left")}>
      {mine.map((g, i) => (
        <li key={i}>
          <span className="font-medium text-fg">{shortPlayerName(g.name)}</span>
          {g.minute !== undefined && <span className="tabular-nums text-fg-muted"> {g.minute}'</span>}
          {g.penalty && <span className="text-fg-faint"> (P)</span>}
          {g.assistName && <span className="text-fg-faint"> · {shortPlayerName(g.assistName)}</span>}
        </li>
      ))}
    </ul>
  );
}
