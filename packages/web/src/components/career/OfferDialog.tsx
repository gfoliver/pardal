import { useState } from "react";
import { toast } from "sonner";
import type { OfferRefusal } from "@fut/career";
import { useApp } from "../../app/AppProviders";
import { useCareer } from "../../app/CareerProvider";
import { Button } from "../ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { MoneyInput } from "../ui/money-input";
import { Label } from "../ui/input";
import { useFormat } from "../../lib/format";

/**
 * Bid for a player at another club — from wherever the manager is looking at him.
 *
 * ONE implementation, for the same reason `player-actions` exists: the offer used to live
 * inline in the Transfers screen, so the "Offer" item in every player menu could do nothing
 * but navigate to Transfers and leave the manager to find the row again. On a shortlist he
 * had not added the player to, there was no row to find.
 */
export function OfferDialog({ playerId, onClose }: { playerId: string; onClose: () => void }) {
  const { t } = useApp();
  const { career, makeOffer } = useCareer();
  const fmt = useFormat();
  const detail = career?.playerDetail(playerId);
  // Open at what our scouts think he is worth. When we have not watched him there is no
  // such number, and inventing one — the old `?? 0` — put a figure in the field that read
  // like a valuation and was not.
  const [fee, setFee] = useState<number>(detail?.value?.mid ?? 0);
  if (!career || !detail) return null;

  const budget = career.transferBudget;
  const refusal = career.offerRefusal(playerId, fee);
  const REFUSAL: Record<OfferRefusal, string> = {
    notForSale: t.offerNotForSale,
    alreadyBidding: t.offerAlreadyBidding,
    overBudget: t.offerOverBudget,
    noFee: t.offerNoFee,
  };

  const submit = () => {
    const r = makeOffer(playerId, fee);
    // Say WHY, not "failed" — the reason decides whether to bid again or move on.
    toast(r.ok ? fmt.t(t.offerLodged, { name: detail.name }) : REFUSAL[r.reason]);
    if (r.ok) onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{fmt.t(t.offerFor, { name: detail.name })}</DialogTitle></DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          <div className="text-xs text-fg-muted">
            {detail.value
              ? fmt.t(t.valueBalance, {
                  // A range, because that is genuinely all we know about his price.
                  value: detail.value.exact
                    ? fmt.money(detail.value.mid, { compact: true })
                    : `${fmt.money(detail.value.low, { compact: true })}–${fmt.money(detail.value.high, { compact: true })}`,
                  balance: fmt.money(budget, { compact: true }),
                })
              : /* No estimate at all: say so, rather than showing a made-up one. */
                fmt.t(t.noValuationYet, { balance: fmt.money(budget, { compact: true }) })}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t.fee}</Label>
            <MoneyInput value={fee} onValue={setFee} budget={budget} />
          </div>
          {refusal && <p className="text-xs text-danger">{REFUSAL[refusal]}</p>}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t.cancel}</Button>
          {/* Disabled with the reason spelled out above, rather than a button that
              submits and then reports a failure. */}
          <Button variant="primary" disabled={refusal !== null} onClick={submit}>{t.lodgeOffer}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
