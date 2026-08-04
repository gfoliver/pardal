import { describe, expect, it } from "vitest";
import { Position } from "@fut/domain";
import { SeededRandom } from "@fut/engine";
import { Career } from "@fut/career";
import { decideRenewal } from "../src/contract/renewal.js";
import { SquadStatus } from "../src/contract/Contract.js";
import { MIN_SQUAD } from "../src/squad/composition.js";
import { fixtureDataById, fixtureLeague } from "./fixtures.js";

/**
 * An AI club decides whether to re-sign a player, rather than renewing everyone forever.
 *
 * The old behaviour pushed every AI contract two seasons out unconditionally, which made the manager
 * the only person in the league who could ever lose anybody — a free transfer was something that
 * happened to him and to nobody else. These tests pin the two halves of the replacement: that a club
 * has reasons to say no, and that it never says no often enough to dissolve itself.
 */

const league = fixtureLeague();
const dataById = fixtureDataById(league);
/** Managed club is t0, so t1 is an AI club whose decisions we can inspect. */
const career = () => Career.create(league, { leagueId: "fic", managedClubId: "t0", seed: 5 });
const AI = "t1";

/** A stream that always says yes to a release, so a decision reflects the REASONS not the coin. */
const alwaysRelease = () => ({ chance: () => true, next: () => 0, int: () => 0 }) as unknown as SeededRandom;
const neverRelease = () => ({ chance: () => false, next: () => 1, int: () => 0 }) as unknown as SeededRandom;

/** Give an AI club enough depth that the composition floor is not the thing deciding. */
function padSquad(c: Career, clubId: string): void {
  const s = c.snapshot();
  const donor = Object.keys(s.clubs).find((id) => id !== clubId)!;
  const extra = s.clubs[donor]!.squad.playerIds.slice(0, 8);
  s.clubs[clubId]!.squad.playerIds = [...new Set([...s.clubs[clubId]!.squad.playerIds, ...extra])];
}

const someone = (c: Career, clubId: string) => c.snapshot().clubs[clubId]!.squad.playerIds[6]!;

describe("an AI club deciding on a renewal", () => {
  it("keeps a player it has no reason to let go", () => {
    const c = career();
    padSquad(c, AI);
    const id = someone(c, AI);
    const s = c.snapshot();
    // A key player on a fair wage, in his prime, is nobody's release candidate.
    s.contracts[id] = { ...s.contracts[id]!, squadStatus: SquadStatus.Key };
    s.playerDev[id] = { ...s.playerDev[id]!, ageAtSeasonStart: 26, currentAbility: 150, potentialAbility: 150 };

    expect(decideRenewal(s, dataById, id, alwaysRelease())).toEqual({ renew: true });
  });

  it("balks at a wage out of proportion to what he is worth", () => {
    const c = career();
    padSquad(c, AI);
    const id = someone(c, AI);
    const s = c.snapshot();
    // Demands are floored at the current wage, so a huge current wage IS the demand.
    s.contracts[id] = { ...s.contracts[id]!, squadStatus: SquadStatus.Backup, wage: s.contracts[id]!.wage * 50 };

    expect(decideRenewal(s, dataById, id, alwaysRelease())).toEqual({ renew: false, reason: "tooExpensive" });
  });

  it("indulges the same wage for a key player", () => {
    const c = career();
    padSquad(c, AI);
    const id = someone(c, AI);
    const s = c.snapshot();
    const rich = s.contracts[id]!.wage * 1.5;
    s.playerDev[id] = { ...s.playerDev[id]!, ageAtSeasonStart: 26, currentAbility: 150, potentialAbility: 150 };

    s.contracts[id] = { ...s.contracts[id]!, squadStatus: SquadStatus.Surplus, wage: rich };
    const asSurplus = decideRenewal(s, dataById, id, alwaysRelease());
    s.contracts[id] = { ...s.contracts[id]!, squadStatus: SquadStatus.Key, wage: rich };
    const asKey = decideRenewal(s, dataById, id, alwaysRelease());

    // Same money, different standing, different answer — which is the whole point of the tolerance.
    expect(asSurplus.renew).toBe(false);
    expect(asKey).toEqual({ renew: true });
  });

  it("lets a fading veteran go, but not a young player short of his ceiling", () => {
    const c = career();
    padSquad(c, AI);
    const id = someone(c, AI);
    const s = c.snapshot();
    s.contracts[id] = { ...s.contracts[id]!, squadStatus: SquadStatus.Rotation };

    s.playerDev[id] = { ...s.playerDev[id]!, ageAtSeasonStart: 34, currentAbility: 120, potentialAbility: 150 };
    expect(decideRenewal(s, dataById, id, alwaysRelease())).toEqual({ renew: false, reason: "declining" });

    // The same gap between ability and ceiling is true of almost every 20-year-old, and he is the
    // last person a club releases.
    s.playerDev[id] = { ...s.playerDev[id]!, ageAtSeasonStart: 20, currentAbility: 120, potentialAbility: 150 };
    expect(decideRenewal(s, dataById, id, alwaysRelease())).toEqual({ renew: true });
  });

  /** The floor, and the one rule that outranks every reason to say no. */
  it("never releases below the squad floor, however good the reason", () => {
    const c = career();
    const s = c.snapshot();
    s.clubs[AI]!.squad.playerIds = s.clubs[AI]!.squad.playerIds.slice(0, MIN_SQUAD);
    const id = s.clubs[AI]!.squad.playerIds[5]!;
    // Every reason at once.
    s.contracts[id] = { ...s.contracts[id]!, squadStatus: SquadStatus.Surplus, wage: s.contracts[id]!.wage * 50 };
    s.playerDev[id] = { ...s.playerDev[id]!, ageAtSeasonStart: 36, currentAbility: 80, potentialAbility: 150 };

    expect(decideRenewal(s, dataById, id, alwaysRelease())).toEqual({ renew: true });
  });

  /**
   * The group floor bites before the total does — 2+6+6+4 is 18 against a MIN_SQUAD of 16 — so a club
   * with plenty of players can still be unable to lose a particular one.
   */
  it("never leaves a line short, even with squad room to spare", () => {
    const c = career();
    padSquad(c, AI);
    const s = c.snapshot();
    const isKeeper = (id: string) => dataById.get(id)!.position === Position.Goalkeeper;
    const keepers = s.clubs[AI]!.squad.playerIds.filter(isKeeper);
    // Trim to exactly the minimum in that line, leaving every outfielder in place.
    const keep = keepers.slice(0, 2);
    s.clubs[AI]!.squad.playerIds = s.clubs[AI]!.squad.playerIds.filter((id) => !isKeeper(id) || keep.includes(id));
    expect(s.clubs[AI]!.squad.playerIds.length).toBeGreaterThan(MIN_SQUAD); // room on the total

    for (const id of keep) {
      s.contracts[id] = { ...s.contracts[id]!, squadStatus: SquadStatus.Surplus, wage: s.contracts[id]!.wage * 50 };
      expect(decideRenewal(s, dataById, id, alwaysRelease()), id).toEqual({ renew: true });
    }
    // And an outfielder in a deep line still can be, so the floor is not just refusing everything.
    const spare = s.clubs[AI]!.squad.playerIds.find((id) => !isKeeper(id))!;
    s.contracts[spare] = { ...s.contracts[spare]!, squadStatus: SquadStatus.Backup, wage: s.contracts[spare]!.wage * 50 };
    expect(decideRenewal(s, dataById, spare, alwaysRelease()).renew).toBe(false);
  });

  it("renews when the coin says so, even with a reason to refuse", () => {
    const c = career();
    padSquad(c, AI);
    const id = someone(c, AI);
    const s = c.snapshot();
    s.contracts[id] = { ...s.contracts[id]!, squadStatus: SquadStatus.Backup, wage: s.contracts[id]!.wage * 50 };

    // Having a reason is not the same as acting on it — the manager cannot count on a rival letting go.
    expect(decideRenewal(s, dataById, id, neverRelease())).toEqual({ renew: true });
  });

  it("is deterministic for the same career and season", () => {
    const run = () => {
      const c = Career.create(league, { leagueId: "fic", managedClubId: "t0", seed: 5 });
      c.rolloverSeason();
      const s = c.snapshot();
      return JSON.stringify({
        pool: [...(s.freeAgentIds ?? [])].sort(),
        squads: Object.fromEntries(Object.entries(s.clubs).map(([id, club]) => [id, club.squad.playerIds.length])),
      });
    };
    expect(run()).toBe(run());
  });

  it("does not let any AI club fall below the floor across several seasons", () => {
    const c = career();
    for (let i = 0; i < 4; i++) {
      let guard = 0;
      while (!c.seasonComplete && guard++ < 2_000) c.advance();
      c.rolloverSeason();
      const s = c.snapshot();
      for (const [id, club] of Object.entries(s.clubs)) {
        if (id === s.managedClubId) continue; // the manager has no floor, by design
        expect(club.squad.playerIds.length, `${id} after season ${i + 1}`).toBeGreaterThanOrEqual(MIN_SQUAD);
      }
    }
  });

  it("actually releases somebody — the league is not still renewing everyone", () => {
    const c = career();
    for (let i = 0; i < 3; i++) {
      let guard = 0;
      while (!c.seasonComplete && guard++ < 2_000) c.advance();
      c.rolloverSeason();
    }
    const s = c.snapshot();
    const fromAi = (s.freeAgentIds ?? []).filter((id) => !league.teams[0]!.players.some((p) => p.id === id));
    expect(fromAi.length).toBeGreaterThan(0);
  });
});
