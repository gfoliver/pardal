import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "../../app/AppProviders";
import { useCareer } from "../../app/CareerProvider";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { DataTable, type Column } from "../../components/ui/data-table";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { MoneyInput } from "../../components/ui/money-input";
import { NumberInput } from "../../components/ui/number-input";
import { Label } from "../../components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Overall } from "../../components/ui/game";
import { useFormat } from "../../lib/format";
import type { ScreenId } from "../../layout/Shell";
import { OfferStatus, type TransferTarget } from "@fut/career";

const POS: Record<string, string> = { goalkeeper: "GK", centreBack: "CB", fullBack: "FB", wingBack: "WB", defensiveMidfielder: "DM", centralMidfielder: "CM", attackingMidfielder: "AM", winger: "WG", striker: "ST" };

export function Transfers({ onNavigate }: { onNavigate: (s: ScreenId, param?: string) => void }) {
  const { t } = useApp();
  const { career, makeOffer, removeTarget, respondOffer, agreeTerms } = useCareer();
  const fmt = useFormat();
  const OFFER_LABEL: Record<OfferStatus, string> = { [OfferStatus.Pending]: t.statusPending, [OfferStatus.Accepted]: t.statusAccepted, [OfferStatus.Rejected]: t.statusRejected, [OfferStatus.Completed]: t.statusSigned, [OfferStatus.Withdrawn]: t.statusWithdrawn };
  const [offerFor, setOfferFor] = useState<TransferTarget | null>(null);
  const [fee, setFee] = useState(0);
  const [termsFor, setTermsFor] = useState<ReturnType<NonNullable<typeof career>["pendingSignings"]>[number] | null>(null);
  const [wage, setWage] = useState(0);
  const [years, setYears] = useState(4);
  if (!career) return null;

  const shortlist = career.shortlist();
  const myOffers = career.myOffers();
  const received = career.pendingOffers();
  const signings = career.pendingSignings();
  const budget = career.transferBudget;

  const openOffer = (target: TransferTarget) => { setOfferFor(target); setFee(target.value); };
  const submitOffer = () => {
    if (!offerFor) return;
    const ok = makeOffer(offerFor.playerId, fee);
    toast(fmt.t(ok ? t.offerLodged : t.offerFailed, { name: offerFor.name }));
    setOfferFor(null);
  };
  const openTerms = (s: (typeof signings)[number]) => { setTermsFor(s); setWage(s.expectedWage); setYears(4); };
  const submitTerms = () => {
    if (!termsFor) return;
    const r = agreeTerms(termsFor.playerId, wage, years);
    toast(fmt.t(r.signed ? t.playerSigns : t.playerHoldsOut, { name: termsFor.playerName }));
    if (r.signed) setTermsFor(null);
  };

  const targetCols: Column<TransferTarget>[] = [
    { key: "name", header: t.player, cell: (r) => <button className="font-medium text-fg hover:text-primary" onClick={() => onNavigate("player", r.playerId)}>{r.name}</button>, sortValue: (r) => r.name },
    { key: "club", header: t.club, cell: (r) => r.clubShort, sortValue: (r) => r.clubShort },
    { key: "pos", header: t.position, cell: (r) => <Badge variant="muted">{POS[r.position] ?? r.position}</Badge>, sortValue: (r) => r.position },
    { key: "age", header: t.age, align: "center", cell: (r) => r.age, sortValue: (r) => r.age },
    { key: "ovr", header: t.overall, align: "center", cell: (r) => <Overall value={r.overall} />, sortValue: (r) => r.overall },
    { key: "value", header: t.value, align: "right", cell: (r) => fmt.money(r.value, { compact: true }), sortValue: (r) => r.value },
    { key: "act", header: "", align: "right", cell: (r) => (
      <div className="flex justify-end gap-1">
        <Button size="sm" variant="secondary" onClick={() => openOffer(r)}>{t.offerAction}</Button>
        <Button size="icon-sm" variant="ghost" aria-label={t.removeAction} onClick={() => removeTarget(r.playerId)}><X /></Button>
      </div>
    ) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.transfers}</h1>
        <p className="text-sm text-fg-muted">{t.balance}: {fmt.money(budget, { compact: true })}</p>
      </div>

      {signings.length > 0 && (
        <Card className="border-primary">
          <CardContent className="flex flex-col gap-2 py-4">
            <h2 className="text-xs font-bold uppercase tracking-wide text-primary">{t.personalTerms}</h2>
            {signings.map((s) => (
              <div key={s.playerId} className="flex items-center gap-3 text-sm">
                <span className="flex-1"><span className="font-medium text-fg">{s.playerName}</span> — {fmt.t(t.feeAgreedWith, { club: s.fromClubName, fee: fmt.money(s.fee, { compact: true }) })}</span>
                <Button size="sm" variant="primary" onClick={() => openTerms(s)}>{t.agreeTerms}</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="targets">
        <TabsList>
          <TabsTrigger value="targets">{t.targetsTab}{shortlist.length ? ` (${shortlist.length})` : ""}</TabsTrigger>
          <TabsTrigger value="mine">{t.myOffersTab}{myOffers.filter((o) => o.status === OfferStatus.Pending).length ? ` (${myOffers.filter((o) => o.status === OfferStatus.Pending).length})` : ""}</TabsTrigger>
          <TabsTrigger value="received">{t.receivedTab}{received.length ? ` (${received.length})` : ""}</TabsTrigger>
        </TabsList>

        <TabsContent value="targets">
          <Card><CardContent className="py-3">
            {shortlist.length === 0 ? (
              <p className="py-8 text-center text-sm text-fg-muted">{t.emptyTargets}</p>
            ) : (
              <DataTable columns={targetCols} rows={shortlist} getRowId={(r) => r.playerId} initialSort={{ key: "ovr", dir: "desc" }} />
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="mine">
          <Card><CardContent className="flex flex-col gap-2 py-4">
            {myOffers.length === 0 ? (
              <p className="py-6 text-center text-sm text-fg-muted">{t.noOffersMade}</p>
            ) : (
              myOffers.map((o) => (
                <div key={o.id} className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm">
                  <span className="flex-1"><span className="font-medium text-fg">{o.playerName}</span> — {o.toClubName}</span>
                  <span className="tabular-nums text-fg-muted">{fmt.money(o.fee, { compact: true })}</span>
                  <Badge variant={o.status === OfferStatus.Rejected ? "muted" : o.status === OfferStatus.Completed ? "primary" : "gold"}>{OFFER_LABEL[o.status] ?? o.status}</Badge>
                </div>
              ))
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="received">
          <Card><CardContent className="flex flex-col gap-2 py-4">
            {received.length === 0 ? (
              <p className="py-6 text-center text-sm text-fg-muted">{t.noOffersReceived}</p>
            ) : (
              received.map((o) => (
                <div key={o.id} className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm">
                  <span className="flex-1"><span className="font-medium text-fg">{o.playerName}</span> — {o.fromClubName}</span>
                  <span className="font-semibold tabular-nums">{fmt.money(o.fee, { compact: true })}</span>
                  <Button size="sm" variant="primary" onClick={() => respondOffer(o.id, true)}>{t.accept}</Button>
                  <Button size="sm" variant="ghost" onClick={() => respondOffer(o.id, false)}>{t.reject}</Button>
                </div>
              ))
            )}
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      {/* Offer dialog */}
      <Dialog open={offerFor !== null} onOpenChange={(o) => !o && setOfferFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{fmt.t(t.offerFor, { name: offerFor?.name ?? "" })}</DialogTitle></DialogHeader>
          <DialogBody className="flex flex-col gap-3">
            <div className="text-xs text-fg-muted">{fmt.t(t.valueBalance, { value: offerFor ? fmt.money(offerFor.value, { compact: true }) : "", balance: fmt.money(budget, { compact: true }) })}</div>
            <div className="flex flex-col gap-1.5"><Label>{t.fee}</Label><MoneyInput value={fee} onValue={setFee} budget={budget} /></div>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOfferFor(null)}>{t.cancel}</Button>
            <Button variant="primary" disabled={fee > budget} onClick={submitOffer}>{t.lodgeOffer}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Personal terms dialog */}
      <Dialog open={termsFor !== null} onOpenChange={(o) => !o && setTermsFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{fmt.t(t.termsFor, { name: termsFor?.playerName ?? "" })}</DialogTitle></DialogHeader>
          <DialogBody className="flex flex-col gap-3">
            <div className="text-xs text-fg-muted">{fmt.t(t.expectedWageLabel, { wage: termsFor ? fmt.money(termsFor.expectedWage, { compact: true }) : "" })}</div>
            <div className="flex flex-col gap-1.5"><Label>{t.wagePerWeek}</Label><MoneyInput value={wage} onValue={setWage} step={5000} /></div>
            <div className="flex flex-col gap-1.5"><Label>{t.years}</Label><NumberInput value={years} onValue={setYears} min={1} max={5} step={1} /></div>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTermsFor(null)}>{t.cancel}</Button>
            <Button variant="primary" onClick={submitTerms}>{t.offerContract}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
