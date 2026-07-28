import { describe, expect, it } from "vitest";
import type { RawSnapshot } from "../src/raw/RawSnapshot.js";
import { emptyEnrichment, type ClubEnrichment, type EnrichmentFile, type EnrichmentRecord, type PlayerEnrichment } from "../src/enrich/Enrichment.js";
import { planWork } from "../src/enrich/plan.js";
import { TheSportsDbSource, __testables } from "../src/sources/TheSportsDbSource.js";
import type { EnrichSink } from "../src/sources/Enricher.js";
import { clubSearchTerms } from "../src/resolve/matchEntities.js";

/**
 * The HTTP layer, against a STUBBED fetch — never the live API. These lock in
 * the quirks measured on the real service (empty-body 200s, mixed weight units,
 * a response key that changes per endpoint), which are exactly the things a
 * live-network test could not assert reliably.
 */

const { parseHeightCm, parseWeightKg, isSentinel, toClubEnrichment, toPlayerEnrichment } = __testables;

// --- stub plumbing ----------------------------------------------------------

interface Reply {
  readonly body?: unknown;
  /** Raw text wins over `body` — the only way to express a zero-byte 200. */
  readonly text?: string;
  readonly status?: number;
  readonly headers?: Record<string, string>;
}

function stubFetch(routes: (url: string) => Reply) {
  const calls: string[] = [];
  const at: number[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    at.push(Date.now());
    const r = routes(url);
    const status = r.status ?? 200;
    const text = r.text ?? (r.body === undefined ? "" : JSON.stringify(r.body));
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (k: string) => r.headers?.[k.toLowerCase()] ?? null },
      text: async () => text,
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { impl, calls, at };
}

function collector(): EnrichSink & { file: () => EnrichmentFile } {
  const clubs: Record<string, EnrichmentRecord<ClubEnrichment>> = {};
  const players: Record<string, EnrichmentRecord<PlayerEnrichment>> = {};
  return {
    club: (id, rec) => void (clubs[id] = { ...rec, depth: "roster", sourceVersion: "v" }),
    player: (id, rec) => void (players[id] = { ...rec, sourceVersion: "v" }),
    current: () => ({ source: "thesportsdb", version: "v", clubs, players }),
    file: () => ({ source: "thesportsdb", version: "v", clubs, players }),
  };
}

const SNAPSHOT: RawSnapshot = {
  primaryCompetitionId: "BRA1",
  competitions: [{ id: "BRA1", name: "Série A", type: "league", entrantClubIds: ["614"] }],
  clubs: [{ id: "614", name: "Sport Club Internacional", competitionIds: ["BRA1"] }],
  players: [
    { id: "1", name: "Alan Patrick", clubId: "614", position: "Attacking Midfield", dob: "Oct 9, 1991" },
    { id: "2", name: "Bruno Henrique", clubId: "614", position: "Central Midfield" },
  ],
};

const TEAM = { idTeam: "134281", strTeam: "Internacional", strSport: "Soccer", strLocation: "Porto Alegre", strStadium: "Beira-Rio", intStadiumCapacity: "50128", intFormedYear: "1909", strColour1: "FF0000", strColour2: "#FFFFFF", strBadge: "https://cdn/badge.png", strCountry: "Brazil" };

const plan = (snap: RawSnapshot = SNAPSHOT) => planWork(snap, emptyEnrichment("thesportsdb", "v1-1"));

const source = (impl: typeof fetch, over: Record<string, unknown> = {}) =>
  new TheSportsDbSource({ fetchImpl: impl, delayMs: 0, ...over });

// --- the quirks -------------------------------------------------------------

describe("TheSportsDbSource — HTTP layer", () => {
  it("treats a zero-byte 200 as 'endpoint unavailable', not as a crash", async () => {
    // This is literally how the free key answers searchplayers.php?t= — 200, no body.
    const { impl } = stubFetch((url) =>
      url.includes("searchteams") ? { body: { teams: [TEAM] } } : { text: "" },
    );
    const sink = collector();
    const out = await source(impl).run(SNAPSHOT, plan(), sink);

    expect(out.clubsMatched).toBe(1);
    expect(out.errors).toEqual([]); // no throw escaped
    expect(out.playersMissed).toBe(2); // recorded as misses, so a re-run skips them
    expect(sink.file().players["1"]!.status).toBe("notFound");
  });

  it("reads the single-player lookup's `players` key, not the list's `player`", async () => {
    const { impl } = stubFetch((url) => {
      if (url.includes("searchteams")) return { body: { teams: [TEAM] } };
      if (url.includes("lookup_all_players")) return { body: { player: [] } };
      if (url.includes("lookupplayer")) return { body: { players: [{ idPlayer: "9", strHeight: "1.78 m", strWeight: "192 lbs" }] } };
      return { body: {} };
    });
    const sink = collector();
    // A cached name-match with no physicals is exactly what a --deep run tops up.
    sink.player("1", { status: "matched", sourceId: "9", data: { photo: "u" }, depth: "name", fetchedAt: "t" });

    const deepPlan = planWork(SNAPSHOT, sink.current(), { deep: true, sourceVersion: "v1-1" });
    // planWork refetches on a version mismatch; the cached record is version "v".
    expect(deepPlan.players.some((p) => p.id === "1")).toBe(true);

    await source(impl).run(SNAPSHOT, { ...deepPlan, players: [{ id: "1", depth: "deep" }] }, sink);
    expect(sink.file().players["1"]!.data).toMatchObject({ heightCm: 178, weightKg: 87 });
  });

  it("backs off on a 429 and honours Retry-After, then succeeds", async () => {
    let teamCalls = 0;
    const { impl } = stubFetch((url) => {
      if (!url.includes("searchteams")) return { text: "" };
      teamCalls++;
      return teamCalls === 1 ? { status: 429, headers: { "retry-after": "0" } } : { body: { teams: [TEAM] } };
    });
    const out = await source(impl).run(SNAPSHOT, { ...plan(), players: [] }, collector());

    expect(teamCalls).toBe(2); // retried rather than giving up
    expect(out.clubsMatched).toBe(1);
  });

  it("gives up after repeated 5xx without throwing", async () => {
    const { impl, calls } = stubFetch(() => ({ status: 503 }));
    const out = await source(impl).run(SNAPSHOT, { ...plan(), players: [] }, collector());

    // 4 attempts per query, over the widening search terms for this club name.
    const terms = clubSearchTerms(SNAPSHOT.clubs[0]!);
    expect(calls.length).toBe(4 * terms.length);
    expect(out.clubsMissed).toBe(1);
    expect(out.errors).toEqual([]);
  });

  it("widens the query when the legal name finds nothing, and stops when it matches", async () => {
    // The live API returned nothing for Vasco's legal name and resolved on the
    // common one, so the enricher must widen rather than record a miss.
    const vasco: RawSnapshot = {
      ...SNAPSHOT,
      clubs: [{ id: "978", name: "Clube de Regatas Vasco da Gama", competitionIds: ["BRA1"] }],
      players: [],
    };
    const team = { idTeam: "134290", strTeam: "Vasco da Gama", strSport: "Soccer" };
    const { impl, calls } = stubFetch((url) =>
      url.endsWith(`t=${encodeURIComponent("Vasco da Gama")}`) ? { body: { teams: [team] } } : { body: { teams: [] } },
    );
    const sink = collector();
    await source(impl).run(vasco, plan(vasco), sink);

    expect(sink.file().clubs["978"]).toMatchObject({ status: "matched", sourceId: "134290" });
    expect(calls.length).toBe(2); // legal name, then the common one — then it stopped
  });

  it("paces calls to stay under the free tier's rate limit", async () => {
    // 404 short-circuits the retry loop, so this is one call per endpoint: the
    // team search, the roster, then a name search per unmatched player.
    const { impl, at } = stubFetch((url) => (url.includes("searchteams") ? { body: { teams: [TEAM] } } : { status: 404 }));
    await source(impl, { delayMs: 40 }).run(SNAPSHOT, plan(), collector());

    expect(at.length).toBe(4);
    for (let i = 1; i < at.length; i++) expect(at[i]! - at[i - 1]!).toBeGreaterThanOrEqual(35);
  });

  it("skips the sentinel teams the API pads results with", async () => {
    const { impl } = stubFetch((url) =>
      url.includes("searchteams")
        ? { body: { teams: [{ idTeam: "1", strTeam: "_Free Agent Soccer", strSport: "Soccer" }, TEAM] } }
        : { text: "" },
    );
    const sink = collector();
    await source(impl).run(SNAPSHOT, { ...plan(), players: [] }, sink);

    expect(sink.file().clubs["614"]!.sourceId).toBe("134281");
  });

  it("resolves from the roster listing without a per-player search", async () => {
    const { impl, calls } = stubFetch((url) => {
      if (url.includes("searchteams")) return { body: { teams: [TEAM] } };
      if (url.includes("lookup_all_players"))
        return { body: { player: [{ idPlayer: "77", idTeam: "134281", strPlayer: "Alan Patrick", strSport: "Soccer", dateBorn: "1991-10-09", strThumb: "https://cdn/p.png", strHeight: "1.75 m", strWeight: "70 kg" }] } };
      return { text: "" };
    });
    const sink = collector();
    const out = await source(impl).run(SNAPSHOT, plan(), sink);

    expect(out.playersMatched).toBe(1);
    expect(sink.file().players["1"]).toMatchObject({ depth: "roster", sourceId: "77" });
    expect(sink.file().players["1"]!.data).toMatchObject({ heightCm: 175, weightKg: 70, photo: "https://cdn/p.png" });
    // The roster answered player 1, so only the unmatched player 2 was searched.
    expect(calls.filter((c) => c.includes("searchplayers.php")).length).toBe(1);
  });

  it("refuses a name hit that belongs to a different club — the wrong-Pedro guard", async () => {
    const { impl } = stubFetch((url) => {
      if (url.includes("searchteams")) return { body: { teams: [TEAM] } };
      if (url.includes("lookup_all_players")) return { body: { player: [] } };
      // Same name, another club's idTeam.
      return { body: { player: [{ idPlayer: "500", idTeam: "999", strPlayer: "Alan Patrick", strSport: "Soccer" }] } };
    });
    const sink = collector();
    const out = await source(impl).run(SNAPSHOT, plan(), sink);

    expect(out.playersMatched).toBe(0);
    expect(sink.file().players["1"]!.status).toBe("notFound");
  });

  it("--no-names skips the expensive per-player pass entirely", async () => {
    const { impl, calls } = stubFetch((url) =>
      url.includes("searchteams") ? { body: { teams: [TEAM] } } : { body: { player: [] } },
    );
    await source(impl, { nameSearch: false }).run(SNAPSHOT, plan(), collector());

    expect(calls.some((c) => c.includes("searchplayers.php"))).toBe(false);
  });

  it("sends the key from the options, so a paid key needs no code change", async () => {
    const { impl, calls } = stubFetch(() => ({ status: 404 }));
    await source(impl, { key: "MYKEY" }).run(SNAPSHOT, { ...plan(), players: [] }, collector());

    expect(calls[0]).toContain("/api/v1/json/MYKEY/");
  });
});

// --- defensive parsing ------------------------------------------------------

describe("TheSportsDbSource — parsing the source's inconsistencies", () => {
  it("reads weight in whichever unit the record happens to use", () => {
    expect(parseWeightKg("71 kg")).toBe(71);
    expect(parseWeightKg("192 lbs")).toBe(87);
    expect(parseWeightKg("")).toBeUndefined();
    expect(parseWeightKg("unknown")).toBeUndefined();
  });

  it("reads height in cm, metres or feet/inches", () => {
    expect(parseHeightCm("178 cm")).toBe(178);
    expect(parseHeightCm("1.78 m")).toBe(178);
    expect(parseHeightCm("6 ft 1 in")).toBe(185);
    expect(parseHeightCm("—")).toBeUndefined();
  });

  it("recognises placeholder team names", () => {
    expect(isSentinel("_Free Agent Soccer")).toBe(true);
    expect(isSentinel("Internacional")).toBe(false);
    expect(isSentinel(undefined)).toBe(false);
  });

  it("keeps only real hex colours and normalises them", () => {
    const club = toClubEnrichment({ ...TEAM, strColour3: "red" });
    expect(club.colours).toEqual(["#FF0000", "#FFFFFF"]);
    expect(club).toMatchObject({ city: "Porto Alegre", stadium: "Beira-Rio", capacity: 50128, foundedYear: 1909 });
  });

  it("drops a non-ISO birthdate rather than emitting an unparseable one", () => {
    expect(toPlayerEnrichment({ dateBorn: "0000-00-00" }).birthDate).toBeUndefined();
    expect(toPlayerEnrichment({ dateBorn: "1991-10-09" }).birthDate).toBe("1991-10-09");
  });

  it("emits no stats — mergeSources concatenates them and would double the totals", () => {
    expect(toPlayerEnrichment({ strPlayer: "x" })).not.toHaveProperty("stats");
  });
});
