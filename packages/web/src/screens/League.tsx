import { useApp } from "../app/AppProviders";
import { PageHeader } from "../components/ui/page-header";
import { Card } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { DEMO_TABLE } from "../data/demo";

export function League() {
  const { t } = useApp();
  return (
    <>
      <PageHeader kicker={t.league} title="Standings" meta="Round 12 of 38" />

      <Card>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10 text-center">#</TableHead>
              <TableHead>{t.league}</TableHead>
              <TableHead className="text-right">P</TableHead>
              <TableHead className="text-right">{t.won}</TableHead>
              <TableHead className="text-right">{t.drawn}</TableHead>
              <TableHead className="text-right">{t.lost}</TableHead>
              <TableHead className="text-right">{t.goalsFor}</TableHead>
              <TableHead className="text-right">{t.goalsAgainst}</TableHead>
              <TableHead className="text-right">GD</TableHead>
              <TableHead className="text-right">{t.points}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {DEMO_TABLE.map((r) => (
              <TableRow key={r.pos} data-active={r.isYou || undefined}>
                <TableCell className="text-center font-semibold tabular-nums text-fg-faint">{r.pos}</TableCell>
                <TableCell className={r.isYou ? "serif text-base font-semibold" : "font-medium"}>{r.team}</TableCell>
                <TableCell className="text-right tabular-nums text-fg-muted">{r.played}</TableCell>
                <TableCell className="text-right tabular-nums">{r.w}</TableCell>
                <TableCell className="text-right tabular-nums">{r.d}</TableCell>
                <TableCell className="text-right tabular-nums">{r.l}</TableCell>
                <TableCell className="text-right tabular-nums text-fg-muted">{r.gf}</TableCell>
                <TableCell className="text-right tabular-nums text-fg-muted">{r.ga}</TableCell>
                <TableCell className="text-right tabular-nums">{r.gf - r.ga > 0 ? `+${r.gf - r.ga}` : r.gf - r.ga}</TableCell>
                <TableCell className="text-right text-base font-bold tabular-nums">{r.pts}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
