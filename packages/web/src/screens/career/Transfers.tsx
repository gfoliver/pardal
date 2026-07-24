import { useState } from "react";
import { toast } from "sonner";
import { useApp } from "../../app/AppProviders";
import { useCareer } from "../../app/CareerProvider";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { DataTable, type Column } from "../../components/ui/data-table";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { NumberInput } from "../../components/ui/number-input";
import { Label } from "../../components/ui/input";
import { Meter } from "../../components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Overall } from "../../components/ui/game";
import { useFormat } from "../../lib/format";
import type { TransferTarget } from "@fut/career";

const POS: Record<string, string> = { goalkeeper: "GK", centreBack: "CB", fullBack: "FB", wingBack: "WB", defensiveMidfielder: "DM", centralMidfielder: "CM", attackingMidfielder: "AM", winger: "WG", striker: "ST" };

export function Transfers() {
  const { t } = useApp();
  const { career, makeBid, respondOffer } = useCareer();
  const fmt = useFormat();
  const [bidFor, setBidFor] = useState<TransferTarget | null>(null);
  const [fee, setFee] = useState(0);
  if (!career) return null;

  const targets = career.transferTargets();
  const offers = career.pendingOffers();
  const budget = career.transferBudget;

  const openBid = (target: TransferTarget) => { setBidFor(target); setFee(target.value); };
  const submitBid = () => {
    if (!bidFor) return;
    const r = makeBid(bidFor.playerId, fee);
    toast(r.accepted ? `${bidFor.name} signed!` : `Bid for ${bidFor.name} rejected.`);
    setBidFor(null);
  };

  const columns: Column<TransferTarget>[] = [
    { key: "name", header: t.player, cell: (r) => <span className="font-medium text-fg">{r.name}</span>, sortValue: (r) => r.name },
    { key: "club", header: "Club", cell: (r) => r.clubShort, sortValue: (r) => r.clubShort },
    { key: "pos", header: t.position, cell: (r) => <Badge variant="muted">{POS[r.position] ?? r.position}</Badge>, sortValue: (r) => r.position },
    { key: "age", header: t.age, align: "center", cell: (r) => r.age, sortValue: (r) => r.age },
    { key: "ovr", header: t.overall, align: "center", cell: (r) => <Overall value={r.overall} />, sortValue: (r) => r.overall },
    { key: "value", header: "Value", align: "right", cell: (r) => fmt.money(r.value, { compact: true }), sortValue: (r) => r.value },
    { key: "bid", header: "", align: "right", cell: (r) => <Button size="sm" variant="secondary" onClick={() => openBid(r)}>Bid</Button> },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t.transfers}</h1>
          <p className="text-sm text-fg-muted">{t.balance}: {fmt.money(budget, { compact: true })}</p>
        </div>
      </div>

      <Tabs defaultValue="market">
        <TabsList>
          <TabsTrigger value="market">{t.transfers}</TabsTrigger>
          <TabsTrigger value="offers">Offers{offers.length > 0 ? ` (${offers.length})` : ""}</TabsTrigger>
        </TabsList>

        <TabsContent value="market">
          <Card><CardContent className="py-3">
            <DataTable columns={columns} rows={targets} getRowId={(r) => r.playerId} initialSort={{ key: "ovr", dir: "desc" }} filterText={(r) => `${r.name} ${r.clubShort} ${r.position}`} searchPlaceholder={`${t.player}…`} />
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="offers">
          <Card><CardContent className="flex flex-col gap-2 py-4">
            {offers.length === 0 ? (
              <p className="py-6 text-center text-sm text-fg-muted">{t.noMessages}</p>
            ) : (
              offers.map((o) => (
                <div key={o.id} className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm">
                  <span className="flex-1"><span className="font-medium text-fg">{o.playerName}</span> — {o.fromClubName}</span>
                  <span className="font-semibold tabular-nums">{fmt.money(o.fee, { compact: true })}</span>
                  <Button size="sm" variant="primary" onClick={() => respondOffer(o.id, true)}>Accept</Button>
                  <Button size="sm" variant="ghost" onClick={() => respondOffer(o.id, false)}>Reject</Button>
                </div>
              ))
            )}
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      <Dialog open={bidFor !== null} onOpenChange={(o) => !o && setBidFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Bid for {bidFor?.name}</DialogTitle></DialogHeader>
          <DialogBody className="flex flex-col gap-3">
            <div className="text-xs text-fg-muted">Value {bidFor && fmt.money(bidFor.value, { compact: true })} · {t.balance} {fmt.money(budget, { compact: true })}</div>
            <div className="flex flex-col gap-1.5">
              <Label>Fee</Label>
              <NumberInput value={fee} onValue={setFee} min={0} step={100000} />
              <Meter value={fee} max={Math.max(budget, fee)} tone={fee > budget ? "bad" : "neutral"} />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBidFor(null)}>Cancel</Button>
            <Button variant="primary" disabled={fee > budget} onClick={submitBid}>Submit bid</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
