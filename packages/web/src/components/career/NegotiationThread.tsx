import { Clock } from "lucide-react";
import type { NegotiationView } from "@fut/career";
import { useApp } from "../../app/AppProviders";
import { Badge } from "../ui/badge";
import { PlayerPhoto } from "../ui/player-photo";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { useFormat } from "../../lib/format";
import { groupBadge, useLabels } from "../../lib/labels";
import type { ScreenId } from "../../layout/Shell";
import type { UIStringKey } from "../../i18n/strings";

/**
 * One transfer conversation, shown as the back-and-forth it is.
 *
 * A single status badge ("rejected") left the manager with nothing to act on.
 * The thread shows every number that crossed the table, how long is left to
 * answer, and — when it failed — the club's actual reason, which is what tells
 * you whether to bid again or move on.
 */

const STAGE_KEY: Record<NegotiationView["stage"], UIStringKey> = {
  offered: "stageOffered",
  countered: "stageCountered",
  feeAgreed: "stageFeeAgreed",
  personalTerms: "stagePersonalTerms",
  completed: "statusSigned",
  rejected: "statusRejected",
  expired: "stageExpired",
  withdrawn: "statusWithdrawn",
};

const REASON_KEY: Record<NonNullable<NegotiationView["reason"]>, UIStringKey> = {
  belowValuation: "reasonBelowValuation",
  keyPlayer: "reasonKeyPlayer",
  squadTooThin: "reasonSquadTooThin",
  alreadyRefused: "reasonAlreadyRefused",
};

const TONE: Partial<Record<NegotiationView["stage"], "primary" | "gold" | "muted">> = {
  offered: "gold",
  countered: "gold",
  feeAgreed: "primary",
  personalTerms: "primary",
  completed: "primary",
};

export function NegotiationThread({
  n,
  actions,
  onNavigate,
}: {
  n: NegotiationView;
  actions?: React.ReactNode;
  /** Supply to make the player row a link to his profile. */
  onNavigate?: (screen: ScreenId, param?: string) => void;
}) {
  const { t } = useApp();
  const fmt = useFormat();
  const { shortPos, posName } = useLabels();
  const money = (v: number) => fmt.money(v, { compact: true });

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border px-3 py-2.5">
      <div className="flex items-center gap-2 text-sm">
        {/* Who this is actually about — a name alone made the manager leave the
            screen to remember whether the bid was even worth reading. */}
        <PlayerPhoto src={n.photo} alt={n.playerName} size={28} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5">
            {onNavigate ? (
              <button className="truncate font-medium text-fg hover:text-primary" onClick={() => onNavigate("player", n.playerId)}>
                {n.playerName}
              </button>
            ) : (
              <span className="truncate font-medium text-fg">{n.playerName}</span>
            )}
            <Tooltip><TooltipTrigger asChild><Badge variant={n.position ? groupBadge(n.position) : "muted"}>{shortPos(n.position)}</Badge></TooltipTrigger><TooltipContent>{posName(n.position)}</TooltipContent></Tooltip>
            {n.overall !== undefined ? (
              <span className="text-xs font-bold tabular-nums text-fg">{n.overall}</span>
            ) : n.overallGrade ? (
              <span className="text-xs font-bold text-fg-muted">{n.overallGrade}</span>
            ) : (
              <span className="text-xs text-fg-faint">?</span>
            )}
          </span>
          <span className="truncate text-2xs text-fg-faint">{n.age} · {n.otherClubName}</span>
        </span>
        {/* A deadline is only news while it can still be met. */}
        {n.daysLeft !== undefined && (
          <span className="inline-flex items-center gap-1 text-xs tabular-nums text-fg-faint">
            <Clock className="size-3" />
            {fmt.t(t.daysLeft, { n: n.daysLeft })}
          </span>
        )}
        <Badge variant={TONE[n.stage] ?? "muted"}>{t[STAGE_KEY[n.stage]]}</Badge>
      </div>

      {/* The transcript: who asked what, in order. */}
      {n.rounds.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {n.rounds.map((r, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 tabular-nums">
              <span className="text-fg-faint">{r.by === "buyer" ? t.roundBid : t.roundAsk}</span>
              <span className="text-fg">{money(r.fee)}</span>
            </span>
          ))}
        </div>
      )}

      {n.reason && <p className="text-xs text-fg-muted">{t[REASON_KEY[n.reason]]}</p>}
      {actions && <div className="flex justify-end gap-1.5">{actions}</div>}
    </div>
  );
}
