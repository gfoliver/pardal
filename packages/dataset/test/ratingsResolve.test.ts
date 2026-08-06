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

const snapshot = (
  players: readonly { id: string; name: string; clubId: string; position?: string; age?: number }[],
): RawSnapshot =>
  ({
    players: players.map((p) => ({ ...p, position: p.position ?? "Central Midfield" })),
    clubs: [],
    competitions: [],
  }) as unknown as RawSnapshot;

const dumpRow = (
  uid: string,
  name: string,
  opts: { tm?: string; v?: number; age?: number; labels?: readonly string[]; drop?: readonly string[] } = {},
): ScrapedPlayer => {
  const labels = (opts.labels ?? REQUIRED_LABELS.outfield).filter((l) => !(opts.drop ?? []).includes(l));
  return { uid, name, tm: opts.tm, age: opts.age, attrs: Object.fromEntries(labels.map((l) => [l, opts.v ?? 12])) };
};

/** In-memory store; the path is never written to because nothing calls `flush`. */
const store = () => new RatingsStore("unused/ratings.json", "fminside", "7");
const record = (s: RatingsStore, id: string) => s.snapshot().players[id];

/** A row with all 47 labels, so only the VALUES say what kind of footballer it belongs to. */
const fullRow = (uid: string, name: string, opts: { tm?: string; gk: number; out?: number }): ScrapedPlayer => ({
  uid,
  name,
  tm: opts.tm,
  attrs: {
    ...Object.fromEntries(REQUIRED_LABELS.outfield.map((l) => [l, opts.out ?? 11])),
    ...Object.fromEntries(REQUIRED_LABELS.goalkeeper.map((l) => [l, opts.out ?? 11])),
    Reflexes: opts.gk,
    Handling: opts.gk,
    "Command of Area": opts.gk,
    "One on Ones": opts.gk,
  },
});

/**
 * A row that belongs to a different KIND of footballer is not this player.
 *
 * This is where ten of the eleven absurdly-rated players in the two-tier build came from, and it is why
 * the task that asked for a rating FLOOR got a resolver check instead: a floor would have turned ten
 * wrong people into ten mediocre players and thrown away the only evidence the bug existed.
 *
 * The source publishes all 47 labels for everybody, so completeness cannot see a mix-up — a row is
 * complete whoever it belongs to. The values can: FM rates an outfielder's goalkeeping at 1 to 3, and a
 * keeper's at 10 and up. Measured over 1044 matched rows, our keepers' goalkeeping median runs 10–15 and
 * our outfielders' 1–3, so the threshold sits in an empty band and every value from 5 to 8 refuses
 * exactly the same rows.
 */
describe("a row that describes somebody else's position", () => {
  it("refuses an outfielder's row for our goalkeeper, however well the name matches", () => {
    const s = store();
    const out = resolveScrapedRatings(
      snapshot([{ id: "gk", name: "Raul", clubId: "c1", position: "Goalkeeper" }]),
      [fullRow("s1", "Raul", { tm: "c1", gk: 2 })],
      s,
    );
    expect(out.wrongPosition).toBe(1);
    expect(out.matched).toBe(0);
    expect(record(s, "gk")?.status).toBe("notFound");
  });

  it("refuses a keeper's row for our centre-back", () => {
    const s = store();
    const out = resolveScrapedRatings(
      snapshot([{ id: "cb", name: "Wellington", clubId: "c1", position: "Centre-Back" }]),
      [fullRow("s1", "Wellington", { tm: "c1", gk: 13 })],
      s,
    );
    expect(out.wrongPosition).toBe(1);
    expect(record(s, "cb")?.status).toBe("notFound");
  });

  it("takes the candidate whose position agrees, when the name is shared", () => {
    // Two Rauls in the dump, one a keeper. Ours keeps goal, so there is no ambiguity to refuse.
    const s = store();
    const out = resolveScrapedRatings(
      snapshot([{ id: "gk", name: "Raul", clubId: "c9", position: "Goalkeeper" }]),
      [fullRow("outfielder", "Raul", { gk: 2 }), fullRow("keeper", "Raul", { gk: 13 })],
      s,
    );
    expect(out.matched).toBe(1);
    expect(record(s, "gk")?.sourceId).toBe("keeper");
  });

  /**
   * WITHDRAWS an earlier match, unlike a miss.
   *
   * `store.miss` preserves a previous match on purpose — a partial dump must not delete what a fuller
   * one found. But this refusal is a judgement about a person, and while it went through `miss` the
   * check changed nothing at all: twenty-seven bad matches were refused and every one stayed in the
   * file.
   */
  it("withdraws a match it no longer believes", () => {
    const s = store();
    s.match("gk", { attributes: { Reflexes: 14 }, sourceId: "old", method: "club+name", fetchedAt: "t0" });
    expect(record(s, "gk")?.status).toBe("matched");
    resolveScrapedRatings(
      snapshot([{ id: "gk", name: "Raul", clubId: "c1", position: "Goalkeeper" }]),
      [fullRow("s1", "Raul", { tm: "c1", gk: 2 })],
      s,
    );
    expect(record(s, "gk")?.status).toBe("notFound");
  });

  it("does not call a row it cannot classify a mismatch", () => {
    // No goalkeeping labels at all, so nothing says whose row it is. That is a bad scrape for a keeper
    // and the completeness check owns it — counting it as the wrong person would be a different claim.
    const s = store();
    const out = resolveScrapedRatings(
      snapshot([{ id: "gk", name: "Weverton", clubId: "c1", position: "Goalkeeper" }]),
      [dumpRow("s1", "Weverton", { tm: "c1", labels: REQUIRED_LABELS.goalkeeper, drop: ["Reflexes"] })],
      s,
    );
    expect(out.wrongPosition).toBe(0);
    expect(out.incomplete).toBe(1);
  });
});

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

/**
 * Age as the tiebreaker between namesakes.
 *
 * Measured on one division: 38 of our players were IN the dump under a name it shared with someone else
 * and had to be refused, and they are exactly the names Brazilian squads repeat — Ryan, Vitinho,
 * Rodriguinho, Pedro Henrique. No amount of extra scraping settles those; only better evidence does.
 */
describe("telling namesakes apart by age", () => {
  const store = () => new RatingsStore("(never written)", "test", "1");

  it("takes the candidate whose age agrees, where a bare name match would refuse", () => {
    const snap = snapshot([{ id: "p1", name: "Vitinho", clubId: "c1", age: 25 }]);
    const dump = [dumpRow("u1", "Vitinho", { tm: "other", age: 19 }), dumpRow("u2", "Vitinho", { tm: "another", age: 25 })];
    const out = resolveScrapedRatings(snap, dump, store());
    expect(out.matched).toBe(1);
    expect(out.byNameAndAge).toBe(1);
    expect(out.byUniqueName).toBe(0);
  });

  it("allows a year of drift, because the two sources are snapshots from different dates", () => {
    const snap = snapshot([{ id: "p1", name: "Ryan", clubId: "c1", age: 23 }]);
    const dump = [dumpRow("u1", "Ryan", { tm: "x", age: 24 }), dumpRow("u2", "Ryan", { tm: "y", age: 30 })];
    expect(resolveScrapedRatings(snap, dump, store()).byNameAndAge).toBe(1);
  });

  it("still refuses when two namesakes are the same age", () => {
    // Nothing left to decide on. Picking either would be a guess wearing a match's clothes.
    const snap = snapshot([{ id: "p1", name: "Paulinho", clubId: "c1", age: 27 }]);
    const dump = [dumpRow("u1", "Paulinho", { tm: "x", age: 27 }), dumpRow("u2", "Paulinho", { tm: "y", age: 27 })];
    const out = resolveScrapedRatings(snap, dump, store());
    expect(out.matched).toBe(0);
    expect(out.notInDump).toBe(1);
  });

  it("refuses when no candidate's age agrees", () => {
    const snap = snapshot([{ id: "p1", name: "Brenno", clubId: "c1", age: 27 }]);
    const dump = [dumpRow("u1", "Brenno", { tm: "x", age: 19 }), dumpRow("u2", "Brenno", { tm: "y", age: 34 })];
    expect(resolveScrapedRatings(snap, dump, store()).matched).toBe(0);
  });

  it("behaves exactly as before on a dump with no ages", () => {
    // The committed dumps predate this field; ambiguity must stay refused rather than become a coin toss.
    const snap = snapshot([{ id: "p1", name: "Vitinho", clubId: "c1", age: 25 }]);
    const dump = [dumpRow("u1", "Vitinho", { tm: "x" }), dumpRow("u2", "Vitinho", { tm: "y" })];
    expect(resolveScrapedRatings(snap, dump, store()).matched).toBe(0);
  });

  it("splits two namesakes AT THE SAME CLUB, which used to silently collapse", () => {
    /*
     * The latent defect age also fixes. The club index was `map.set(name, player)`, so two players of
     * one name at one club became one entry and whichever the dump listed last won — for both of them.
     */
    const snap = snapshot([
      { id: "p1", name: "Pedro Henrique", clubId: "c1", age: 21 },
      { id: "p2", name: "Pedro Henrique", clubId: "c1", age: 36 },
    ]);
    const dump = [
      dumpRow("young", "Pedro Henrique", { tm: "c1", age: 21, v: 8 }),
      dumpRow("old", "Pedro Henrique", { tm: "c1", age: 36, v: 16 }),
    ];
    const out = resolveScrapedRatings(snap, dump, store());
    expect(out.matched).toBe(2);
    expect(out.byClubName).toBe(2);
    // And each got HIS row, not the same one twice.
    const file = (() => {
      const st = store();
      resolveScrapedRatings(snap, dump, st);
      return st.snapshot();
    })();
    expect(file.players.p1?.sourceId).toBe("young");
    expect(file.players.p2?.sourceId).toBe("old");
  });
});
