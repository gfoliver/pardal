import { useState } from "react";
import type { NegotiationView } from "@fut/career";
import { useApp } from "../../app/AppProviders";
import { useCareer } from "../../app/CareerProvider";
import { Button } from "../ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Label } from "../ui/input";
import { MoneyInput } from "../ui/money-input";
import { useFormat } from "../../lib/format";

/**
 * What can be done about a negotiation, wherever it is drawn.
 *
 * The verbs used to live inline in Transfers, which was fine while Transfers was the only screen that
 * showed a negotiation. The mailbox now shows the same deal — it is the screen that TELLS you about the
 * bid, and telling you about a decision while sending you elsewhere to take it is the definition of an
 * inert screen. Two copies of "accept, name a price, refuse" would have drifted the first time one side
 * gained a confirmation or a floor, so there is one.
 *
 * Which verbs appear is derived from the negotiation, not passed in: the stage and the side we are on
 * already determine whether there is a decision to make, and a caller able to get that wrong is a caller
 * that eventually does.
 */

/**
 * The number, when the answer is a number rather than yes or no.
 *
 * Mounted per negotiation and keyed by its id, so the field starts from the right figure and cannot
 * carry a stale one over from the last deal the manager looked at.
 */
function CounterDialog({ n, onClose }: { n: NegotiationView; onClose: () => void }) {
  const { t } = useApp();
  const fmt = useFormat();
  const { career, counterOffer, askFor } = useCareer();
  const buying = n.weAreBuying;
  /*
   * Opens half-way between the two numbers when we are buying, and a third above their bid when we are
   * selling. Selling cannot open AT their number: matching it is just accepting, which is the button
   * next to this one.
   */
  const [fee, setFee] = useState(() =>
    buying
      ? Math.round(((n.ourLastFee ?? 0) + (n.theirLastFee ?? 0)) / 2)
      : Math.round((n.theirLastFee ?? 0) * 1.3),
  );

  const budget = career?.transferBudget ?? 0;
  /** Either side has to beat what is already on the table, or it is not a counter. */
  const floor = (buying ? (n.ourLastFee ?? 0) : (n.theirLastFee ?? 0)) + 1;

  const submit = () => {
    if (buying) counterOffer(n.id, fee);
    else askFor(n.id, fee);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          {/* Which side of the table we are on, said out loud. Titled "Offer for X" while the manager
              was setting a selling price, it read as though he were buying his own player. */}
          <DialogTitle>{fmt.t(buying ? t.offerFor : t.askingFor, { name: n.playerName })}</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          <div className="text-xs text-fg-muted">
            {buying
              ? fmt.t(t.counterContext, {
                  ours: fmt.money(n.ourLastFee ?? 0, { compact: true }),
                  theirs: fmt.money(n.theirLastFee ?? 0, { compact: true }),
                })
              : fmt.t(t.askContext, { theirs: fmt.money(n.theirLastFee ?? 0, { compact: true }) })}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{buying ? t.fee : t.askingPrice}</Label>
            {/* Only the buying side is bound by our budget. */}
            <MoneyInput value={fee} onValue={setFee} min={floor} budget={buying ? budget : undefined} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t.cancel}</Button>
          <Button variant="primary" disabled={fee < floor || (buying && fee > budget)} onClick={submit}>
            {buying ? t.counterAction : t.askForAction}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * True when this negotiation has a decision waiting on the manager, so a caller can decide whether to
 * offer the verbs at all before rendering them.
 *
 * Mirrors `Career.decisionsWaiting`'s three cases minus `feeAgreed`, which is answered by the
 * personal-terms card rather than by a fee.
 */
export function hasDecision(n: Pick<NegotiationView, "stage" | "weAreBuying">): boolean {
  if (n.weAreBuying) return n.stage === "countered";
  return n.stage === "offered";
}

export function NegotiationActions({ n }: { n: NegotiationView }) {
  const { t } = useApp();
  const fmt = useFormat();
  const { respondOffer, acceptCounter, withdrawOffer } = useCareer();
  const [countering, setCountering] = useState(false);

  const close = () => setCountering(false);

  return (
    <>
      {n.weAreBuying ? (
        // A counter is the one moment the manager has a real choice: take their number, push back, or
        // walk. Before that there is nothing to accept, so the only verb is walking away.
        n.stage === "countered" ? (
          <>
            <Button size="sm" variant="primary" onClick={() => acceptCounter(n.id)}>
              {fmt.t(t.acceptAsking, { fee: fmt.money(n.theirLastFee ?? 0, { compact: true }) })}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setCountering(true)}>{t.counterAction}</Button>
            <Button size="sm" variant="ghost" onClick={() => withdrawOffer(n.id)}>{t.withdrawAction}</Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => withdrawOffer(n.id)}>{t.withdrawAction}</Button>
        )
      ) : n.stage === "offered" ? (
        <>
          <Button size="sm" variant="primary" onClick={() => respondOffer(n.id, true)}>{t.accept}</Button>
          {/* Naming a price is the whole point of a negotiation — accept/reject alone made a bid a
              yes/no question. */}
          <Button size="sm" variant="secondary" onClick={() => setCountering(true)}>{t.askForAction}</Button>
          <Button size="sm" variant="ghost" onClick={() => respondOffer(n.id, false)}>{t.reject}</Button>
        </>
      ) : null}
      {/* Keyed by the deal, so the field is seeded from THIS negotiation every time it opens. */}
      {countering && <CounterDialog key={n.id} n={n} onClose={close} />}
    </>
  );
}
