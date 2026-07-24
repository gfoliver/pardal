import { useApp } from "../../app/AppProviders";
import { useCareer } from "../../app/CareerProvider";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Meter } from "../../components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { useFormat } from "../../lib/format";
import { inboxLine } from "./inbox-format";
import type { ScreenId } from "../../layout/Shell";

export function Home({ onNavigate }: { onNavigate: (s: ScreenId) => void }) {
  const { t } = useApp();
  const { career, advance, simulateSeason, playUserFixture, rolloverSeason } = useCareer();
  const fmt = useFormat();
  if (!career) return null;

  const snap = career.snapshot();
  const managed = snap.managedClubId;
  const club = snap.clubs[managed]!;
  const table = career.table("league");
  const myIdx = table.findIndex((r) => r.teamId === managed);
  const slice = myIdx < 0 ? table.slice(0, 5) : table.slice(Math.max(0, myIdx - 2), myIdx + 3);
  const next = career.nextUserFixture();
  const inbox = [...snap.inbox].slice(-3).reverse();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{club.name}</h1>
        <p className="text-sm text-fg-muted">{fmt.seasonDate(snap.currentDate)}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Next match + controls */}
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle>{t.nextMatch}</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4">
            {next ? (
              <div className="flex items-center justify-center gap-3 py-2 text-lg font-semibold">
                <span>{snap.clubs[next.fixture.homeTeamId]?.shortName}</span>
                <span className="text-fg-faint">vs</span>
                <span>{snap.clubs[next.fixture.awayTeamId]?.shortName}</span>
              </div>
            ) : (
              <p className="py-2 text-center text-sm text-fg-muted">{t.seasonComplete}</p>
            )}
            <div className="flex gap-2">
              <Button variant="primary" className="flex-1" onClick={() => { playUserFixture(); onNavigate("match"); }} disabled={!next}>{t.play}</Button>
              <Button variant="secondary" className="flex-1" onClick={advance} disabled={!next}>{t.advance}</Button>
            </div>
            <Button variant="ghost" onClick={simulateSeason} disabled={!next}>{t.simulateSeason}</Button>
            {!next && (
              <Button variant="ghost" onClick={rolloverSeason}>{t.seasonComplete} →</Button>
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
            <div className="flex justify-between border-t border-hairline pt-2"><span className="text-fg-muted">{t.balance}</span><span className="font-semibold tabular-nums">{fmt.money(club.finance.balance, { compact: true })}</span></div>
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
                  <span className={m.read ? "text-fg-muted" : "text-fg"}>{inboxLine(m, snap)}</span>
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
                <TableHead>{t.player}</TableHead>
                <TableHead className="text-right">{t.points}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {slice.map((row) => {
                const pos = table.indexOf(row) + 1;
                return (
                  <TableRow key={row.teamId} data-active={row.teamId === managed}>
                    <TableCell className="tabular-nums text-fg-faint">{pos}</TableCell>
                    <TableCell>{snap.clubs[row.teamId]?.name ?? row.teamId}</TableCell>
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
