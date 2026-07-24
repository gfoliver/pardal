import type { SeasonDate } from "../time.js";

export enum InboxMessageType {
  MatchResult = "matchResult",
  TransferOfferReceived = "transferOfferReceived",
  TransferCompleted = "transferCompleted",
  TransferRejected = "transferRejected",
  ContractExpiring = "contractExpiring",
  ContractRenewed = "contractRenewed",
  PlayerInjured = "playerInjured",
  PlayerSuspended = "playerSuspended",
  BoardObjectiveSet = "boardObjectiveSet",
  BoardWarning = "boardWarning",
  BoardSacked = "boardSacked",
  WindowOpened = "windowOpened",
  WindowClosed = "windowClosed",
  PromotionRelegation = "promotionRelegation",
  ScoutReport = "scoutReport",
}

/**
 * A locale-agnostic inbox notification. Like MatchEvent, it carries STRUCTURED
 * params only — @fut/i18n / the UI composes the sentence in the user's locale.
 */
export interface InboxMessage {
  readonly id: string;
  readonly type: InboxMessageType;
  readonly date: SeasonDate;
  read: boolean;
  readonly params: Readonly<Record<string, string | number | boolean>>;
}
