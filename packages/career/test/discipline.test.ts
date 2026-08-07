import { describe, expect, it } from "vitest";
import { CardColor, MatchEventType, type MatchEvent, type MatchResult } from "@fut/engine";
import {
  applyMatchCards,
  Career,
  newPlayerDev,
  isAvailable,
  serveSuspension,
  SECOND_YELLOW_BAN_MATCHES,
  STRAIGHT_RED_BAN_MATCHES,
  YELLOW_ACCUMULATION_BAN_MATCHES,
  YELLOW_ACCUMULATION_LIMIT,
} from "@fut/career";
import { InboxMessageType } from "../src/inbox/types.js";
import { fixtureLeague } from "./fixtures.js";

/**
 * A card had no consequence past the final whistle: `PlayerDev.suspension` was declared, `isAvailable`
 * refused to pick a suspended player, and nothing ever wrote one. These are the middle — emit, record,
 * serve, expire.
 */

const card = (playerId: string, color: CardColor, reason?: string): MatchEvent => ({
  minute: 30,
  type: MatchEventType.Card,
  teamId: "t0",
  playerId,
  playerName: playerId,
  params: reason ? { color, reason } : { color },
});

/** A result carrying nothing but a timeline — everything else the career reads is optional to it. */
const resultWith = (timeline: MatchEvent[]): MatchResult =>
  ({ homeScore: 0, awayScore: 0, timeline, discipline: { yellowCards: 0, redCards: 0, byPlayer: {} } }) as unknown as MatchResult;

const devsFor = (...ids: string[]) => new Map(ids.map((id) => [id, newPlayerDev(id, 100, 100, 25)]));

describe("a card becomes a ban", () => {
  it("bans a straight red for longer than a second yellow", () => {
    const devs = devsFor("a", "b");
    applyMatchCards(resultWith([card("a", CardColor.Red, "violentConduct"), card("b", CardColor.Red, "secondYellow")]), "league", devs);

    expect(devs.get("a")!.suspension).toEqual({ competitionId: "league", gamesLeft: STRAIGHT_RED_BAN_MATCHES });
    expect(devs.get("b")!.suspension).toEqual({ competitionId: "league", gamesLeft: SECOND_YELLOW_BAN_MATCHES });
    // The distinction is the point of reading the reason at all.
    expect(STRAIGHT_RED_BAN_MATCHES).toBeGreaterThan(SECOND_YELLOW_BAN_MATCHES);
  });

  it("takes the reason from the timeline, which is the only place it exists", () => {
    // `discipline.byPlayer` says `red: boolean` and nothing more, so a reader built on it cannot tell
    // these two apart — this is the assertion that pins the choice of source.
    const devs = devsFor("a");
    applyMatchCards(resultWith([card("a", CardColor.Red)]), "league", devs);
    // No reason given → treated as a straight red, the harsher reading of a dismissal.
    expect(devs.get("a")!.suspension!.gamesLeft).toBe(STRAIGHT_RED_BAN_MATCHES);
  });

  it("makes the player unselectable, which is what the manager actually feels", () => {
    const devs = devsFor("a");
    expect(isAvailable(devs.get("a")!)).toBe(true);
    applyMatchCards(resultWith([card("a", CardColor.Red, "violentConduct")]), "league", devs);
    expect(isAvailable(devs.get("a")!)).toBe(false);
  });

  it("adds a second offence to an unserved ban rather than replacing it", () => {
    const devs = devsFor("a");
    applyMatchCards(resultWith([card("a", CardColor.Red, "secondYellow")]), "league", devs);
    applyMatchCards(resultWith([card("a", CardColor.Red, "violentConduct")]), "league", devs);
    expect(devs.get("a")!.suspension!.gamesLeft).toBe(SECOND_YELLOW_BAN_MATCHES + STRAIGHT_RED_BAN_MATCHES);
  });

  it("survives a result with no discipline record and no cards", () => {
    const devs = devsFor("a");
    expect(() => applyMatchCards({ timeline: [] } as unknown as MatchResult, "league", devs)).not.toThrow();
    expect(() => applyMatchCards({} as unknown as MatchResult, "league", devs)).not.toThrow();
    expect(devs.get("a")!.suspension).toBeUndefined();
  });
});

describe("accumulated yellows", () => {
  it("bans on the limit-th booking and starts the tally over", () => {
    const devs = devsFor("a");
    const dev = devs.get("a")!;
    for (let i = 1; i < YELLOW_ACCUMULATION_LIMIT; i++) {
      applyMatchCards(resultWith([card("a", CardColor.Yellow)]), "league", devs);
      expect(dev.suspension, `after ${i} bookings`).toBeUndefined();
      expect(dev.yellowAccumulation.league).toBe(i);
    }
    applyMatchCards(resultWith([card("a", CardColor.Yellow)]), "league", devs);
    expect(dev.suspension!.gamesLeft).toBe(YELLOW_ACCUMULATION_BAN_MATCHES);
    expect(dev.yellowAccumulation.league).toBe(0);
  });

  it("keeps a tally per competition — a cup booking does not move a league ban closer", () => {
    const devs = devsFor("a");
    const dev = devs.get("a")!;
    for (let i = 0; i < YELLOW_ACCUMULATION_LIMIT; i++) {
      applyMatchCards(resultWith([card("a", CardColor.Yellow)]), i === 0 ? "cup" : "league", devs);
    }
    expect(dev.suspension).toBeUndefined();
    expect(dev.yellowAccumulation).toEqual({ cup: 1, league: YELLOW_ACCUMULATION_LIMIT - 1 });
  });

  /** The CBF rule: the bookings that produced a sending-off do not also count toward accumulation. */
  it("does not let a second-yellow sending-off also push the tally along", () => {
    const devs = devsFor("a");
    const dev = devs.get("a")!;
    applyMatchCards(resultWith([card("a", CardColor.Yellow), card("a", CardColor.Red, "secondYellow")]), "league", devs);
    expect(dev.yellowAccumulation.league).toBe(0);
    expect(dev.suspension!.gamesLeft).toBe(SECOND_YELLOW_BAN_MATCHES);
  });
});

describe("serving a ban", () => {
  it("counts down one match at a time and then clears", () => {
    const dev = newPlayerDev("a", 100, 100, 25);
    dev.suspension = { competitionId: "league", gamesLeft: 2 };
    serveSuspension(dev, "league");
    expect(dev.suspension).toEqual({ competitionId: "league", gamesLeft: 1 });
    serveSuspension(dev, "league");
    // Cleared, not left at zero: `suspension` present always means "cannot play".
    expect(dev.suspension).toBeUndefined();
    expect(isAvailable(dev)).toBe(true);
  });

  it("is not served by a fixture in another competition", () => {
    const dev = newPlayerDev("a", 100, 100, 25);
    dev.suspension = { competitionId: "league", gamesLeft: 1 };
    serveSuspension(dev, "cup");
    expect(dev.suspension!.gamesLeft).toBe(1);
  });
});

// --- end to end, through a real season ------------------------------------
const career = () => Career.create(fixtureLeague(), { leagueId: "fic", managedClubId: "t0", seed: 9 });

/** The first unplayed fixture the managed club is in, with the competition it belongs to. */
function nextUser(c: Career) {
  const u = c.nextUserFixture();
  if (!u) throw new Error("no user fixture");
  return u;
}

describe("the season serves what it hands out", () => {
  it("stops the club selecting a sent-off player for the next round", () => {
    const c = career();
    const u = nextUser(c);
    const victim = c.snapshot().clubs.t0!.squad.playerIds[5]!;
    c.commitUserFixture(u.comp, u.fixture, resultWith([card(victim, CardColor.Red, "violentConduct")]));

    const dev = c.snapshot().playerDev[victim]!;
    expect(dev.suspension).toEqual({ competitionId: u.comp.id, gamesLeft: STRAIGHT_RED_BAN_MATCHES });
    // The squad screen must be able to say WHY he cannot play, not merely that he cannot.
    const row = c.squad().find((e) => e.playerId === victim)!;
    expect(row).toMatchObject({ available: false, injured: false, suspended: true, suspensionGamesLeft: STRAIGHT_RED_BAN_MATCHES });
    expect(c.playerDetail(victim)).toMatchObject({ suspended: true });
    // ...and the manager is told.
    const mail = c.inbox().find((m) => m.type === InboxMessageType.PlayerSuspended);
    expect(mail!.params).toMatchObject({ playerId: victim, cause: "straightRed", matches: STRAIGHT_RED_BAN_MATCHES });
  });

  it("counts the ban down over the club's own fixtures until it expires", () => {
    const c = career();
    const u = nextUser(c);
    const victim = c.snapshot().clubs.t0!.squad.playerIds[5]!;
    c.commitUserFixture(u.comp, u.fixture, resultWith([card(victim, CardColor.Red, "violentConduct")]));

    for (let served = 1; served <= STRAIGHT_RED_BAN_MATCHES; served++) {
      const next = nextUser(c);
      c.commitUserFixture(next.comp, next.fixture, resultWith([]));
      const left = STRAIGHT_RED_BAN_MATCHES - served;
      expect(c.snapshot().playerDev[victim]!.suspension?.gamesLeft, `after ${served}`).toBe(left || undefined);
    }
    expect(c.squad().find((e) => e.playerId === victim)!.available).toBe(true);
  });

  /**
   * The bug this repo has already been bitten by once, in `computeStandings`: the same fixture recorded
   * twice silently doubled a league's points. `commitUserFixture` is driven by a UI, so a retry or a
   * double-tap is not hypothetical — and two bans for one red, or two matches served for somebody
   * else's, are the same class of mistake.
   */
  it("cannot double-count a ban when the same fixture is recorded twice", () => {
    const c = career();
    const u = nextUser(c);
    const victim = c.snapshot().clubs.t0!.squad.playerIds[5]!;
    const result = resultWith([card(victim, CardColor.Red, "violentConduct")]);
    c.commitUserFixture(u.comp, u.fixture, result);
    c.commitUserFixture(u.comp, u.fixture, result);

    expect(c.snapshot().playerDev[victim]!.suspension!.gamesLeft).toBe(STRAIGHT_RED_BAN_MATCHES);
    expect(c.inbox().filter((m) => m.type === InboxMessageType.PlayerSuspended)).toHaveLength(1);
    // The ledger the guard reads holds the fixture once, and the table is unmoved by the second copy.
    expect(c.snapshot().competitions[0]!.playedFixtureIndexes.filter((i) => i === u.fixture.fixtureIndex)).toHaveLength(1);
  });

  it("cannot serve someone else's ban twice on a re-record", () => {
    const c = career();
    const first = nextUser(c);
    const victim = c.snapshot().clubs.t0!.squad.playerIds[5]!;
    c.commitUserFixture(first.comp, first.fixture, resultWith([card(victim, CardColor.Red, "violentConduct")]));

    const second = nextUser(c);
    const clean = resultWith([]);
    c.commitUserFixture(second.comp, second.fixture, clean);
    c.commitUserFixture(second.comp, second.fixture, clean);
    expect(c.snapshot().playerDev[victim]!.suspension!.gamesLeft).toBe(STRAIGHT_RED_BAN_MATCHES - 1);
  });

  it("carries an unserved ban into the next season, and resets the yellow tally", () => {
    const c = career();
    c.simulateSeason();
    const victim = c.snapshot().clubs.t0!.squad.playerIds[5]!;
    const dev = c.snapshot().playerDev[victim]!;
    dev.suspension = { competitionId: "league", gamesLeft: 2 };
    dev.yellowAccumulation = { league: 2 };
    c.rolloverSeason();

    const after = c.snapshot().playerDev[victim]!;
    // A red in the final round used to cost nothing at all — the rollover wiped it.
    expect(after.suspension).toEqual({ competitionId: "league", gamesLeft: 2 });
    expect(after.yellowAccumulation).toEqual({});
  });

  /**
   * A ban names its competition, and a club that changes division stops playing it. Left alone, the
   * player is unavailable for the rest of his career and nothing on screen explains why.
   */
  it("drops a ban in a competition the player's club no longer plays", () => {
    const c = career();
    c.simulateSeason();
    const victim = c.snapshot().clubs.t0!.squad.playerIds[5]!;
    c.snapshot().playerDev[victim]!.suspension = { competitionId: "a-league-he-left", gamesLeft: 3 };
    c.rolloverSeason();
    expect(c.snapshot().playerDev[victim]!.suspension).toBeUndefined();
  });

  it("still runs a whole quick-simmed season with bans in play", () => {
    const c = career();
    expect(() => c.simulateSeason()).not.toThrow();
    const comp = c.snapshot().competitions[0]!;
    expect(comp.playedFixtureIndexes.length).toBe(comp.fixtures.length);
    // Cards actually happened, so the path above was exercised rather than merely present.
    const booked = Object.values(c.snapshot().playerDev).filter((d) => Object.values(d.yellowAccumulation ?? {}).some((n) => n > 0));
    expect(booked.length).toBeGreaterThan(0);
  });
});
