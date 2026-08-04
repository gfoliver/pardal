import { useState } from "react";
import { useApp } from "../../app/AppProviders";
import { useCareer, type QuickSimResult } from "../../app/CareerProvider";
import { QuickSimResultDialog } from "../../components/career/QuickSimResult";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Meter } from "../../components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Crest } from "../../components/ui/crest";
import { useFormat } from "../../lib/format";
import { cn } from "../../lib/utils";
import { renderInbox } from "./inbox-format";
import { InboxMessageType } from "@fut/career";
import type { ScreenId } from "../../layout/Shell";

export function Home({ onNavigate }: { onNavigate: (s: ScreenId) => void }) {
  const { t, locale } = useApp();
  const { career, continueTime, stopTime, advancing, advance, playUserFixture, rolloverSeason } = useCareer();
  const fmt = useFormat();
  // Quick-simming our own fixture used to resolve it in silence; hold the result
  // so it can be reported before the manager moves on.
  const [simmed, setSimmed] = useState<QuickSimResult | null>(null);
  if (!career) return null;

  const snap = career.snapshot();
  const managed = snap.managedClubId;
  const club = snap.clubs[managed]!;
  const table = career.table("league");
  const myIdx = table.findIndex((r) => r.teamId === managed);
  const slice = myIdx < 0 ? table.slice(0, 5) : table.slice(Math.max(0, myIdx - 2), myIdx + 3);
  const next = career.nextUserFixture();
  const stop = career.peekNextStop();
  const daysToNext = next ? Math.max(0, next.fixture.day - snap.currentDate.dayOfSeason) : 0;
  const inbox = snap.inbox.filter((m) => m.type !== InboxMessageType.MatchResult).slice(-3).reverse();

  return (
    <div className="flex flex-col gap-6">
      <QuickSimResultDialog result={simmed} onClose={() => setSimmed(null)} />
      <div className="flex items-center gap-3">
        <Crest src={career.clubCrest(managed)} code={club.shortName} size={44} className="rounded-md" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{club.name}</h1>
          <p className="text-sm text-fg-muted">{fmt.civil(career.civilDate(), { long: true })}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Next match + controls */}
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle>{t.nextMatch}</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4">
            {next ? (
              <div className="flex flex-col items-center gap-0.5 py-2">
                <div className="flex items-center gap-3 text-lg font-semibold">
                  <span>{snap.clubs[next.fixture.homeTeamId]?.shortName}</span>
                  <span className="text-fg-faint">vs</span>
                  <span>{snap.clubs[next.fixture.awayTeamId]?.shortName}</span>
                </div>
                {/* When, and how far off — otherwise watching the days tick by
                    tells you nothing about how many are left. */}
                <span className="text-xs text-fg-muted">
                  {fmt.civil(career.civilDate({ season: snap.currentDate.season, dayOfSeason: next.fixture.day }))}
                  {daysToNext > 0 && <span className="text-fg-faint"> · {fmt.t(t.daysLeft, { n: daysToNext })}</span>}
                </span>
              </div>
            ) : (
              <p className="py-2 text-center text-sm text-fg-muted">{t.seasonComplete}</p>
            )}
            {career.pendingOffers().length > 0 && (
              <Button variant="secondary" onClick={() => onNavigate("transfers")}>{t.transfers} ({career.pendingOffers().length})</Button>
            )}
            {stop === "userMatch" && (
              <>
                <Button variant="primary" onClick={() => { playUserFixture(); onNavigate("match"); }}>{t.play}</Button>
                {/* Quick-sim: resolve this match day instantly, no watch
                    screen — but still report the score. */}
                <Button variant="ghost" onClick={() => setSimmed(advance())}>{t.quickSim}</Button>
              </>
            )}
            {stop === "ai" && (
              advancing ? (
                <Button variant="secondary" onClick={stopTime}>⏸ {fmt.civil(career.civilDate())}</Button>
              ) : (
                <Button variant="primary" onClick={continueTime}>{t.advance}</Button>
              )
            )}
            {stop === "seasonEnd" && (
              <Button variant="primary" onClick={rolloverSeason}>{t.seasonComplete} →</Button>
            )}
          </CardContent>
        </Card>

        {/* Board + finances */}
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle>{t.objective}</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="flex justify-between"><span className="text-fg-muted">{t.leaguePosition}</span><span className="font-semibold tabular-nums">≤ {club.objectives.leaguePositionTarget}º</span></div>
            <div>
              <div className="mb-1 flex justify-between text-xs text-fg-muted"><span>{t.confidence}</span><span className="tabular-nums">{club.objectives.confidence}</span></div>
              <Meter value={club.objectives.confidence} tone="auto" />
            </div>
            {/* What is still spendable, not the headline allocation — on the dashboard the
                useful number is the one that answers "can I sign anybody". */}
            <div className="flex justify-between border-t border-hairline pt-2"><span className="text-fg-muted">{t.availableForTransfers}</span><span className="font-semibold tabular-nums">{fmt.money(career.transferBudget, { compact: true })}</span></div>
          </CardContent>
        </Card>

        {/* Inbox preview */}
        <Card className="lg:col-span-1">
          <CardHeader action={<Button size="sm" variant="ghost" onClick={() => onNavigate("inbox")}>{t.viewAll}</Button>}>
            <CardTitle>{t.inbox}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {inbox.length === 0 ? (
              <p className="text-fg-muted">{t.noMessages}</p>
            ) : (
              inbox.map((m) => (
                <div key={m.id} className="flex items-center gap-2">
                  {!m.read && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
                  <span className={cn("truncate", m.read ? "text-fg-muted" : "text-fg")}>{renderInbox(m, career, locale).subject}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Standings snippet */}
      <Card>
        <CardHeader action={<Button size="sm" variant="ghost" onClick={() => onNavigate("league")}>{t.viewAll}</Button>}>
          <CardTitle>{t.standings}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>{t.club}</TableHead>
                <TableHead className="text-right">{t.points}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {slice.map((row) => {
                const pos = table.indexOf(row) + 1;
                return (
                  <TableRow key={row.teamId} data-active={row.teamId === managed}>
                    <TableCell className="tabular-nums text-fg-faint">{pos}</TableCell>
                    <TableCell><span className="flex items-center gap-2"><Crest src={career.clubCrest(row.teamId)} code={snap.clubs[row.teamId]?.shortName} size={16} />{career.clubNickname(row.teamId)}</span></TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{row.points}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
