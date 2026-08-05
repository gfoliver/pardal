import { Clock } from "lucide-react";
import type { NegotiationView } from "@fut/career";
import { useApp } from "../../app/AppProviders";
import { Badge } from "../ui/badge";
import { PlayerPhoto } from "../ui/player-photo";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { EstimateText } from "./Estimate";
import { useFormat } from "../../lib/format";
import { groupBadge, useLabels } from "../../lib/labels";
import { cn } from "../../lib/utils";
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

/**
 * Is it our move?
 *
 * They have bid on one of ours, or they have come back on a bid of ours. Both are moments the manager is
 * being ASKED something, and both are exactly when the caller hands the thread decision buttons.
 *
 * It decides whether the stage badge is drawn at all, which is why it is exported and tested rather than
 * inlined: a badge reading "awaiting a response" beside buttons reading Accept / Ask for more / Refuse is
 * the screen saying it twice, the second time in words you cannot act on. When the ball is ours the
 * buttons ARE the status; when it is theirs, or the deal is closed, the badge is the only thing that says
 * so — and getting this backwards would hide the status in precisely the cases that need it.
 */
export function ballIsOurs(n: Pick<NegotiationView, "stage" | "weAreBuying">): boolean {
  if (n.stage === "offered") return !n.weAreBuying; // they bid for one of ours
  if (n.stage === "countered") return n.weAreBuying; // they came back on a bid of ours
  return false; // waiting on them, or over
}

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
  /** The figure currently on the table — the last thing either side named. */
  const latest = n.rounds.length > 0 ? n.rounds[n.rounds.length - 1]!.fee : undefined;

  /*
   * A transcript is only a transcript once there has been a conversation.
   *
   * With one round it repeated the figure already shown above it, word for word — "R$ 19,5 mi" in the
   * header and "proposta R$ 19,5 mi" underneath, on a card whose whole content was that one number. Two
   * rounds or more is a negotiation and worth reading in order.
   */
  const showRounds = n.rounds.length > 1;
  const ourMove = ballIsOurs(n);

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-surface px-3 py-2.5">
      {/*
        * One row on a desktop, wrapping into three on a phone: who, how much, what to do about it.
        *
        * The actions sit BESIDE the money rather than on their own right-aligned line below it. They are
        * a response to that number, and putting a full-width gap between the two made a two-line card
        * into a four-line one — the shape the manager called horrible, and he was right: for a single
        * bid it was four stacked rows to say one sentence.
        *
        * Measured at 375px before an earlier pass: the row was 310px and its children came out photo 28,
        * IDENTITY 0, deadline 72, badge 160 — the name crushed to nothing because it was the only child
        * able to shrink. The floor on the identity block is what makes it wrap instead, and it stays.
        */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        {/* Who this is actually about — a name alone made the manager leave the
            screen to remember whether the bid was even worth reading. */}
        <PlayerPhoto src={n.photo} alt={n.playerName} size={32} />
        <span className="flex min-w-[10rem] flex-1 flex-col">
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

        {/*
          The number, and the number it should be judged against.

          Our valuation under the fee is the whole point of this block: nineteen and a half million for a
          78-rated twenty-nine-year-old is either robbery or a gift, and until now the screen said which
          one nowhere. No colour on it, deliberately — a bid below valuation is a bad deal for a player
          you want and a fine one for a player you are done with, and that is the manager's call to make.
        */}
        {latest !== undefined && (
          <span className="flex shrink-0 flex-col items-end leading-tight">
            <span className="text-base font-semibold tabular-nums text-fg">{money(latest)}</span>
            {n.value && (
              <span className="text-2xs text-fg-faint">
                {t.worthAbout} <EstimateText e={n.value} format={money} className="text-2xs text-fg-muted" />
              </span>
            )}
          </span>
        )}

        <span className="flex shrink-0 items-center gap-2">
          {/* A deadline is only news while it can still be met, and it turns urgent on its own. */}
          {n.daysLeft !== undefined && (
            <span className={cn(
              "inline-flex items-center gap-1 text-xs tabular-nums",
              n.daysLeft <= 3 ? "font-semibold text-gold" : "text-fg-faint",
            )}>
              <Clock className="size-3" />
              {fmt.t(t.daysLeft, { n: n.daysLeft })}
            </span>
          )}
          {!ourMove && <Badge variant={TONE[n.stage] ?? "muted"}>{t[STAGE_KEY[n.stage]]}</Badge>}
        </span>

        {actions && (
          <span className="flex w-full shrink-0 flex-wrap gap-1.5 [&>button]:flex-1 sm:w-auto sm:[&>button]:flex-none">
            {actions}
          </span>
        )}
      </div>

      {/* The transcript: who asked what, in order. */}
      {showRounds && (
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
    </div>
  );
}
