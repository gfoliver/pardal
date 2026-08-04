import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "../../app/AppProviders";
import { useCareer } from "../../app/CareerProvider";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { DataGrid, FilterBar, SelectionBar, runQuery, useGridState, useSelection, type FieldSpec } from "../../components/data";
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
  const { shortPos, posName, posOptions } = useLabels();
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

  /*
   * Read BEFORE the "no career" guard, because the three lists below own grid state and hooks
   * cannot sit after a conditional return. Everything is optional-chained rather than asserted.
   */
  const freeAgents = useMemo(() => career?.freeAgents() ?? [], [career]);
  const shortlist = useMemo(() => career?.shortlist() ?? [], [career]);
  const listed = useMemo(() => career?.transferList() ?? [], [career]);
  const seasonDays = career?.snapshot().totalDays;

  /** The shortlist: the same market row as Scouting, cut to what a decision needs. */
  const targetSpecs = useMemo<FieldSpec<TransferTarget>[]>(
    () => [
      {
        id: "name",
        label: t.player,
        kind: "text",
        required: true,
        width: 200,
        value: (r) => r.name,
        search: (r) => `${r.clubShort} ${shortPos(r.position)} ${posName(r.position)} ${r.nationality}`,
        cell: (r) => (
          <button className="flex w-full items-center gap-2 text-left hover:text-primary" onClick={() => onNavigate("player", r.playerId)}>
            <PlayerPhoto src={r.photo} alt={r.name} size={28} />
            <span className="min-w-0 flex-1 truncate font-medium text-fg">{r.name}</span>
          </button>
        ),
      },
      { id: "club", label: t.club, kind: "enum", width: 76, value: (r) => r.clubShort },
      {
        id: "pos",
        label: t.position,
        kind: "enum",
        width: 64,
        value: (r) => r.position,
        options: (all) => posOptions(all, (r) => r.position),
        cell: (r) => <Tooltip><TooltipTrigger asChild><Badge variant={groupBadge(r.position)}>{shortPos(r.position)}</Badge></TooltipTrigger><TooltipContent>{posName(r.position)}</TooltipContent></Tooltip>,
      },
      { id: "age", label: t.age, kind: "number", align: "center", width: 56, value: (r) => r.age },
      {
        id: "ovr",
        label: t.overall,
        kind: "number",
        align: "center",
        width: 64,
        better: "higher",
        value: (r) => r.overall,
        cell: (r) =>
          r.overall !== undefined ? <Overall value={r.overall} />
            : r.overallGrade ? <span className="font-semibold text-fg-muted">{r.overallGrade}</span>
              : <span className="text-fg-faint">?</span>,
      },
      {
        id: "value",
        label: t.value,
        kind: "money",
        align: "right",
        width: 108,
        value: (r) => r.value?.mid,
        cell: (r) => <EstimateText e={r.value} format={(n) => fmt.money(n, { compact: true })} />,
      },
      {
        id: "expires",
        label: t.expires,
        kind: "days",
        align: "right",
        width: 92,
        perYear: seasonDays,
        // On the shortlist because a target running out of contract is a target you wait for.
        value: (r) => r.contractDaysLeft,
        cell: (r) =>
          r.contractDaysLeft === undefined || seasonDays === undefined ? <span className="text-fg-faint">—</span> : (
            <span className={cn("tabular-nums", r.contractDaysLeft <= 180 ? "font-semibold text-gold" : "text-fg-muted")}>
              {fmt.duration(r.contractDaysLeft, seasonDays)}
            </span>
          ),
      },
      {
        id: "actions",
        label: "",
        longLabel: t.actionsLabel,
        kind: "text",
        required: true,
        align: "right",
        width: 130,
        value: () => undefined,
        cell: (r) => (
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="secondary" onClick={() => setOfferFor(r.playerId)}>{t.offerAction}</Button>
            <Button size="icon-sm" variant="ghost" aria-label={t.removeAction} onClick={() => removeTarget(r.playerId)}><X /></Button>
          </div>
        ),
      },
    ],
    [t, fmt, shortPos, posName, seasonDays, onNavigate, removeTarget],
  );

  /** Our own players on the block. */
  const listedSpecs = useMemo<FieldSpec<ListedPlayer>[]>(
    () => [
      {
        id: "name",
        label: t.player,
        kind: "text",
        required: true,
        width: 200,
        value: (r) => r.name,
        search: (r) => `${shortPos(r.position)} ${posName(r.position)}`,
        cell: (r) => (
          <button className="flex w-full items-center gap-2 text-left hover:text-primary" onClick={() => onNavigate("player", r.playerId)}>
            <PlayerPhoto src={r.photo} alt={r.name} size={28} />
            <span className="min-w-0 flex-1 truncate font-medium text-fg">{r.name}</span>
          </button>
        ),
      },
      {
        id: "pos",
        label: t.position,
        kind: "enum",
        width: 64,
        value: (r) => r.position,
        options: (all) => posOptions(all, (r) => r.position),
        cell: (r) => <Tooltip><TooltipTrigger asChild><Badge variant={groupBadge(r.position)}>{shortPos(r.position)}</Badge></TooltipTrigger><TooltipContent>{posName(r.position)}</TooltipContent></Tooltip>,
      },
      { id: "age", label: t.age, kind: "number", align: "center", width: 56, value: (r) => r.age },
      { id: "ovr", label: t.overall, kind: "number", align: "center", width: 64, value: (r) => r.overall, cell: (r) => <Overall value={r.overall} /> },
      {
        id: "value",
        label: t.marketValue,
        kind: "money",
        align: "right",
        width: 100,
        value: (r) => r.value,
        cell: (r) => <span className="tabular-nums text-fg-muted">{fmt.money(r.value, { compact: true })}</span>,
      },
      {
        id: "ask",
        label: t.askingPrice,
        kind: "money",
        align: "right",
        width: 100,
        value: (r) => r.askingPrice,
        cell: (r) => <span className="font-semibold tabular-nums">{fmt.money(r.askingPrice, { compact: true })}</span>,
      },
      {
        id: "since",
        label: t.listedTab,
        kind: "number",
        width: 150,
        // A listing nobody has bitten on is the useful fact, so the days on the list and any bid
        // already on the table share one column.
        value: (r) => r.listedDays,
        cell: (r) =>
          r.bid !== undefined ? (
            <span className="text-xs font-semibold text-primary">{fmt.t(t.bidOnTable, { fee: fmt.money(r.bid, { compact: true }) })}</span>
          ) : (
            <span className="text-xs text-fg-faint">{fmt.t(t.listedFor, { n: r.listedDays })}</span>
          ),
      },
      {
        id: "actions",
        label: "",
        longLabel: t.actionsLabel,
        kind: "text",
        required: true,
        align: "right",
        width: 176,
        value: () => undefined,
        cell: (r) => (
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="secondary" onClick={() => setListFor(r.playerId)}>{t.changeAskingPrice}</Button>
            <Button size="icon-sm" variant="ghost" aria-label={t.unlistPlayer} onClick={() => unlistPlayer(r.playerId)}><X /></Button>
          </div>
        ),
      },
    ],
    [t, fmt, shortPos, posName, onNavigate, unlistPlayer],
  );

  /**
   * Free agents: no fee, no seller, and other clubs in the room.
   *
   * The rival count and the clock beside it are the whole decision — that there IS competition, and
   * how long is left to answer it. The rivals' actual numbers are deliberately not shown, or
   * outbidding would be arithmetic rather than judgement.
   */
  const freeSpecs = useMemo<FieldSpec<FreeAgentRow>[]>(
    () => [
      {
        id: "name",
        label: t.player,
        kind: "text",
        required: true,
        width: 200,
        value: (r) => r.name,
        search: (r) => `${shortPos(r.position)} ${posName(r.position)}`,
        cell: (r) => (
          <button className="flex w-full items-center gap-2 text-left hover:text-primary" onClick={() => onNavigate("player", r.playerId)}>
            <PlayerPhoto src={r.photo} alt={r.name} size={28} />
            <span className="min-w-0 flex-1 truncate font-medium text-fg">{r.name}</span>
          </button>
        ),
      },
      {
        id: "pos",
        label: t.position,
        kind: "enum",
        width: 64,
        value: (r) => r.position,
        options: (all) => posOptions(all, (r) => r.position),
        cell: (r) => <Tooltip><TooltipTrigger asChild><Badge variant={groupBadge(r.position)}>{shortPos(r.position)}</Badge></TooltipTrigger><TooltipContent>{posName(r.position)}</TooltipContent></Tooltip>,
      },
      { id: "age", label: t.age, kind: "number", align: "center", width: 56, value: (r) => r.age },
      { id: "ovr", label: t.overall, kind: "number", align: "center", width: 64, better: "higher", value: (r) => r.overall, cell: (r) => <Overall value={r.overall} /> },
      {
        id: "wants",
        label: t.wantsWage,
        kind: "money",
        align: "right",
        width: 108,
        // A wage he is asking for is a cost, unambiguously — unlike a valuation.
        better: "lower",
        value: (r) => r.askingWage,
        cell: (r) => <span className="tabular-nums text-fg-muted">{fmt.money(r.askingWage, { compact: true })}</span>,
      },
      {
        id: "race",
        label: t.decidesInLabel,
        kind: "number",
        width: 190,
        // The clock, because it is what forces a decision. Sorting by it puts the ones about to go
        // first, which is the order a manager actually wants to work this list in.
        value: (r) => r.decidesInDays,
        cell: (r) => (
          <div className="flex flex-col">
            {r.myBid && <span className="text-xs font-semibold text-primary">{fmt.t(t.yourOffer, { wage: fmt.money(r.myBid.wage, { compact: true }) })}</span>}
            {r.rivalBids > 0 && (
              <span className="text-2xs text-fg-faint">
                {fmt.t(r.rivalBids === 1 ? t.oneRival : t.manyRivals, { n: r.rivalBids })}
                {r.decidesInDays !== undefined ? " · " + fmt.t(t.decidesIn, { n: r.decidesInDays }) : ""}
              </span>
            )}
            {r.rivalBids === 0 && r.decidesInDays !== undefined && (
              <span className="text-2xs text-fg-faint">{fmt.t(t.decidesIn, { n: r.decidesInDays })}</span>
            )}
          </div>
        ),
      },
      {
        id: "contested",
        label: t.rivalsLabel,
        kind: "bool",
        hiddenByDefault: true,
        align: "center",
        width: 80,
        // "Who can I still get unopposed" is the question this list is for.
        value: (r) => r.rivalBids > 0,
      },
      {
        id: "actions",
        label: "",
        longLabel: t.actionsLabel,
        kind: "text",
        required: true,
        align: "right",
        width: 150,
        value: () => undefined,
        cell: (r) => (
          <div className="flex justify-end gap-1">
            <Button size="sm" variant={r.myBid ? "secondary" : "primary"} onClick={() => { setWage(r.myBid?.wage ?? r.askingWage); setYears(r.myBid?.years ?? r.wantsYears); setFreeFor(r); }}>
              {r.myBid ? t.raiseOffer : t.offerTerms}
            </Button>
            {r.myBid && <Button size="icon-sm" variant="ghost" aria-label={t.withdraw} onClick={() => withdrawFreeAgentBid(r.playerId)}><X /></Button>}
          </div>
        ),
      },
    ],
    [t, fmt, shortPos, posName, onNavigate, withdrawFreeAgentBid],
  );

  // One layout per tab, remembered separately: they are different questions about different lists.
  // One selection per tab, because a shortlisted target and a free agent are not the same list and a
  // comparison spanning the two would have no column in common to line them up by.
  const targetPick = useSelection();
  const freePick = useSelection();
  const targetGrid = useGridState("transfers.targets", targetSpecs, { field: "ovr", dir: "desc" });
  const listedGrid = useGridState("transfers.listed", listedSpecs, { field: "ask", dir: "desc" });
  const freeGrid = useGridState("transfers.free", freeSpecs, { field: "ovr", dir: "desc" });
  const targetRows = useMemo(() => runQuery(shortlist, targetSpecs, targetGrid.query), [shortlist, targetSpecs, targetGrid.query]);
  const listedRows = useMemo(() => runQuery(listed, listedSpecs, listedGrid.query), [listed, listedSpecs, listedGrid.query]);
  const freeRows = useMemo(() => runQuery(freeAgents, freeSpecs, freeGrid.query), [freeAgents, freeSpecs, freeGrid.query]);

  /** A player's identity as a comparison column head — the same whether he is a target or a free agent. */
  const compareHead = (r: { playerId: string; name: string; photo?: string }) => (
    <span className="flex items-center gap-2">
      <PlayerPhoto src={r.photo} alt={r.name} size={28} />
      <button
        className="min-w-0 truncate text-left font-semibold text-fg outline-none hover:text-primary"
        onClick={() => onNavigate("player", r.playerId)}
      >
        {r.name}
      </button>
    </span>
  );

  if (!career) return null;

  const live = career.myOffers();
  // Fee-agreed deals are drawn by the personal-terms card at the top with the button that
  // finishes them, so they are left out of the thread list rather than shown twice.
  const myOffers = live.filter((o) => o.stage !== "feeAgreed");
  const settled = career.settledOffers();
  const received = career.pendingOffers();
  const signings = career.pendingSignings();
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
              <div className="flex flex-col gap-3">
                <FilterBar specs={targetSpecs} rows={shortlist} state={targetGrid} shown={targetRows.length} total={shortlist.length} />
                <SelectionBar rows={shortlist} rowKey={(r) => r.playerId} specs={targetSpecs} selection={targetPick} heading={compareHead} />
                <DataGrid rows={targetRows} state={targetGrid} rowKey={(r) => r.playerId} selection={targetPick} className="max-h-[calc(100vh-23rem)]" />
              </div>
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
              <div className="flex flex-col gap-3">
                <FilterBar specs={listedSpecs} rows={listed} state={listedGrid} shown={listedRows.length} total={listed.length} />
                <DataGrid rows={listedRows} state={listedGrid} rowKey={(r) => r.playerId} className="max-h-[calc(100vh-23rem)]" />
              </div>
            )}
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="free">
          <Card><CardContent className="py-3">
            {freeAgents.length === 0 ? (
              <p className="py-8 text-center text-sm text-fg-muted">{t.emptyFreeAgents}</p>
            ) : (
              <div className="flex flex-col gap-3">
                <FilterBar specs={freeSpecs} rows={freeAgents} state={freeGrid} shown={freeRows.length} total={freeAgents.length} />
                <SelectionBar rows={freeAgents} rowKey={(r) => r.playerId} specs={freeSpecs} selection={freePick} heading={compareHead} />
                <DataGrid rows={freeRows} state={freeGrid} rowKey={(r) => r.playerId} selection={freePick} className="max-h-[calc(100vh-23rem)]" />
              </div>
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
