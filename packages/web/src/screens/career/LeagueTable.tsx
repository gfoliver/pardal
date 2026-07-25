import { useApp } from "../../app/AppProviders";
import { useCareer } from "../../app/CareerProvider";
import { Card, CardContent } from "../../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Crest } from "../../components/ui/crest";
import { getDataset } from "../../lib/career/dataset";
import type { ScreenId } from "../../layout/Shell";

export function LeagueTable({ onNavigate }: { onNavigate: (s: ScreenId, param?: string) => void }) {
  const { t } = useApp();
  const { career } = useCareer();
  if (!career) return null;
  const snap = career.snapshot();
  const table = career.table("league");
  const logo = getDataset(snap.datasetId).logo();
  const leagueName = snap.structure.divisions[0]?.name ?? t.league;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
        {logo && <Crest src={logo} size={32} />}
        {leagueName}
      </h1>
      <Card>
        <CardContent className="py-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>{t.player}</TableHead>
                <TableHead className="text-center">P</TableHead>
                <TableHead className="text-center">{t.won}</TableHead>
                <TableHead className="text-center">{t.drawn}</TableHead>
                <TableHead className="text-center">{t.lost}</TableHead>
                <TableHead className="text-center">{t.goalsFor}</TableHead>
                <TableHead className="text-center">{t.goalsAgainst}</TableHead>
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
                  <TableCell className="text-right font-semibold tabular-nums">{row.points}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
