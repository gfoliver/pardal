import { describe, expect, it } from "vitest";
import type { DirectoryEntry } from "@fut/career";
import { buildIndex, searchIndex } from "../src/lib/career/search";

/**
 * What a global search has to get right.
 *
 * Two rules that are invisible in a screenshot and one careless edit from breaking: an ASCII query must
 * find an accented name, and "fla" must answer with the club before the eleven players whose row says
 * FLA. Both are pure, which is why the matching lives apart from the palette that draws it.
 */

const club = (id: string, name: string, short: string, legalName?: string): DirectoryEntry => ({
  kind: "club",
  id,
  name,
  legalName,
  clubShort: short,
});
const player = (id: string, name: string, short: string, over: Partial<DirectoryEntry> = {}): DirectoryEntry => ({
  kind: "player",
  id,
  name,
  clubShort: short,
  clubId: short,
  position: "centreBack",
  nationality: "BR",
  ...over,
});

const ENTRIES: DirectoryEntry[] = [
  club("c1", "Flamengo", "FLA", "Clube de Regatas do Flamengo"),
  club("c2", "Grêmio", "GRE"),
  player("p1", "João Souza", "FLA", { isMine: true }),
  player("p2", "Éverton Ribeiro", "FLA", { isMine: true }),
  player("p3", "João Alencar", "GRE"),
  player("p4", "Bruno Henrique", "FLA", { isMine: true }),
  player("p5", "Muñoz", "GRE", { nationality: "CO" }),
  player("p6", "Reinaldo Flanagan", "GRE"),
];

const index = buildIndex(ENTRIES);
const find = (text: string) => searchIndex(index, text, { idleShown: 3 }).map((r) => r.entry.name);

describe("typing an ASCII keyboard at Brazilian names", () => {
  it("finds an accented name from unaccented letters", () => {
    // The dataset is full of João, Éverton and Muñoz, and nobody reaches for the dead keys.
    expect(find("joao")).toContain("João Souza");
    expect(find("everton")).toContain("Éverton Ribeiro");
    expect(find("munoz")).toContain("Muñoz");
  });

  it("finds an accented query too, since that is also what a keyboard can produce", () => {
    expect(find("joão")).toContain("João Souza");
  });
});

describe("what comes first", () => {
  it("puts the club above the players whose row merely says its code", () => {
    // "fla" is a club before it is a syllable in a surname.
    expect(find("fla")[0]).toBe("Flamengo");
  });

  it("prefers a name that STARTS with the query over one that merely contains it", () => {
    // "Flamengo" and "Reinaldo Flanagan" both contain "fla"; only one begins with it.
    const rows = find("fla");
    expect(rows.indexOf("Flamengo")).toBeLessThan(rows.indexOf("Reinaldo Flanagan"));
  });

  it("puts our own player above another club's at equal quality", () => {
    const rows = find("joao");
    expect(rows.indexOf("João Souza")).toBeLessThan(rows.indexOf("João Alencar"));
  });

  it("ranks a match on a name above a match on something that is not a name", () => {
    // Everyone here is a centre-back, so "zagueiro"-style matches must not outrank a real name hit.
    const rows = find("gre");
    expect(rows[0]).toBe("Grêmio");
  });

  it("orders equal matches by name rather than by save order", () => {
    // Two players from different clubs, same score class — the order must not depend on which club
    // happens to sit first in the state.
    const rows = find("joao");
    expect(rows.filter((n) => n.startsWith("João"))).toEqual(["João Souza", "João Alencar"]);
  });
});

describe("narrowing and edge cases", () => {
  it("requires EVERY word to appear, in any field and any order", () => {
    // "joao gre" is a person and a club, and only one row satisfies both.
    expect(find("joao gre")).toEqual(["João Alencar"]);
    expect(find("gre joao")).toEqual(["João Alencar"]);
  });

  it("matches a club by its legal name as well as its common one", () => {
    expect(find("regatas")).toContain("Flamengo");
  });

  it("returns nothing for a query nothing satisfies", () => {
    expect(find("zzzz")).toEqual([]);
  });

  it("shows our own squad when nothing is typed, rather than an empty box", () => {
    // Opening the palette should already be useful. Capped, so it is a shortcut and not a squad list.
    expect(find("")).toEqual(["João Souza", "Éverton Ribeiro", "Bruno Henrique"]);
    expect(find("   ")).toHaveLength(3);
  });

  it("caps the result count", () => {
    const many = buildIndex(Array.from({ length: 60 }, (_, i) => player(`x${i}`, `Silva ${i}`, "GRE")));
    expect(searchIndex(many, "silva", { idleShown: 3, limit: 10 })).toHaveLength(10);
  });
});
