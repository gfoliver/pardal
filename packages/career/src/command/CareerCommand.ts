import type { Formation, Mentality } from "@fut/domain";

/**
 * The closed set of state mutations. Every change to a career flows through one
 * of these — serializable, ordered, and (for stochastic ones) seed-stamped — so
 * the command log fully reproduces a save and a server can re-apply/audit it.
 *
 * More commands (playFixture, makeOffer, renewContract, advanceDay …) join per
 * milestone; each new stochastic command carries its own `seed`.
 */
export type CareerCommand =
  | { readonly type: "readInbox"; readonly messageId: string }
  | { readonly type: "archiveInbox"; readonly messageId: string }
  | {
      readonly type: "setClubTactics";
      readonly clubId: string;
      readonly formation?: Formation;
      readonly mentality?: Mentality;
    };

export type CareerCommandType = CareerCommand["type"];
