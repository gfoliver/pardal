import { CardColor, MatchEventType, type MatchEvent, type MatchResult } from "@fut/engine";
import type { PlayerDev } from "../development/PlayerDev.js";

/**
 * What a card costs a player once the whistle has gone.
 *
 * Both engines emit cards and both aggregate them into `MatchResult.discipline`, and until this
 * module existed neither ever left the ninety minutes: `PlayerDev.suspension` was declared,
 * `isAvailable` refused to pick a suspended player, and nothing ever wrote a suspension. A red card
 * was a man down for the rest of THAT match and nothing at all afterwards.
 *
 * Read from the TIMELINE rather than from `discipline.byPlayer`, which is the whole reason this is a
 * module and not two lines. Three things only the timeline has:
 *
 *  - **The reason.** `byPlayer` says `red: boolean`; the Card event says `violentConduct` or
 *    `secondYellow`, and those are different offences carrying different bans. A ban length picked
 *    without the reason is a coin flip dressed as a rule.
 *  - **Order.** A second yellow arrives as ONE red event, and the first of its two bookings arrived
 *    earlier as a yellow event. Counting `byPlayer.yellow` instead would add both to the running
 *    tally, so a sending-off would ALSO push the player two thirds of the way to an accumulation ban.
 *  - **Per-card granularity.** `byPlayer` collapses a match into a count; the tally has to move one
 *    booking at a time to know which one crossed the line.
 *
 * `byPlayer` stays the right thing for the match rating (see `computeMatchLines`), which only ever
 * wants "how bad was his afternoon".
 */

/**
 * A straight red — the engines' only such offence is violent conduct.
 *
 * Two matches, not one. The CBF's automatic penalty for a sending-off is a single match and the STJD
 * then hears the serious ones, which routinely land at two or more; violent conduct is squarely in
 * that group. One match would also make a straight red and a second yellow cost exactly the same,
 * which erases the distinction the referee just drew — and the reason the engine bothers to report.
 */
export const STRAIGHT_RED_BAN_MATCHES = 2;

/**
 * A sending-off for two bookings. One match, the automatic minimum, with no hearing behind it.
 */
export const SECOND_YELLOW_BAN_MATCHES = 1;

/**
 * Bookings in one competition before the player sits a match out. Three, as the Brasileirão runs it.
 *
 * Per COMPETITION, which is what `PlayerDev.yellowAccumulation` was always keyed by: a yellow in the
 * cup does not move a player toward a league ban, and the two tallies run independently.
 */
export const YELLOW_ACCUMULATION_LIMIT = 3;

/** What crossing {@link YELLOW_ACCUMULATION_LIMIT} costs. */
export const YELLOW_ACCUMULATION_BAN_MATCHES = 1;

/** Why a player is banned — carried into the inbox so the mail can say which it was. */
export type SuspensionCause = "straightRed" | "secondYellow" | "yellowAccumulation";

/** A ban this match created, for the caller to report. */
export interface SuspensionIssued {
  readonly playerId: string;
  readonly competitionId: string;
  readonly cause: SuspensionCause;
  readonly matches: number;
}

/** The Card events of a result, in the order they were shown. Tolerates a result with no timeline. */
function cardEvents(result: MatchResult): readonly MatchEvent[] {
  return (result.timeline ?? []).filter((e) => e.type === MatchEventType.Card && Boolean(e.playerId));
}

/**
 * Put `matches` on a player's ban in a competition.
 *
 * Within one competition bans ADD, which is the case that actually happens: a man carrying a match for
 * accumulated bookings who is then sent off owes both, and overwriting would let the second offence pay
 * for the first.
 *
 * Across competitions the new ban REPLACES the old, because `Suspension` holds one competitionId. Today
 * that is unreachable — a career generates league competitions only and a club plays exactly one — so
 * the alternative is a per-competition ledger built for a cup that does not exist yet. If cups are ever
 * generated, this is the line to change, and the change is `Suspension` becoming a record keyed the way
 * `yellowAccumulation` already is.
 */
function ban(dev: PlayerDev, competitionId: string, matches: number): void {
  const carried = dev.suspension?.competitionId === competitionId ? dev.suspension.gamesLeft : 0;
  dev.suspension = { competitionId, gamesLeft: carried + matches };
  // The tally resets with the ban it produced — and also when a red ends the same player's afternoon,
  // because a man serving a suspension is not simultaneously accumulating toward another one.
  (dev.yellowAccumulation ??= {})[competitionId] = 0;
}

/**
 * Book and ban every player this match's cards apply to, in one competition.
 *
 * Returns the bans it created so the caller can tell the manager about his own players. Players with
 * no dev record are skipped: a card is a fact about a career player, and there is nothing to write on.
 *
 * NOT idempotent by itself — running it twice for one fixture doubles every ban. The caller owns that
 * (see `CareerRunner.markPlayed`), for the same reason `computeStandings` deduplicates rather than
 * trusting its input: this repo has already been bitten by one fixture recorded twice.
 */
export function applyMatchCards(
  result: MatchResult,
  competitionId: string,
  devById: ReadonlyMap<string, PlayerDev>,
): SuspensionIssued[] {
  const issued: SuspensionIssued[] = [];
  for (const e of cardEvents(result)) {
    const dev = devById.get(e.playerId!);
    if (!dev) continue;
    const add = (cause: SuspensionCause, matches: number) => {
      ban(dev, competitionId, matches);
      issued.push({ playerId: dev.playerId, competitionId, cause, matches });
    };

    if (e.params?.color === CardColor.Red) {
      if (e.params.reason === "secondYellow") {
        /*
         * The bookings that made this red do not ALSO push him toward an accumulation ban: the ban
         * this issues zeroes the competition's tally, which rolls back the first yellow of the pair
         * (the second never reached the tally — it arrived as this red). That is the CBF's rule and it
         * falls out of the zeroing rather than needing a correction of its own.
         *
         * The one case it does not reproduce exactly: a player already on two who is booked and then
         * sent off in the same match serves the accumulation ban AND this one. Two punishments for
         * three bookings is over-strict by the letter and defensible in spirit; modelling the letter
         * would mean the third yellow retroactively un-happening, which is not worth the machinery.
         */
        add("secondYellow", SECOND_YELLOW_BAN_MATCHES);
      } else {
        add("straightRed", STRAIGHT_RED_BAN_MATCHES);
      }
      continue;
    }

    // A save written before this ran has no tally at all, and a fabricated `PlayerDev` in a test may
    // not have the map: default the COUNT, never the identity of the competition.
    const tally = ((dev.yellowAccumulation ??= {})[competitionId] ?? 0) + 1;
    dev.yellowAccumulation[competitionId] = tally;
    if (tally >= YELLOW_ACCUMULATION_LIMIT) add("yellowAccumulation", YELLOW_ACCUMULATION_BAN_MATCHES);
  }
  return issued;
}

/**
 * Serve one match of a ban, if the player is carrying one IN this competition.
 *
 * A ban is counted down in matches his club actually plays, not in days — which is why this is driven
 * by a fixture being settled and not by the calendar. A cup tie does not serve a league ban.
 */
export function serveSuspension(dev: PlayerDev, competitionId: string): void {
  const s = dev.suspension;
  if (!s || s.competitionId !== competitionId) return;
  const gamesLeft = s.gamesLeft - 1;
  // Cleared rather than left at zero, so `suspension` present always means "cannot play".
  dev.suspension = gamesLeft > 0 ? { ...s, gamesLeft } : undefined;
}
