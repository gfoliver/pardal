import { useApp } from "../../app/AppProviders";
import { useCareer } from "../../app/CareerProvider";
import { Alert } from "../../components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Meter } from "../../components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { useFormat } from "../../lib/format";
import { cn } from "../../lib/utils";
import { MONTHS_PER_SEASON } from "@fut/career";

/**
 * The season's money, in one place.
 *
 * What this screen used to show, and why none of it belonged: a cash balance fed by
 * matchday and TV income that nothing downstream reacted to; a wage budget with a meter
 * that no rule enforced; and a "net per round" that the simulation never computed. Three
 * numbers whose only purpose was to be looked at.
 *
 * Now there is ONE pot per season and everything on the page is either that pot or a
 * component of it, so every figure answers a question the manager can act on: what have I
 * got, what is already promised, and what can I still do with the rest.
 */
export function Finances() {
  const { t } = useApp();
  const { career } = useCareer();
  const fmt = useFormat();
  if (!career) return null;
  const fin = career.finances();
  if (!fin) return null;

  const squad = career.squad();
  const earners = [...squad].filter((p) => p.contract).sort((a, b) => b.contract!.wage - a.contract!.wage).slice(0, 10);
  // What is actually spendable right now — the pot, minus the bids already on the table.
  const spendable = career.transferBudget;
  const promised = Math.max(0, fin.available - spendable);
  const usedRatio = fin.annualBudget > 0 ? Math.min(1, fin.committed / fin.annualBudget) : 0;
  const over = fin.available < 0;
  const outgoing = (v: number) => (v > 0 ? `−${fmt.money(v, { compact: true })}` : fmt.money(0, { compact: true }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.finances}</h1>
        <p className="text-sm text-fg-muted">{t.budgetHint}</p>
      </div>

      {/* The pot, and how much of it is already gone. */}
      <Card>
        <CardHeader><CardTitle>{t.annualBudget}</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-3xl font-semibold tabular-nums text-fg">{fmt.money(fin.annualBudget, { compact: true })}</span>
            <span className={cn("text-sm tabular-nums", over ? "text-danger" : "text-fg-muted")}>
              {fmt.t(t.committedOf, { committed: fmt.money(fin.committed, { compact: true }) })}
            </span>
          </div>
          {/*
            The bar fills with what is COMMITTED, matching the figure printed beside it.
            It used to be fed `(1 - usedRatio) * 100` with `tone="auto"`, so a club that had spent
            80% of its budget showed a nearly-empty bar in red — the fill measured headroom while the
            label measured commitment, and `auto` reads a low bar as bad. Same money, opposite
            direction. Filling as you spend is the reading people bring to a bar under that label,
            and the tone is stated rather than inferred because here MORE is worse.
          */}
          <Meter value={usedRatio * 100} tone={over ? "bad" : usedRatio >= 0.85 ? "warn" : "good"} />
          {/* `warn`, not `danger`: being over budget is a standing condition the manager is living with,
              not an error that just happened, so it is announced politely rather than interrupting a
              screen he is reading. It carried no `role` at all before — a warning nobody hears. */}
          {over && <Alert tone="warn" className="text-xs">{t.overBudget}</Alert>}
        </CardContent>
      </Card>

      {/* The two things the pot can be spent on. */}
      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t.availableForTransfers}</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-1">
            <div className={cn("text-2xl font-semibold tabular-nums", spendable > 0 ? "text-fg" : "text-fg-faint")}>
              {fmt.money(spendable, { compact: true })}
            </div>
            {/* Money out in bids is neither spent nor available, and hiding it is how a
                manager ends up having accidentally bought four players. */}
            {promised > 0 && (
              <p className="text-xs text-fg-faint">{fmt.t(t.promisedInBids, { fee: fmt.money(promised, { compact: true }) })}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t.availableForWages} · {t.perMonth}</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-1">
            <div className={cn("text-2xl font-semibold tabular-nums", fin.wageRoomPerMonth > 0 ? "text-fg" : "text-fg-faint")}>
              {fmt.money(Math.max(0, fin.wageRoomPerMonth), { compact: true })}
            </div>
            {/* The same money as the card on the left, in the unit a contract is written
                in. Saying so stops it reading as a second, separate allowance. */}
            <p className="text-xs text-fg-faint">{t.wageRoomHint}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>{t.financialSummary}</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <Line label={t.annualBudget} value={fmt.money(fin.annualBudget, { compact: true })} />
          <Line label={t.salesIncome} value={fmt.money(fin.feesReceived, { compact: true })} tone={fin.feesReceived > 0 ? "pos" : undefined} />
          <Line label={t.wageBill} value={fmt.money(fin.monthlyWageBill, { compact: true })} note={t.perMonth} />
          <Line
            label={t.payrollForSeason}
            value={outgoing(fin.payroll)}
            tone="neg"
            note={fmt.t(t.monthsOfWages, { n: MONTHS_PER_SEASON })}
          />
          {/* No sign on a zero: "−R$ 0" reads like a mistake. */}
          <Line label={t.feesSpent} value={outgoing(fin.feesPaid)} tone={fin.feesPaid > 0 ? "neg" : undefined} />
          <div className="mt-1 flex items-center justify-between border-t border-hairline pt-2 font-semibold">
            <span>{t.remaining}</span>
            <span className={cn("tabular-nums", over ? "text-danger" : "text-[var(--pos-mid)]")}>
              {over ? `−${fmt.money(-fin.available, { compact: true })}` : fmt.money(fin.available, { compact: true })}
            </span>
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
                  <TableCell className="text-right tabular-nums text-fg-muted">
                    {fin.monthlyWageBill > 0 ? Math.round((p.contract!.wage / fin.monthlyWageBill) * 100) : 0}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Line({ label, value, tone, note }: { label: string; value: string; tone?: "pos" | "neg"; note?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-fg-muted">
        {label}
        {note && <span className="ml-1 text-xs text-fg-faint">· {note}</span>}
      </span>
      <span className={cn("shrink-0 tabular-nums", tone === "neg" ? "text-danger" : tone === "pos" ? "text-[var(--pos-mid)]" : "text-fg")}>{value}</span>
    </div>
  );
}
