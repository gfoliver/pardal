import { describe, expect, it } from "vitest";
import { Position } from "@fut/domain";
import { loadPlayer } from "@fut/competition";
import {
  birthYearOf,
  clubKits,
  emit,
  emptyEnrichment,
  enrichmentToPartial,
  inferPlayer,
  isoBirthDate,
  normalizeSnapshot,
  seasonYearOf,
  type EnrichmentFile,
  type NormalizedPlayer,
  type RawSnapshot,
} from "@fut/dataset";
import { mergeSources } from "../src/sources/mergeSources.js";

/**
 * What the enrichment layer is actually FOR: better inputs to inference and to
 * emit. These assert the downstream effects, not the fetching.
 */

const SNAPSHOT: RawSnapshot = {
  primaryCompetitionId: "BRA1",
  competitions: [{ id: "BRA1", name: "Série A", type: "league", seasonId: "2025", entrantClubIds: ["c1"] }],
  clubs: [{ id: "c1", name: "Clube Um", competitionIds: ["BRA1"] }],
  players: [
    { id: "p1", name: "Um", clubId: "c1", position: "Centre-Forward", dob: "Oct 9, 1998" },
    { id: "p2", name: "Dois", clubId: "c1", position: "Left-Back", dob: "2003-04-01" },
  ],
};

describe("age — the two parsing bugs the real data exposed", () => {
  it("reads a birth year from both formats a source hands us", () => {
    expect(birthYearOf("1998-10-09")).toBe(1998);
    expect(birthYearOf("Oct 9, 1998")).toBe(1998); // used to fall through to the default age
    expect(birthYearOf("October 9, 1998")).toBe(1998);
    expect(birthYearOf("0000-00-00")).toBeUndefined();
    expect(birthYearOf(undefined)).toBeUndefined();
  });

  it("normalises a full birth date, which is what cross-source matching joins on", () => {
    expect(isoBirthDate("May 6, 1994")).toBe("1994-05-06"); // the Maripán case
    expect(isoBirthDate("Oct 9, 1998")).toBe("1998-10-09");
    expect(isoBirthDate("1998-10-09")).toBe("1998-10-09");
    expect(isoBirthDate("0000-00-00")).toBeUndefined();
    expect(isoBirthDate("sometime in 1998")).toBeUndefined(); // a year is not a date
    expect(isoBirthDate(undefined)).toBeUndefined();
  });

  it("dates the snapshot from its own season, not from a hardcoded year", () => {
    expect(seasonYearOf(SNAPSHOT)).toBe(2025);
    expect(seasonYearOf({ ...SNAPSHOT, competitions: [{ ...SNAPSHOT.competitions[0]!, seasonId: "2028/29" }] })).toBe(2028);
  });

  it("falls back to the latest market-value observation when there is no season", () => {
    const noSeason: RawSnapshot = {
      ...SNAPSHOT,
      competitions: [{ id: "BRA1", name: "Série A", type: "league", entrantClubIds: ["c1"] }],
      players: [{ ...SNAPSHOT.players[0]!, marketValueHistory: [{ date: "2019-01-01" }, { date: "2027-06-01" }] }],
    };
    expect(seasonYearOf(noSeason)).toBe(2027);
  });

  it("ages players against that year, so a 'Mon D, YYYY' dob no longer defaults to 25", () => {
    const [p1, p2] = normalizeSnapshot(SNAPSHOT);
    expect(p1!.ageYears).toBe(27);
    expect(p2!.ageYears).toBe(22);
  });

  it("still prefers an age the source stated outright", () => {
    const stated = normalizeSnapshot({ ...SNAPSHOT, players: [{ ...SNAPSHOT.players[0]!, age: 31 }] });
    expect(stated[0]!.ageYears).toBe(31);
  });
});

describe("build — a trade-off, not a free bonus", () => {
  const base = (over: Partial<NormalizedPlayer>): NormalizedPlayer =>
    ({
      id: "p", name: "p", clubId: "c", position: Position.CentreBack, positionGroup: 1 as never,
      nationality: ["Brazil"], secondaryPositions: [], marketValueEur: 1e6, valuePct: 0.5,
      appearancePct: 0.5, appearances: 20, per90: { goals: 0, assists: 0, cards: 0 },
      minutesShare: 0.5, minutes: 900, ageYears: 25, heightCm: 180,
      ...over,
    }) as NormalizedPlayer;

  it("mass buys strength and costs agility and pace", () => {
    const light = inferPlayer(base({ weightKg: 68 }));
    const heavy = inferPlayer(base({ weightKg: 88 }));

    expect(heavy.physical.strength.value).toBeGreaterThan(light.physical.strength.value);
    expect(heavy.physical.agility.value).toBeLessThan(light.physical.agility.value);
    expect(heavy.physical.pace.value).toBeLessThan(light.physical.pace.value);
  });

  it("reads build as BMI, so the same mass means different things at different heights", () => {
    const tall = inferPlayer(base({ weightKg: 85, heightCm: 195 }));
    const short = inferPlayer(base({ weightKg: 85, heightCm: 172 }));
    expect(short.physical.strength.value).toBeGreaterThan(tall.physical.strength.value);
  });

  it("leaves a player with no weight exactly as it found them", () => {
    const withWeight = inferPlayer(base({ weightKg: 78, heightCm: 180 })); // BMI ~24, above neutral
    const without = inferPlayer(base({ weightKg: undefined }));
    expect(withWeight.physical.strength.value).not.toBe(without.physical.strength.value);
  });
});

describe("kits — real colours before a random palette", () => {
  it("keeps a curated kit, because only curation carries the pattern", () => {
    expect(clubKits("614", ["#00FF00"]).home.pattern).toBe("hoops");
    expect(clubKits("614", ["#00FF00"]).home.primary).toBe("#C52613");
  });

  it("dresses an unknown club in its own colours when a source supplied them", () => {
    const kits = clubKits("99999", ["#123456", "#ABCDEF"]);
    expect(kits.home.primary).toBe("#123456");
    expect(kits.away.primary).toBe("#ABCDEF");
  });

  it("ignores colour names the API sometimes emits instead of hex", () => {
    const kits = clubKits("99999", ["red", "blue"]);
    expect(kits.home.primary).not.toBe("red");
    expect(kits.home.primary).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it("falls back deterministically when there is nothing at all", () => {
    expect(clubKits("99999")).toEqual(clubKits("99999", []));
  });
});

describe("enrichment reaching the emitted dataset", () => {
  const enrichment: EnrichmentFile = {
    ...emptyEnrichment("thesportsdb", "v1-1"),
    clubs: {
      c1: {
        status: "matched", sourceId: "1", depth: "roster", fetchedAt: "t", sourceVersion: "v1-1",
        data: { city: "Porto Alegre", stadium: "Beira-Rio", capacity: 50128, colours: ["#D9232E", "#FFFFFF"] },
      },
    },
    players: {
      p1: {
        status: "matched", sourceId: "9", depth: "roster", fetchedAt: "t", sourceVersion: "v1-1",
        data: { photo: "https://cdn/p1.png", birthDate: "1998-10-09", heightCm: 183, weightKg: 79, position: "Defender" },
      },
    },
  };

  const merged = mergeSources([SNAPSHOT, enrichmentToPartial(SNAPSHOT, enrichment)]);

  it("carries the portrait URL through to PlayerData", () => {
    const { league } = emit(merged, merged.players.map((p) => inferPlayer(normalizeSnapshot(merged).find((n) => n.id === p.id)!)));
    const players = league.teams[0]!.players;
    expect(players.find((p) => p.id === "p1")!.photo).toBe("https://cdn/p1.png");
    expect(players.find((p) => p.id === "p2")!.photo).toBeUndefined(); // no photo, no key
  });

  it("fills the club fields our squad source leaves empty", () => {
    const { world } = emit(merged, []);
    const club = world.clubs[0]!;
    expect(club).toMatchObject({ city: "Porto Alegre", stadium: "Beira-Rio", capacity: 50128 });
    expect(club.kits!.home.primary).toBe("#D9232E");
  });

  it("upgrades the free-text birthdate to the ISO one", () => {
    expect(merged.players.find((p) => p.id === "p1")!.dob).toBe("1998-10-09");
  });

  it("refuses a generic position label as a natural position", () => {
    // "Defender" would resolve to centre-back and make this striker fit there.
    expect(merged.players.find((p) => p.id === "p1")!.secondaryPositions).toBeUndefined();
  });

  /**
   * `naturalPositions` REPLACES the loader's `[position]` default, so a list
   * that omits the player's own position makes them out of position at it —
   * an 0.85 penalty on their primary role. Latent until enrichment first
   * populated the field.
   */
  it("leads naturalPositions with the player's own position", () => {
    const secondOpinion = mergeSources([
      SNAPSHOT,
      enrichmentToPartial(SNAPSHOT, {
        ...enrichment,
        players: { p1: { ...enrichment.players.p1!, data: { ...enrichment.players.p1!.data, position: "Attacking Midfield" } } },
      }),
    ]);
    const inferred = normalizeSnapshot(secondOpinion).map(inferPlayer);
    const emitted = emit(secondOpinion, inferred).league.teams[0]!.players.find((p) => p.id === "p1")!;

    expect(emitted.naturalPositions![0]).toBe(emitted.position);
    expect(emitted.naturalPositions).toContain("attackingMidfielder");
    // The consequence that matters: no out-of-position debuff at their own spot.
    expect(loadPlayer(emitted).familiarity(emitted.position as Position)).toBe(1);
  });

  it("omits naturalPositions entirely when there is nothing to add", () => {
    const plain = emit(SNAPSHOT, normalizeSnapshot(SNAPSHOT).map(inferPlayer));
    expect(plain.league.teams[0]!.players.every((p) => p.naturalPositions === undefined)).toBe(true);
  });

  it("accepts a specific one", () => {
    const specific = enrichmentToPartial(SNAPSHOT, {
      ...enrichment,
      players: { p1: { ...enrichment.players.p1!, data: { ...enrichment.players.p1!.data, position: "Left Winger" } } },
    });
    expect(specific.players![0]!.secondaryPositions).toEqual(["Left Winger"]);
  });
});
