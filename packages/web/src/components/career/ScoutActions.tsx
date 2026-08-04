import { Check, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "../../app/AppProviders";
import { useCareer } from "../../app/CareerProvider";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { useFormat } from "../../lib/format";

/**
 * Watch him, or shortlist him.
 *
 * The two things a manager wants to do the moment he notices somebody, wherever he noticed him — the
 * scouting desk, a rival's squad page, eventually a match report. One implementation, because the
 * rules around them are not obvious and a second copy would get them wrong: a scout cannot be sent
 * to a player already watched, or fully known, or on our own books, and each refusal has a reason
 * worth reading rather than a button that silently does nothing.
 *
 * Absent entirely for one of ours. `scoutRefusal` is the authority on that — it already answers
 * "ownPlayer", so asking it saves this component knowing anything about squads.
 */
export function ScoutActions({ playerId, name }: { playerId: string; name: string }) {
  const { t } = useApp();
  const { career, scout, addTarget } = useCareer();
  const fmt = useFormat();
  if (!career) return null;

  const refusal = career.scoutRefusal(playerId);
  // Nothing to scout or shortlist about a player we already employ.
  if (refusal === "ownPlayer") return null;

  const REASON: Record<string, string> = {
    atCapacity: t.scoutAtCapacity,
    alreadyWatching: t.scoutAlreadyWatching,
    nothingLeftToLearn: t.scoutFullyKnown,
    ownPlayer: t.scoutOwnPlayer,
  };

  const watch = (
    <Button size="sm" variant="ghost" disabled={refusal !== null} onClick={() => scout(playerId)}>
      <Search /> {t.scout}
    </Button>
  );

  return (
    <div className="flex justify-end gap-1">
      {/* Disabled WITH a reason: "every scout is busy" and "we already know him" are different
          answers, and the manager can act on the first. */}
      {refusal ? (
        <Tooltip>
          <TooltipTrigger asChild><span>{watch}</span></TooltipTrigger>
          <TooltipContent>{REASON[refusal] ?? t.scout}</TooltipContent>
        </Tooltip>
      ) : (
        watch
      )}
      {career.isTarget(playerId) ? (
        <Button size="sm" variant="ghost" disabled><Check /> {t.target}</Button>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            addTarget(playerId);
            toast(fmt.t(t.addedToTargets, { name }));
          }}
        >
          <Plus /> {t.target}
        </Button>
      )}
    </div>
  );
}
