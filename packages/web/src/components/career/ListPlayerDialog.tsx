import { useState } from "react";
import { useApp } from "../../app/AppProviders";
import { useCareer } from "../../app/CareerProvider";
import { Button } from "../ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { MoneyInput } from "../ui/money-input";
import { Label } from "../ui/input";
import { useFormat } from "../../lib/format";

/**
 * Put a player on the transfer list, or change what we are asking for him.
 *
 * The price is a real decision, not a formality: a rival meets the asking price outright
 * when it is within half again what the player is worth, and comes in at its own
 * valuation when it is not. So the dialog opens at the suggested figure — what a club
 * would have had to beat anyway — and says plainly what he is worth beside it.
 */
export function ListPlayerDialog({ playerId, onClose }: { playerId: string; onClose: () => void }) {
  const { t } = useApp();
  const { career, listPlayer } = useCareer();
  const fmt = useFormat();
  const already = career?.askingPrice(playerId);
  const [fee, setFee] = useState<number>(already ?? career?.suggestedAsk(playerId) ?? 0);
  if (!career) return null;

  const value = career.squad().find((e) => e.playerId === playerId)?.value ?? 0;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{already === undefined ? t.listForTransfer : t.changeAskingPrice}</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          <p className="text-sm text-fg-muted">{career.playerName(playerId)}</p>
          <div className="flex flex-col gap-1.5">
            <Label>{t.askingPrice}</Label>
            <MoneyInput value={fee} onValue={setFee} min={1} />
          </div>
          <p className="text-xs text-fg-muted">{fmt.t(t.askingPriceHint, { value: fmt.money(value, { compact: true }) })}</p>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t.cancel}</Button>
          <Button
            variant="primary"
            disabled={fee <= 0}
            onClick={() => {
              listPlayer(playerId, fee);
              onClose();
            }}
          >
            {already === undefined ? t.listForTransfer : t.changeAskingPrice}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
