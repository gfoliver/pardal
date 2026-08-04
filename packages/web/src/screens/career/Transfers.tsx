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
import { PlayerPhoto } from "../../components/ui/player-photo";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";
import { EstimateText } from "../../components/career/Estimate";
import { NegotiationThread } from "../../components/career/NegotiationThread";
import { ListPlayerDialog } from "../../components/career/ListPlayerDialog";
import { OfferDialog } from "../../components/career/OfferDialog";
import { useFormat } from "../../lib/format";
import { cn } from "../../lib/utils";
import { groupBadge, useLabels } from "../../lib/labels";
import type { ScreenId } from "../../layout/Shell";
import type { FreeAgentRow, ListedPlayer, NegotiationView, TransferTarget } from "@fut/career";

export function Transfers({ onNavigate }: { onNavigate: (s: ScreenId, param?: string) => void }) {
  const { t } = useApp();
  const { career, removeTarget, respondOffer, agreeTerms, counterOffer, acceptCounter, withdrawOffer, askFor, unlistPlayer, bidForFreeAgent, withdrawFreeAgentBid } = useCareer();
  const fmt = useFormat();
  const { shortPos, posName } = useLabels();
  /** The player we're bidding for — the dialog is shared with every player menu. */
  const [offerFor, setOfferFor] = useState<string | null>(null);
  /** The player whose asking price we're editing, if any. */
  const [listFor, setListFor] = useState<string | null>(null);
  /** The free agent we are putting terms to, if any. */
  const [freeFor, setFreeFor] = useState<FreeAgentRow | null>(null);
  /** Set when we're raising a bid inside an existing conversation. */
  const [counterFor, setCounterFor] = useState<NegotiationView | null>(null);
  const [fee, setFee] = useState(0);
  const [termsFor, setTermsFor] = useState<ReturnType<NonNullable<typeof career>["pendingSignings"]>[number] | null>(null);
  const [wage, setWage] = useState(0);
  const [years, setYears] = useState(4);
  if (!career) return null;

  const freeAgents = career.freeAgents();
  const shortlist = career.shortlist();
  const live = career.myOffers();
  // Fee-agreed deals are drawn by the personal-terms card at the top with the button that
  // finishes them, so they are left out of the thread list rather than shown twice.
  const myOffers = live.filter((o) => o.stage !== "feeAgreed");
  const settled = career.settledOffers();
  const received = career.pendingOffers();
  const signings = career.pendingSignings();
  const listed = career.transferList();
  const budget = career.transferBudget;

  // Start a counter half-way between the two numbers on the table.
  const openCounter = (n: NegotiationView) => {
    setCounterFor(n);
    setFee(Math.round(((n.ourLastFee ?? 0) + (n.theirLastFee ?? 0)) / 2));
  };
  // Asking a price for OUR player: open above their bid, since matching it
  // would just be accepting.
  const openAsk = (n: NegotiationView) => {
    setCounterFor(n);
    setFee(Math.round((n.theirLastFee ?? 0) * 1.3));
  };
  /** A counter has to beat what is already on the table, on either side of it. */
  const counterFloor = counterFor
    ? counterFor.weAreBuying
      ? (counterFor.ourLastFee ?? 0) + 1
      : (counterFor.theirLastFee ?? 0) + 1
    : 0;
  const submitCounter = () => {
    if (!counterFor) return;
    if (counterFor.weAreBuying) counterOffer(counterFor.id, fee);
    else askFor(counterFor.id, fee);
    setCounterFor(null);
  };
  const openTerms = (s: (typeof signings)[number]) => { setTermsFor(s); setWage(s.expectedWage); setYears(4); };
  const submitTerms = () => {
    if (!termsFor) return;
    const r = agreeTerms(termsFor.playerId, wage, years);
    toast(fmt.t(r.signed ? t.playerSigns : t.playerHoldsOut, { name: termsFor.playerName }));
    if (r.signed) setTermsFor(null);
  };

  /**
   * Put our offer to a free agent, or raise it.
   *
   * A refusal is reported rather than swallowed: an offer under his minimum, or one our wage room
   * cannot cover, otherwise looks identical to a bid that simply lost the race.
   */
  const submitFreeAgentBid = () => {
    if (!freeFor) return;
    const r = bidForFreeAgent(freeFor.playerId, wage, years);
    toast(
      r.placed
        ? fmt.t(t.offerPlaced, { name: freeFor.name })
        : r.reason === "cannotAfford"
          ? t.cannotAffordWage
          : fmt.t(t.playerHoldsOut, { name: freeFor.name }),
    );
    if (r.placed) setFreeFor(null);
  };

  const targetCols: Column<TransferTarget>[] = [
    {
      key: "name",
      header: t.player,
      cell: (r) => (
        <button className="flex items-center gap-2 text-left hover:text-primary" onClick={() => onNavigate("player", r.playerId)}>
          <PlayerPhoto src={r.photo} alt={r.name} size={28} />
          <span className="font-medium text-fg">{r.name}</span>
        </button>
      ),
      sortValue: (r) => r.name,
    },
    { key: "club", header: t.club, cell: (r) => r.clubShort, sortValue: (r) => r.clubShort },
    {
      key: "pos",
      header: t.position,
      cell: (r) => <Tooltip><TooltipTrigger asChild><Badge variant={groupBadge(r.position)}>{shortPos(r.position)}</Badge></TooltipTrigger><TooltipContent>{posName(r.position)}</TooltipContent></Tooltip>,
      sortValue: (r) => r.position,
    },
    { key: "age", header: t.age, align: "center", cell: (r) => r.age, sortValue: (r) => r.age },
    {
      key: "ovr",
      header: t.overall,
      align: "center",
      cell: (r) =>
        r.overall !== undefined ? <Overall value={r.overall} />
          : r.overallGrade ? <span className="font-semibold text-fg-muted">{r.overallGrade}</span>
            : <span className="text-fg-faint">?</span>,
      sortValue: (r) => r.overall ?? -1,
    },
    { key: "value", header: t.value, align: "right", cell: (r) => <EstimateText e={r.value} format={(n) => fmt.money(n, { compact: true })} />, sortValue: (r) => r.value?.mid ?? -1 },
    { key: "act", header: "", align: "right", cell: (r) => (
      <div className="flex justify-end gap-1">
        <Button size="sm" variant="secondary" onClick={() => setOfferFor(r.playerId)}>{t.offerAction}</Button>
        <Button size="icon-sm" variant="ghost" aria-label={t.removeAction} onClick={() => removeTarget(r.playerId)}><X /></Button>
      </div>
    ) },
  ];

  const listedCols: Column<ListedPlayer>[] = [
    {
      key: "name",
      header: t.player,
      cell: (r) => (
        <button className="flex items-center gap-2 text-left hover:text-primary" onClick={() => onNavigate("player", r.playerId)}>
          <PlayerPhoto src={r.photo} alt={r.name} size={28} />
          <span className="font-medium text-fg">{r.name}</span>
        </button>
      ),
      sortValue: (r) => r.name,
    },
    {
      key: "pos",
      header: t.position,
      cell: (r) => <Tooltip><TooltipTrigger asChild><Badge variant={groupBadge(r.position)}>{shortPos(r.position)}</Badge></TooltipTrigger><TooltipContent>{posName(r.position)}</TooltipContent></Tooltip>,
      sortValue: (r) => r.position,
    },
    { key: "age", header: t.age, align: "center", cell: (r) => r.age, sortValue: (r) => r.age },
    { key: "ovr", header: t.overall, align: "center", cell: (r) => <Overall value={r.overall} />, sortValue: (r) => r.overall },
    { key: "value", header: t.marketValue, align: "right", cell: (r) => <span className="tabular-nums text-fg-muted">{fmt.money(r.value, { compact: true })}</span>, sortValue: (r) => r.value },
    {
      key: "ask",
      header: t.askingPrice,
      align: "right",
      cell: (r) => <span className="tabular-nums font-semibold">{fmt.money(r.askingPrice, { compact: true })}</span>,
      sortValue: (r) => r.askingPrice,
    },
    {
      key: "since",
      header: "",
      // A listing nobody has bitten on is the useful fact here, so the days on the list
      // and any bid already on the table share one column.
      cell: (r) =>
        r.bid !== undefined ? (
          <span className="text-xs font-semibold text-primary">{fmt.t(t.bidOnTable, { fee: fmt.money(r.bid, { compact: true }) })}</span>
        ) : (
          <span className="text-xs text-fg-faint">{fmt.t(t.listedFor, { n: r.listedDays })}</span>
        ),
      sortValue: (r) => r.listedDays,
    },
    { key: "act", header: "", align: "right", cell: (r) => (
      <div className="flex justify-end gap-1">
        <Button size="sm" variant="secondary" onClick={() => setListFor(r.playerId)}>{t.changeAskingPrice}</Button>
        <Button size="icon-sm" variant="ghost" aria-label={t.unlistPlayer} onClick={() => unlistPlayer(r.playerId)}><X /></Button>
      </div>
    ) },
  ];

  /**
   * Free agents: no fee, no seller, and other clubs in the room.
   *
   * The rival count and the clock beside it are the whole decision — that there IS competition, and
   * how long is left to answer it. The rivals' actual numbers are deliberately not shown, or
   * outbidding would be arithmetic rather than judgement.
   */
  const freeCols: Column<FreeAgentRow>[] = [
    {
      key: "name",
      header: t.player,
      cell: (r) => (
        <button className="flex items-center gap-2 text-left hover:text-primary" onClick={() => onNavigate("player", r.playerId)}>
          <PlayerPhoto src={r.photo} alt={r.name} size={28} />
          <span className="font-medium text-fg">{r.name}</span>
        </button>
      ),
      sortValue: (r) => r.name,
    },
    {
      key: "pos",
      header: t.position,
      cell: (r) => <Tooltip><TooltipTrigger asChild><Badge variant={groupBadge(r.position)}>{shortPos(r.position)}</Badge></TooltipTrigger><TooltipContent>{posName(r.position)}</TooltipContent></Tooltip>,
      sortValue: (r) => r.position,
    },
    { key: "age", header: t.age, align: "center", cell: (r) => r.age, sortValue: (r) => r.age },
    { key: "ovr", header: t.overall, align: "center", cell: (r) => <Overall value={r.overall} />, sortValue: (r) => r.overall },
    {
      key: "wants",
      header: t.wantsWage,
      align: "right",
      cell: (r) => <span className="tabular-nums text-fg-muted">{fmt.money(r.askingWage, { compact: true })}</span>,
      sortValue: (r) => r.askingWage,
    },
    {
      key: "race",
      header: "",
      cell: (r) => (
        <div className="flex flex-col">
          {r.myBid && <span className="text-xs font-semibold text-primary">{fmt.t(t.yourOffer, { wage: fmt.money(r.myBid.wage, { compact: true }) })}</span>}
          {r.rivalBids > 0 && (
            <span className="text-2xs text-fg-faint">
              {fmt.t(r.rivalBids === 1 ? t.oneRival : t.manyRivals, { n: r.rivalBids })}
              {r.decidesInDays !== undefined ? " \u00b7 " + fmt.t(t.decidesIn, { n: r.decidesInDays }) : ""}
            </span>
          )}
          {r.rivalBids === 0 && r.decidesInDays !== undefined && (
            <span className="text-2xs text-fg-faint">{fmt.t(t.decidesIn, { n: r.decidesInDays })}</span>
          )}
        </div>
      ),
      sortValue: (r) => r.decidesInDays ?? 99,
    },
    { key: "act", header: "", align: "right", cell: (r) => (
      <div className="flex justify-end gap-1">
        <Button size="sm" variant={r.myBid ? "secondary" : "primary"} onClick={() => { setWage(r.myBid?.wage ?? r.askingWage); setYears(r.myBid?.years ?? r.wantsYears); setFreeFor(r); }}>
          {r.myBid ? t.raiseOffer : t.offerTerms}
        </Button>
        {r.myBid && <Button size="icon-sm" variant="ghost" aria-label={t.withdraw} onClick={() => withdrawFreeAgentBid(r.playerId)}><X /></Button>}
      </div>
    ) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.transfers}</h1>
        <p className="text-sm text-fg-muted">{t.availableForTransfers}: {fmt.money(budget, { compact: true })}</p>
      </div>

      {signings.length > 0 && (
        <Card className="border-primary">
          <CardContent className="flex flex-col gap-2 py-4">
            <h2 className="text-xs font-bold uppercase tracking-wide text-primary">{t.personalTerms}</h2>
            {signings.map((s) => (
              <div key={s.playerId} className="flex items-center gap-3 text-sm">
                <span className="flex-1"><span className="font-medium text-fg">{s.playerName}</span> — {fmt.t(t.feeAgreedWith, { club: s.fromClubName, fee: fmt.money(s.fee, { compact: true }) })}</span>
                {/* The deadline, in the one place the manager acts on it. A deal
                    that lapses should never be a surprise. */}
                <span className={cn("shrink-0 tabular-nums text-xs", s.daysLeft <= 5 ? "font-semibold text-danger" : "text-fg-faint")}>
                  {fmt.t(t.daysLeft, { n: s.daysLeft })}
                </span>
                <Button size="sm" variant="primary" onClick={() => openTerms(s)}>{t.agreeTerms}</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="targets">
        <TabsList>
          <TabsTrigger value="targets">{t.targetsTab}{shortlist.length ? ` (${shortlist.length})` : ""}</TabsTrigger>
          {/* Counts every live deal, fee-agreed ones included — the number is "what I have
              on the go", not "how many rows are in this panel". */}
          <TabsTrigger value="mine">{t.myOffersTab}{live.length ? ` (${live.length})` : ""}</TabsTrigger>
          <TabsTrigger value="received">{t.receivedTab}{received.length ? ` (${received.length})` : ""}</TabsTrigger>
          <TabsTrigger value="listed">{t.listedTab}{listed.length ? ` (${listed.length})` : ""}</TabsTrigger>
          <TabsTrigger value="free">{t.freeAgentsTab}{freeAgents.length ? ` (${freeAgents.length})` : ""}</TabsTrigger>
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
                <NegotiationThread
                  key={o.id}
                  n={o}
                  onNavigate={onNavigate}
                  actions={
                    // A counter is the one moment the manager has a real choice:
                    // take their number, push back, or walk.
                    o.stage === "countered" ? (
                      <>
                        <Button size="sm" variant="primary" onClick={() => acceptCounter(o.id)}>
                          {fmt.t(t.acceptAsking, { fee: fmt.money(o.theirLastFee ?? 0, { compact: true }) })}
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => openCounter(o)}>{t.counterAction}</Button>
                        <Button size="sm" variant="ghost" onClick={() => withdrawOffer(o.id)}>{t.withdrawAction}</Button>
                      </>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => withdrawOffer(o.id)}>{t.withdrawAction}</Button>
                    )
                  }
                />
              ))
            )}
            {/* Settled deals, folded away. They used to sit in the same list as the live
                ones and outnumber them within a season, while the tab counted only the live
                ones — so the number never matched what was on screen. They are still worth
                keeping: a rejection carries the club's REASON, which is what says whether to
                bid again. */}
            {settled.length > 0 && (
              <details className="mt-2 border-t border-hairline pt-2">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-caps text-fg-faint hover:text-fg">
                  {fmt.t(t.settledOffers, { n: settled.length })}
                </summary>
                <div className="mt-2 flex flex-col gap-2">
                  {settled.map((o) => <NegotiationThread key={o.id} n={o} onNavigate={onNavigate} />)}
                </div>
              </details>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="received">
          <Card><CardContent className="flex flex-col gap-2 py-4">
            {received.length === 0 ? (
              <p className="py-6 text-center text-sm text-fg-muted">{t.noOffersReceived}</p>
            ) : (
              received.map((o) => (
                <NegotiationThread
                  key={o.id}
                  n={o}
                  onNavigate={onNavigate}
                  actions={
                    // Once we've named a price the ball is theirs; there is
                    // nothing to accept or refuse until they answer.
                    o.stage === "offered" ? (
                      <>
                        <Button size="sm" variant="primary" onClick={() => respondOffer(o.id, true)}>{t.accept}</Button>
                        {/* Naming a price is the whole point of a negotiation —
                            accept/reject alone made a bid a yes/no question. */}
                        <Button size="sm" variant="secondary" onClick={() => openAsk(o)}>{t.askForAction}</Button>
                        <Button size="sm" variant="ghost" onClick={() => respondOffer(o.id, false)}>{t.reject}</Button>
                      </>
                    ) : null
                  }
                />
              ))
            )}
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="listed">
          <Card><CardContent className="py-3">
            {listed.length === 0 ? (
              <p className="py-8 text-center text-sm text-fg-muted">{t.emptyListed}</p>
            ) : (
              <DataTable columns={listedCols} rows={listed} getRowId={(r) => r.playerId} initialSort={{ key: "ask", dir: "desc" }} />
            )}
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="free">
          <Card><CardContent className="py-3">
            {freeAgents.length === 0 ? (
              <p className="py-8 text-center text-sm text-fg-muted">{t.emptyFreeAgents}</p>
            ) : (
              <DataTable columns={freeCols} rows={freeAgents} getRowId={(r) => r.playerId} initialSort={{ key: "ovr", dir: "desc" }} />
            )}
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      {listFor && <ListPlayerDialog playerId={listFor} onClose={() => setListFor(null)} />}

      {/* Terms to a free agent: a wage and a length, no fee. He will not consider less than his
          minimum, so the dialog names it rather than letting the offer be refused for reasons the
          manager cannot see. */}
      <Dialog open={freeFor !== null} onOpenChange={(o) => !o && setFreeFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{fmt.t(t.offerFor, { name: freeFor?.name ?? "" })}</DialogTitle>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-3">
            {freeFor && (
              <div className="flex flex-col gap-1 rounded-md bg-surface-2 px-3 py-2 text-xs text-fg-muted">
                <span>{fmt.t(t.heWants, { wage: fmt.money(freeFor.askingWage, { compact: true }), years: freeFor.wantsYears })}</span>
                <span>{fmt.t(t.wontConsiderBelow, { wage: fmt.money(freeFor.minimumWage, { compact: true }) })}</span>
                {freeFor.rivalBids > 0 && (
                  <span className="text-gold">{fmt.t(freeFor.rivalBids === 1 ? t.oneRival : t.manyRivals, { n: freeFor.rivalBids })}</span>
                )}
              </div>
            )}
            <div className="flex flex-col gap-1.5"><Label>{t.wagePerWeek}</Label><MoneyInput value={wage} onValue={setWage} step={5000} /></div>
            <div className="flex flex-col gap-1.5"><Label>{t.years}</Label><NumberInput value={years} onValue={setYears} min={1} max={5} step={1} /></div>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFreeFor(null)}>{t.cancel}</Button>
            <Button variant="primary" onClick={submitFreeAgentBid}>{t.offerContract}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* One dialog, both sides of the table: raising our bid, or naming our price. It has
          to SAY which — titled "Offer for X" while the manager was setting a selling price,
          it read as though he were buying his own player. Only the buying side is bound by
          our budget, and either side has to beat what is already on the table. */}
      <Dialog open={counterFor !== null} onOpenChange={(o) => !o && setCounterFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {fmt.t(counterFor?.weAreBuying ? t.offerFor : t.askingFor, { name: counterFor?.playerName ?? "" })}
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-3">
            <div className="text-xs text-fg-muted">
              {counterFor?.weAreBuying
                ? fmt.t(t.counterContext, {
                    ours: fmt.money(counterFor.ourLastFee ?? 0, { compact: true }),
                    theirs: fmt.money(counterFor.theirLastFee ?? 0, { compact: true }),
                  })
                : fmt.t(t.askContext, { theirs: fmt.money(counterFor?.theirLastFee ?? 0, { compact: true }) })}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{counterFor?.weAreBuying ? t.fee : t.askingPrice}</Label>
              <MoneyInput value={fee} onValue={setFee} min={counterFloor} budget={counterFor?.weAreBuying ? budget : undefined} />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCounterFor(null)}>{t.cancel}</Button>
            <Button
              variant="primary"
              disabled={fee < counterFloor || (Boolean(counterFor?.weAreBuying) && fee > budget)}
              onClick={submitCounter}
            >
              {counterFor?.weAreBuying ? t.counterAction : t.askForAction}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* The same dialog every player menu opens — one implementation, one behaviour. */}
      {offerFor && <OfferDialog playerId={offerFor} onClose={() => setOfferFor(null)} />}

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
