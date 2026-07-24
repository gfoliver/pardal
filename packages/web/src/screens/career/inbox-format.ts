import { InboxMessageType, type CareerSnapshot, type InboxMessage } from "@fut/career";

const short = (snap: CareerSnapshot, clubId?: string | number | boolean) =>
  (typeof clubId === "string" && snap.clubs[clubId]?.shortName) || String(clubId ?? "");

/**
 * A compact one-line label for an inbox message. Locale-agnostic-ish for the
 * slice (M3 gives it full i18n + a detail view); club names come from the save,
 * player names are enriched later.
 */
export function inboxLine(m: InboxMessage, snap: CareerSnapshot): string {
  const p = m.params;
  switch (m.type) {
    case InboxMessageType.MatchResult:
      return `${short(snap, p.homeTeamId)} ${p.homeScore}–${p.awayScore} ${short(snap, p.awayTeamId)}`;
    case InboxMessageType.TransferCompleted:
      return `${short(snap, p.fromClubId)} → ${short(snap, p.toClubId)}${p.loan ? " (loan)" : ""}`;
    case InboxMessageType.PlayerInjured:
      return `Injury · ${p.days}d`;
    case InboxMessageType.ContractRenewed:
      return `Contract renewed`;
    case InboxMessageType.BoardObjectiveSet:
      return `Board objective set`;
    case InboxMessageType.BoardSacked:
      return `Sacked by the board`;
    case InboxMessageType.PromotionRelegation:
      return `Promotion / relegation`;
    default:
      return String(m.type);
  }
}
