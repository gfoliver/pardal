import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RawSnapshot } from "../src/raw/RawSnapshot.js";
import { emptyEnrichment, type EnrichmentFile, type EnrichmentRecord, type PlayerEnrichment } from "../src/enrich/Enrichment.js";
import { planWork } from "../src/enrich/plan.js";
import { EnrichmentStore, enrichmentPath, readEnrichment, writeEnrichment } from "../src/enrich/EnrichmentStore.js";
import { enrichmentToPartial } from "../src/enrich/enrichmentToPartial.js";
import { mergeSources } from "../src/sources/mergeSources.js";

const SRC = "thesportsdb";
const V = "1";

function snapshot(players: number, clubs = 1): RawSnapshot {
  return {
    primaryCompetitionId: "L1",
    competitions: [{ id: "L1", name: "L1", type: "league", entrantClubIds: ["c1"] }],
    clubs: Array.from({ length: clubs }, (_, i) => ({ id: `c${i + 1}`, name: `Club ${i + 1}`, competitionIds: ["L1"] })),
    players: Array.from({ length: players }, (_, i) => ({
      id: `p${String(i + 1).padStart(2, "0")}`,
      name: `Player ${i + 1}`,
      clubId: "c1",
      position: "Central Midfield",
    })),
  };
}

const matched = (data: PlayerEnrichment, depth: EnrichmentRecord<PlayerEnrichment>["depth"] = "roster"): EnrichmentRecord<PlayerEnrichment> => ({
  status: "matched", data, sourceId: "x", depth, fetchedAt: "2026-01-01T00:00:00.000Z", sourceVersion: V,
});
const miss = (): EnrichmentRecord<PlayerEnrichment> => ({
  status: "notFound", depth: "name", fetchedAt: "2026-01-01T00:00:00.000Z", sourceVersion: V,
});

describe("planWork — the resume logic", () => {
  it("plans everything when nothing is cached", () => {
    const plan = planWork(snapshot(3), emptyEnrichment(SRC, V));
    expect(plan.clubs).toEqual(["c1"]);
    expect(plan.players.map((p) => p.id)).toEqual(["p01", "p02", "p03"]);
    expect(plan.skipped).toEqual({ alreadyDone: 0, knownMisses: 0 });
  });

  it("skips what a previous run already did — the whole point of the layer", () => {
    const cached: EnrichmentFile = {
      ...emptyEnrichment(SRC, V),
      clubs: { c1: { status: "matched", data: { city: "Rio" }, depth: "roster", fetchedAt: "t", sourceVersion: V } },
      players: { p01: matched({ photo: "u" }), p02: matched({ photo: "u" }) },
    };
    const plan = planWork(snapshot(3), cached);
    expect(plan.clubs).toEqual([]);
    expect(plan.players.map((p) => p.id)).toEqual(["p03"]);
    expect(plan.skipped.alreadyDone).toBe(3); // 1 club + 2 players
  });

  it("remembers a miss instead of re-querying it every run", () => {
    const cached: EnrichmentFile = { ...emptyEnrichment(SRC, V), players: { p01: miss() } };
    const plan = planWork(snapshot(2), cached);
    expect(plan.players.map((p) => p.id)).toEqual(["p02"]);
    expect(plan.skipped.knownMisses).toBe(1);
  });

  it("re-queries misses only when asked to", () => {
    const cached: EnrichmentFile = { ...emptyEnrichment(SRC, V), players: { p01: miss() } };
    const plan = planWork(snapshot(2), cached, { retryMisses: true });
    expect(plan.players.map((p) => p.id)).toEqual(["p01", "p02"]);
    expect(plan.skipped.knownMisses).toBe(0);
  });

  /**
   * The photo is the visible payoff of this layer, and "no photo" cuts across
   * status: a player never found and one matched to a source entry with no
   * image are equally photoless. `--missing-photos` targets exactly that gap.
   */
  describe("--missing-photos", () => {
    const photoless: EnrichmentFile = {
      ...emptyEnrichment(SRC, V),
      clubs: { c1: { status: "matched", data: { city: "Rio" }, depth: "roster", fetchedAt: "t", sourceVersion: V } },
      players: {
        p01: miss(), // never found
        p02: matched({ birthDate: "1998-01-01" }), // matched, but no image
        p03: matched({ photo: "https://cdn/p3.png" }), // done
      },
    };

    it("re-queries both the misses and the matches that came back imageless", () => {
      const plan = planWork(snapshot(3), photoless, { retryPhotoless: true });
      expect(plan.players.map((p) => p.id)).toEqual(["p01", "p02"]);
      expect(plan.skipped.alreadyDone).toBe(2); // p03 keeps its photo, c1 its data
      expect(plan.skipped.knownMisses).toBe(0); // p01 is being retried, not skipped
    });

    it("leaves those records alone without the flag", () => {
      const plan = planWork(snapshot(3), photoless);
      expect(plan.players).toEqual([]);
      expect(plan.skipped).toEqual({ alreadyDone: 3, knownMisses: 1 });
    });

    it("re-queries at roster depth, so a cheap club listing can answer first", () => {
      const plan = planWork(snapshot(3), photoless, { retryPhotoless: true });
      expect(plan.players.every((p) => p.depth === "roster")).toBe(true);
    });

    it("still honours --max, so the backlog can be worked in chunks", () => {
      const plan = planWork(snapshot(3), photoless, { retryPhotoless: true, max: 1 });
      expect(plan.players.map((p) => p.id)).toEqual(["p01"]);
      expect(plan.deferred).toBe(1);
    });
  });

  it("tops a shallow record up to deep only under --deep, and only if physicals are missing", () => {
    const cached: EnrichmentFile = {
      ...emptyEnrichment(SRC, V),
      clubs: { c1: { status: "matched", data: {}, depth: "roster", fetchedAt: "t", sourceVersion: V } },
      players: {
        p01: matched({ photo: "u" }, "name"), // shallow, no physicals → deep candidate
        p02: matched({ photo: "u", heightCm: 180 }, "name"), // already has physicals
      },
    };
    expect(planWork(snapshot(2), cached).players).toEqual([]); // no --deep: nothing to do
    const deep = planWork(snapshot(2), cached, { deep: true });
    expect(deep.players).toEqual([{ id: "p01", depth: "deep" }]);
  });

  it("picks up a player who joined the squad after the last run", () => {
    const cached: EnrichmentFile = {
      ...emptyEnrichment(SRC, V),
      clubs: { c1: { status: "matched", data: {}, depth: "roster", fetchedAt: "t", sourceVersion: V } },
      players: { p01: matched({ photo: "u" }) },
    };
    const plan = planWork(snapshot(2), cached); // p02 is new
    expect(plan.players.map((p) => p.id)).toEqual(["p02"]);
  });

  it("refetches records left by an older enricher version", () => {
    const cached: EnrichmentFile = {
      ...emptyEnrichment(SRC, "1"),
      players: { p01: { ...matched({ photo: "u" }), sourceVersion: "0" } },
    };
    const plan = planWork(snapshot(1), cached, { sourceVersion: "1" });
    expect(plan.players.map((p) => p.id)).toEqual(["p01"]);
  });

  it("caps a run with --max and reports what a next run would pick up", () => {
    const plan = planWork(snapshot(10), emptyEnrichment(SRC, V), { max: 4 });
    expect(plan.clubs.length + plan.players.length).toBe(4);
    expect(plan.deferred).toBe(7); // 1 club + 10 players = 11 total
  });

  it("marches through the backlog deterministically across capped runs", () => {
    // Two capped runs must cover a prefix, never re-roll which entities get done.
    const first = planWork(snapshot(6), emptyEnrichment(SRC, V), { max: 3 });
    expect(first.clubs).toEqual(["c1"]);
    expect(first.players.map((p) => p.id)).toEqual(["p01", "p02"]);

    const afterFirst: EnrichmentFile = {
      ...emptyEnrichment(SRC, V),
      clubs: { c1: { status: "matched", data: {}, depth: "roster", fetchedAt: "t", sourceVersion: V } },
      players: { p01: matched({}), p02: matched({}) },
    };
    const second = planWork(snapshot(6), afterFirst, { max: 3 });
    expect(second.players.map((p) => p.id)).toEqual(["p03", "p04", "p05"]);
  });

  it("is deterministic whatever order the snapshot lists entities in", () => {
    const s = snapshot(5);
    const shuffled: RawSnapshot = { ...s, players: [...s.players].reverse() };
    expect(planWork(shuffled, emptyEnrichment(SRC, V))).toEqual(planWork(s, emptyEnrichment(SRC, V)));
  });
});

describe("EnrichmentStore", () => {
  const dir = () => mkdtempSync(join(tmpdir(), "fut-enrich-"));

  it("round-trips through disk with stable key order", () => {
    const path = enrichmentPath(dir());
    const store = new EnrichmentStore(path, SRC, V, 1);
    store.putPlayer("p02", { status: "matched", data: { photo: "b" }, sourceId: "2", depth: "name", fetchedAt: "t" });
    store.putPlayer("p01", { status: "matched", data: { photo: "a" }, sourceId: "1", depth: "name", fetchedAt: "t" });
    store.flush();

    const back = readEnrichment(path)!;
    expect(Object.keys(back.players)).toEqual(["p01", "p02"]); // sorted, so diffs stay readable
    expect(back.players.p01!.data!.photo).toBe("a");
  });

  it("reloads what a previous run wrote, so a restart resumes", () => {
    const path = enrichmentPath(dir());
    const first = new EnrichmentStore(path, SRC, V, 1);
    first.putPlayer("p01", { status: "matched", data: { photo: "a" }, sourceId: "1", depth: "name", fetchedAt: "t" });
    first.flush();

    const second = new EnrichmentStore(path, SRC, V, 1);
    expect(planWork(snapshot(2), second.snapshot()).players.map((p) => p.id)).toEqual(["p02"]);
  });

  it("flushes periodically so an interrupted run keeps most of its progress", () => {
    const path = enrichmentPath(dir());
    const store = new EnrichmentStore(path, SRC, V, 2); // flush every 2
    store.putPlayer("p01", { status: "matched", data: {}, sourceId: "1", depth: "name", fetchedAt: "t" });
    expect(readEnrichment(path)).toBeUndefined(); // not yet
    store.putPlayer("p02", { status: "matched", data: {}, sourceId: "2", depth: "name", fetchedAt: "t" });
    expect(Object.keys(readEnrichment(path)!.players)).toEqual(["p01", "p02"]); // flushed
  });

  it("keeps deeper facts when a later pass merges in shallower ones", () => {
    const path = enrichmentPath(dir());
    const store = new EnrichmentStore(path, SRC, V, 1);
    store.putPlayer("p01", { status: "matched", data: { heightCm: 180, weightKg: 75 }, sourceId: "1", depth: "roster", fetchedAt: "t" });
    store.mergePlayer("p01", { photo: "u", heightCm: undefined }, "name", "1", "t2");
    const rec = store.snapshot().players.p01!;
    expect(rec.data).toEqual({ heightCm: 180, weightKg: 75, photo: "u" }); // undefined must not erase
  });

  /**
   * `--missing-photos` re-queries players we ALREADY matched. If a retry that
   * comes back empty overwrote the record, one pass aimed at gaining photos
   * would destroy every height and weight it failed to re-find.
   */
  it("a failed retry never downgrades a record we already matched", () => {
    const store = new EnrichmentStore(enrichmentPath(dir()), SRC, V, 1);
    store.putPlayer("p01", { status: "matched", data: { heightCm: 183, weightKg: 79 }, sourceId: "9", depth: "roster", fetchedAt: "t1" });

    store.missPlayer("p01", "t2");

    const rec = store.snapshot().players.p01!;
    expect(rec.status).toBe("matched");
    expect(rec.data).toEqual({ heightCm: 183, weightKg: 79 });
    expect(rec.sourceId).toBe("9");
    expect(rec.fetchedAt).toBe("t2"); // the attempt is still recorded
  });

  it("records a genuine miss for a player we never had", () => {
    const store = new EnrichmentStore(enrichmentPath(dir()), SRC, V, 1);
    store.missPlayer("p01", "t1");
    expect(store.snapshot().players.p01).toMatchObject({ status: "notFound", fetchedAt: "t1" });
  });

  it("treats a missing or corrupt file as nothing cached, never a crash", () => {
    const d = dir();
    expect(readEnrichment(enrichmentPath(d))).toBeUndefined();
    const bad = join(d, "bad.json");
    writeFileSync(bad, "{ not json");
    expect(readEnrichment(bad)).toBeUndefined();
  });

  it("survives a stale entry for a player who has left the squad", () => {
    const path = enrichmentPath(dir());
    writeEnrichment(path, { ...emptyEnrichment(SRC, V), players: { ghost: matched({ photo: "u" }) } });
    const plan = planWork(snapshot(1), readEnrichment(path)!);
    expect(plan.players.map((p) => p.id)).toEqual(["p01"]); // the ghost is simply ignored
  });
});

describe("enrichmentToPartial", () => {
  const base = snapshot(2);

  it("adds facts to the snapshot without touching what the base source knew", () => {
    const enrichment: EnrichmentFile = {
      ...emptyEnrichment(SRC, V),
      players: { p01: matched({ photo: "http://img/p1.png", birthDate: "1997-06-20", heightCm: 181 }) },
    };
    const merged = mergeSources([base, enrichmentToPartial(base, enrichment)]);
    const p1 = merged.players.find((p) => p.id === "p01")!;
    expect(p1.photo).toBe("http://img/p1.png");
    expect(p1.dob).toBe("1997-06-20");
    expect(p1.heightCm).toBe(181);
    expect(p1.name).toBe("Player 1"); // base identity intact
    expect(merged.players.find((p) => p.id === "p02")!.photo).toBeUndefined();
  });

  it("contributes nothing for a miss", () => {
    const enrichment: EnrichmentFile = { ...emptyEnrichment(SRC, V), players: { p01: miss() } };
    expect(enrichmentToPartial(base, enrichment).players).toEqual([]);
  });

  it("never emits stats — mergeSources concatenates them and would double every appearance", () => {
    const withStats: RawSnapshot = {
      ...base,
      players: base.players.map((p) => ({ ...p, stats: [{ source: "tm", competitionId: "L1", appearances: 10, goals: 2 }] })),
    };
    const enrichment: EnrichmentFile = { ...emptyEnrichment(SRC, V), players: { p01: matched({ photo: "u" }) } };
    const merged = mergeSources([withStats, enrichmentToPartial(withStats, enrichment)]);
    expect(merged.players.find((p) => p.id === "p01")!.stats).toHaveLength(1);
  });

  it("keeps the source's position only as a second opinion", () => {
    const enrichment: EnrichmentFile = {
      ...emptyEnrichment(SRC, V),
      players: { p01: matched({ position: "Left-Back" }), p02: matched({ position: "Central Midfield" }) },
    };
    const merged = mergeSources([base, enrichmentToPartial(base, enrichment)]);
    const p1 = merged.players.find((p) => p.id === "p01")!;
    expect(p1.position).toBe("Central Midfield"); // base still drives the squad shape
    expect(p1.secondaryPositions).toEqual(["Left-Back"]);
    // Agreeing with the base position adds nothing.
    expect(merged.players.find((p) => p.id === "p02")!.secondaryPositions).toBeUndefined();
  });

  it("records the source id so a match can be audited later", () => {
    const enrichment: EnrichmentFile = { ...emptyEnrichment(SRC, V), players: { p01: matched({ photo: "u" }) } };
    const merged = mergeSources([base, enrichmentToPartial(base, enrichment)]);
    expect(merged.players.find((p) => p.id === "p01")!.externalIds).toEqual({ thesportsdb: "x" });
  });
});

describe("mergeSources", () => {
  it("lets a later partial fill a gap but never blank a value it lacks", () => {
    const merged = mergeSources([
      { players: [{ id: "p1", name: "A", clubId: "c1", position: "GK", heightCm: 188, foot: "left" }] },
      { players: [{ id: "p1", name: "A", clubId: "c1", position: "GK", heightCm: undefined, photo: "u" }] },
    ]);
    const p = merged.players[0]!;
    expect(p.heightCm).toBe(188); // an unmatched enrichment must not wipe this
    expect(p.foot).toBe("left");
    expect(p.photo).toBe("u");
  });
});
