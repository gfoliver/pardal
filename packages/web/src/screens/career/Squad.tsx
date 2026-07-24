import { useState } from "react";
import { useApp } from "../../app/AppProviders";
import { useCareer } from "../../app/CareerProvider";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { DataTable, type Column } from "../../components/ui/data-table";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { NumberInput } from "../../components/ui/number-input";
import { MoneyInput } from "../../components/ui/money-input";
import { Label } from "../../components/ui/input";
import { Overall } from "../../components/ui/game";
import { useFormat } from "../../lib/format";
import type { SquadEntry } from "@fut/career";

const POS: Record<string, string> = {
  goalkeeper: "GK", centreBack: "CB", fullBack: "FB", wingBack: "WB",
  defensiveMidfielder: "DM", centralMidfielder: "CM", attackingMidfielder: "AM",
  winger: "WG", striker: "ST",
};

export function Squad() {
  const { t } = useApp();
  const { career, renewContract } = useCareer();
  const fmt = useFormat();
  const [renew, setRenew] = useState<SquadEntry | null>(null);
  const [wage, setWage] = useState(0);
  const [years, setYears] = useState(3);
  if (!career) return null;
  const rows = career.squad();

  const openRenew = (p: SquadEntry) => { setRenew(p); setWage(p.contract?.wage ?? 0); setYears(3); };
  const submitRenew = () => { if (renew) renewContract(renew.playerId, wage, years); setRenew(null); };

  const columns: Column<SquadEntry>[] = [
    { key: "name", header: t.player, cell: (r) => <span className="font-medium text-fg">{r.name}</span>, sortValue: (r) => r.name },
    { key: "pos", header: t.position, cell: (r) => <Badge variant="muted">{POS[r.position] ?? r.position}</Badge>, sortValue: (r) => r.position },
    { key: "age", header: t.age, align: "center", cell: (r) => r.age, sortValue: (r) => r.age },
    { key: "ovr", header: t.overall, align: "center", cell: (r) => <Overall value={r.overall} />, sortValue: (r) => r.overall },
    {
      key: "status",
      header: t.role,
      cell: (r) =>
        r.injured ? (
          <Badge variant="gold">{t.out}</Badge>
        ) : (
          <span className="text-xs uppercase text-fg-faint">{r.contract?.squadStatus ?? "—"}</span>
        ),
      sortValue: (r) => (r.injured ? 0 : 1),
    },
    { key: "wage", header: t.wage, align: "right", cell: (r) => (r.contract ? fmt.money(r.contract.wage, { compact: true }) : "—"), sortValue: (r) => r.contract?.wage ?? 0 },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.squadTitle}</h1>
        <p className="text-sm text-fg-muted">{rows.length} {t.player.toLowerCase()}s</p>
      </div>
      <Card>
        <CardContent className="py-3">
          <DataTable
            columns={columns}
            rows={rows}
            getRowId={(r) => r.playerId}
            onRowClick={openRenew}
            initialSort={{ key: "ovr", dir: "desc" }}
            filterText={(r) => `${r.name} ${r.position}`}
            searchPlaceholder={`${t.player}…`}
          />
        </CardContent>
      </Card>

      <Dialog open={renew !== null} onOpenChange={(o) => !o && setRenew(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{renew?.name}</DialogTitle></DialogHeader>
          <DialogBody className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>{t.wagePerWeek}</Label>
              <MoneyInput value={wage} onValue={setWage} step={5000} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t.years}</Label>
              <NumberInput value={years} onValue={setYears} min={1} max={5} step={1} />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenew(null)}>{t.cancel}</Button>
            <Button variant="primary" onClick={submitRenew}>{t.renewContract}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
