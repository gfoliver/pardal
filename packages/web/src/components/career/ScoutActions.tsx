import { Check, Clock, Plus, Search } from "lucide-react";
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
/**
 * Just the watch button, on its own.
 *
 * Split out because the player profile needs exactly this and nothing else: it already has its own,
 * wordier shortlist button sized for a header, so dropping the pair in would have shown "add to
 * shortlist" twice. The RULES stay in one place, which is the part worth not copying.
 *
 * `size` because a header button and a table-row button are different sizes and the rest of the header
 * would look wrong beside a small one.
 */
export function WatchButton({ playerId, size = "sm" }: { playerId: string; size?: "sm" | "default" }) {
  const { t } = useApp();
  const { career, scout } = useCareer();
  if (!career) return null;

  const refusal = career.scoutRefusal(playerId);
  // Nothing to observe about a player we already employ — we simply know him.
  if (refusal === "ownPlayer") return null;

  const REASON: Record<string, string> = {
    alreadyWatching: t.scoutAlreadyWatching,
    alreadyQueued: t.scoutAlreadyQueued,
    nothingLeftToLearn: t.scoutFullyKnown,
    ownPlayer: t.scoutOwnPlayer,
  };

  // Every scout out is no longer a refusal — the request joins the line. The button says which of the
  // two it is about to do, because "watch him" that quietly means "eventually" is a small lie.
  const willQueue = refusal === null && career.scoutWouldQueue();

  const watch = (
    <Button size={size} variant={size === "sm" ? "ghost" : "secondary"} disabled={refusal !== null} onClick={() => scout(playerId)}>
      {willQueue ? <Clock /> : <Search />} {willQueue ? t.scoutQueueAction : t.scout}
    </Button>
  );

  // Disabled WITH a reason: "we already know him" and "he is already in the line" are different answers,
  // and only one of them is worth acting on.
  const hint = refusal ? (REASON[refusal] ?? t.scout) : willQueue ? t.scoutQueueHint : null;
  if (!hint) return watch;
  return (
    <Tooltip>
      {/* A span, because a disabled button fires no pointer events of its own for the tooltip to hear. */}
      <TooltipTrigger asChild><span>{watch}</span></TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}

export function ScoutActions({ playerId, name }: { playerId: string; name: string }) {
  const { t } = useApp();
  const { career, addTarget } = useCareer();
  const fmt = useFormat();
  if (!career) return null;
  if (career.scoutRefusal(playerId) === "ownPlayer") return null;

  return (
    <div className="flex justify-end gap-1">
      <WatchButton playerId={playerId} />
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
