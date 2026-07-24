import { useApp } from "../../app/AppProviders";
import { useCareer } from "../../app/CareerProvider";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Meter } from "../../components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { useFormat } from "../../lib/format";
import { cn } from "../../lib/utils";

export function Finances() {
  const { t } = useApp();
  const { career } = useCareer();
  const fmt = useFormat();
  if (!career) return null;
  const fin = career.finances();
  if (!fin) return null;

  const squad = career.squad();
  const wageBill = squad.reduce((n, p) => n + (p.contract?.wage ?? 0), 0);
  const matchday = fin.revenue.matchdayPerHomeGame;
  const tv = fin.revenue.tvPerRound;
  const netHomeRound = matchday + tv - wageBill;
  const wageRatio = fin.wageBudgetPerPeriod > 0 ? wageBill / fin.wageBudgetPerPeriod : 0;
  const earners = [...squad].filter((p) => p.contract).sort((a, b) => (b.contract!.wage - a.contract!.wage)).slice(0, 10);

  const signed = (v: number) => (v >= 0 ? fmt.money(v, { compact: true }) : `−${fmt.money(-v, { compact: true })}`);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.finances}</h1>
        <p className="text-sm text-fg-muted">{t.perRoundHint}</p>
      </div>

      <div className="grid gap-6 sm:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>{t.cash}</CardTitle></CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-semibold tabular-nums", fin.balance < 0 ? "text-danger" : "text-fg")}>{signed(fin.balance)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t.transferBudget}</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums text-fg">{fmt.money(fin.transferBudget, { compact: true })}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t.wageBudget}</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-semibold tabular-nums text-fg">{fmt.money(wageBill, { compact: true })}</span>
              <span className="text-xs text-fg-muted tabular-nums">/ {fmt.money(fin.wageBudgetPerPeriod, { compact: true })}</span>
            </div>
            <Meter value={wageRatio <= 1 ? (1 - wageRatio) * 100 : 0} tone="auto" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>{t.revenueCosts}</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <Line label={t.matchdayIncome} value={fmt.money(matchday, { compact: true })} tone="pos" />
          <Line label={t.tvIncome} value={fmt.money(tv, { compact: true })} tone="pos" />
          <Line label={t.wageBill} value={`−${fmt.money(wageBill, { compact: true })}`} tone="neg" />
          <div className="mt-1 flex items-center justify-between border-t border-hairline pt-2 font-semibold">
            <span>{t.netPerRound}</span>
            <span className={cn("tabular-nums", netHomeRound < 0 ? "text-danger" : "text-[var(--pos-mid)]")}>{signed(netHomeRound)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t.topEarners}</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.player}</TableHead>
                <TableHead className="text-right">{t.wage}</TableHead>
                <TableHead className="w-24 text-right">{t.ofWageBill}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {earners.map((p) => (
                <TableRow key={p.playerId}>
                  <TableCell className="font-medium text-fg">{p.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt.money(p.contract!.wage, { compact: true })}</TableCell>
                  <TableCell className="text-right tabular-nums text-fg-muted">{wageBill > 0 ? Math.round((p.contract!.wage / wageBill) * 100) : 0}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Line({ label, value, tone }: { label: string; value: string; tone: "pos" | "neg" }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-fg-muted">{label}</span>
      <span className={cn("tabular-nums", tone === "neg" ? "text-danger" : "text-[var(--pos-mid)]")}>{value}</span>
    </div>
  );
}
