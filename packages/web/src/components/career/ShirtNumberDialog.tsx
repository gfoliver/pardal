import { useState } from "react";
import { useApp } from "../../app/AppProviders";
import { useCareer } from "../../app/CareerProvider";
import { Button } from "../ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { NumberInput } from "../ui/number-input";
import { Label } from "../ui/input";
import { useFormat } from "../../lib/format";

/**
 * Give a player a squad number.
 *
 * Taking a number someone else wears is allowed and SWAPS the two, which is what
 * really happens when a squad renumbers — refusing would just make the manager
 * do it in two steps, and the halfway state (two players on 10) is exactly what
 * the reducer rejects.
 */
export function ShirtNumberDialog({ playerId, onClose }: { playerId: string; onClose: () => void }) {
  const { t } = useApp();
  const { career, setShirtNumber } = useCareer();
  const fmt = useFormat();
  const current = career?.shirtNumber(playerId);
  const [n, setN] = useState<number>(current ?? career?.freeShirtNumbers()[0] ?? 1);
  if (!career) return null;

  const numbers = career.squadNumbers();
  const holder = [...numbers.entries()].find(([id, num]) => num === n && id !== playerId)?.[0];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t.changeShirtNumber}</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          <p className="text-sm text-fg-muted">{career.playerName(playerId)}</p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="shirt">{t.shirtNumber}</Label>
            <NumberInput id="shirt" min={1} max={99} value={n} onValue={setN} />
          </div>
          {holder && (
            // Naming who loses the shirt turns a surprise into a decision.
            <p className="text-xs text-fg-muted">{fmt.t(t.shirtTakenBy, { name: career.playerName(holder) })}</p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t.cancel}</Button>
          <Button
            variant="primary"
            disabled={n === current}
            onClick={() => {
              setShirtNumber(playerId, n);
              onClose();
            }}
          >
            {t.changeShirtNumber}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
