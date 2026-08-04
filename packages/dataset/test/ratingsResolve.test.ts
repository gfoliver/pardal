import { describe, expect, it } from "vitest";
import { nameKey, RatingsStore, REQUIRED_LABELS, resolveScrapedRatings, type ScrapedPlayer } from "../src/index.js";
import type { RawSnapshot } from "../src/raw/RawSnapshot.js";

/**
 * Matching a scraped ratings dump onto our players.
 *
 * The join is by NAME, which on Brazilian squads is genuinely dangerous — they are full of shared
 * first names, and a global name match would pair our Palmeiras "Paulinho" with whichever Paulinho
 * the source happened to list first. Hence club-scoped first, bare name only when it is unique in
 * the whole dump.
 */

const snapshot = (players: readonly { id: string; name: string; clubId: string; position?: string }[]): RawSnapshot =>
  ({
    players: players.map((p) => ({ ...p, position: p.position ?? "Central Midfield" })),
    clubs: [],
    competitions: [],
  }) as unknown as RawSnapshot;

const dumpRow = (
  uid: string,
  name: string,
  opts: { tm?: string; v?: number; labels?: readonly string[]; drop?: readonly string[] } = {},
): ScrapedPlayer => {
  const labels = (opts.labels ?? REQUIRED_LABELS.outfield).filter((l) => !(opts.drop ?? []).includes(l));
  return { uid, name, tm: opts.tm, attrs: Object.fromEntries(labels.map((l) => [l, opts.v ?? 12])) };
};

/** In-memory store; the path is never written to because nothing calls `flush`. */
const store = () => new RatingsStore("unused/ratings.json", "fminside", "7");
const record = (s: RatingsStore, id: string) => s.snapshot().players[id];

describe("the join key", () => {
  it("ignores accents, case and punctuation, which the two sources spell differently", () => {
    expect(nameKey("Éverton Ribeiro")).toBe(nameKey("everton ribeiro"));
    expect(nameKey("Anderson Talisca")).toBe(nameKey("Anderson  Talisca "));
    expect(nameKey("N'Golo Kanté")).toBe("ngolo kante");
  });
});

describe("resolving a dump against our players", () => {
  it("matches within the club first", () => {
    const s = store();
    const out = resolveScrapedRatings(
      snapshot([{ id: "p1", name: "Paulinho", clubId: "c1" }]),
      [dumpRow("s1", "Paulinho", { tm: "c1" }), dumpRow("s2", "Paulinho", { tm: "c2" })],
      s,
    );
    expect(out.byClubName).toBe(1);
    expect(record(s, "p1")?.sourceId).toBe("s1");
  });

  /** The reason club scoping comes first: a namesake must never be silently substituted. */
  it("refuses an ambiguous bare-name match rather than guessing between namesakes", () => {
    const s = store();
    const out = resolveScrapedRatings(
      snapshot([{ id: "p1", name: "Paulinho", clubId: "c9" }]),
      [dumpRow("s1", "Paulinho", { tm: "c1" }), dumpRow("s2", "Paulinho", { tm: "c2" })],
      s,
    );
    expect(out.matched).toBe(0);
    expect(out.notInDump).toBe(1);
  });

  it("allows a cross-club match when the name is unique in the whole dump", () => {
    // Covers a player who moved between the squad snapshot and the scrape.
    const s = store();
    const out = resolveScrapedRatings(
      snapshot([{ id: "p1", name: "Hulk", clubId: "c9" }]),
      [dumpRow("s1", "Hulk", { tm: "c1" })],
      s,
    );
    expect(out.byUniqueName).toBe(1);
  });

  it("records a miss for a player absent from the dump, leaving him on inference", () => {
    const s = store();
    const out = resolveScrapedRatings(snapshot([{ id: "p1", name: "Nobody", clubId: "c1" }]), [], s);
    expect(out.notInDump).toBe(1);
    // Remembered as a miss, not left blank: "we looked and he isn't there" has to be
    // distinguishable from "we never looked", which is the difference between a backfill and a bug.
    expect(record(s, "p1")?.status).toBe("notFound");
    expect(record(s, "p1")?.attributes).toBeUndefined();
  });

  /**
   * Regression: demanding the outfield label set from everybody refused all 65 goalkeepers in the
   * league on the first run. They looked like bad scrapes when they were complete keeper pages.
   */
  it("judges a keeper's row by the keeper label set", () => {
    const s = store();
    const out = resolveScrapedRatings(
      snapshot([{ id: "gk", name: "Weverton", clubId: "c1", position: "Goalkeeper" }]),
      [dumpRow("s1", "Weverton", { tm: "c1", labels: REQUIRED_LABELS.goalkeeper })],
      s,
    );
    expect(out.matched).toBe(1);
    expect(out.incomplete).toBe(0);
  });

  it("still refuses a keeper's row that is missing a keeper label", () => {
    const s = store();
    const out = resolveScrapedRatings(
      snapshot([{ id: "gk", name: "Weverton", clubId: "c1", position: "Goalkeeper" }]),
      [dumpRow("s1", "Weverton", { tm: "c1", labels: REQUIRED_LABELS.goalkeeper, drop: ["Reflexes"] })],
      s,
    );
    expect(out.incomplete).toBe(1);
    expect(record(s, "gk")?.status).toBe("notFound");
  });

  it("refuses an outfielder's row that is missing an outfield label", () => {
    // An incomplete row is a bad scrape, not a player without that skill.
    const s = store();
    const out = resolveScrapedRatings(
      snapshot([{ id: "p1", name: "Arrascaeta", clubId: "c1" }]),
      [dumpRow("s1", "Arrascaeta", { tm: "c1", drop: ["Vision"] })],
      s,
    );
    expect(out.incomplete).toBe(1);
    expect(out.matched).toBe(0);
  });

  it("is reproducible: the same snapshot and dump give the same store twice over", () => {
    const run = () => {
      const s = store();
      resolveScrapedRatings(
        snapshot([{ id: "p1", name: "Arrascaeta", clubId: "c1" }, { id: "p2", name: "Ghost", clubId: "c1" }]),
        [dumpRow("s1", "Arrascaeta", { tm: "c1" })],
        s,
    );
      return JSON.stringify(s.snapshot());
    };
    expect(run()).toBe(run());
  });
});
