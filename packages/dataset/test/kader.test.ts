import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseKader, parseValue, squadRows } from "../src/scrape/transfermarktHtml.js";

/**
 * A badge must never hide a player.
 *
 * The fixture is four real rows from Grêmio's squad page, chosen for the cases
 * that broke the old anchor-window parser: an ordinary player, the captain, an
 * injured player, and one with no shirt number. The first parser dropped 16% of
 * every squad — and specifically the captains, the injured and the suspended,
 * because Transfermarkt puts that status in a `<span>` INSIDE the name link.
 */

const html = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "fixtures", "tm-kader-rows.html"),
  "utf8",
);
const squad = parseKader(html, "210", "2025");
const by = (id: string) => squad.find((p) => p.id === id)!;

describe("the squad table", () => {
  it("finds one player per row and loses none of them", () => {
    expect(squadRows(html)).toHaveLength(4);
    expect(squad).toHaveLength(4);
    expect(new Set(squad.map((p) => p.id)).size).toBe(4);
  });

  it("keeps the captain, whose name carries a badge inside the link", () => {
    const cap = by("tm-145400");
    expect(cap).toBeTruthy();
    // The name must stop at the badge, not swallow it or the &nbsp; inside it.
    expect(cap.name).toBe("Walter Kannemann");
  });

  it("keeps an injured player, same reason", () => {
    const hurt = by("tm-1260202");
    expect(hurt).toBeTruthy();
    expect(hurt.name).toBe("Roger");
  });

  it("reads the shirt number, and leaves it unset when the club hasn't given one", () => {
    expect(by("tm-878037").shirtNumber).toBe(12);
    expect(by("tm-145400").shirtNumber).toBe(4);
    expect(by("tm-1260202").shirtNumber).toBe(47);
    expect(by("tm-261988").shirtNumber).toBeUndefined(); // the cell reads "-"
  });

  it("reads the rest of the row: position, birth date, nationality, height, foot", () => {
    const gk = by("tm-878037");
    expect(gk.position).toBe("Goalkeeper");
    expect(gk.dob).toBe("Mar 29, 2000");
    expect(gk.age).toBe(26);
    expect(gk.nationality).toContain("Brazil");
    expect(gk.heightCm).toBe(192);
    expect(gk.foot).toBe("right");
  });

  it("takes the market value, not the previous club's crest or any other number", () => {
    expect(by("tm-878037").marketValueEur).toBe(1_500_000);
    for (const p of squad) expect(p.marketValueEur ?? 0).toBeGreaterThanOrEqual(0);
  });

  it("takes the contract expiry — the last date in the row, not the date he joined", () => {
    expect(by("tm-878037").contractExpires).toBe("Dec 31, 2029");
  });

  it("never attributes a player to the wrong club", () => {
    for (const p of squad) expect(p.clubId).toBe("210");
  });
});

describe("market values", () => {
  it("scales by suffix", () => {
    expect(parseValue("€30.00m")).toBe(30_000_000);
    expect(parseValue("€800k")).toBe(800_000);
    expect(parseValue("€2.00bn")).toBe(2_000_000_000);
    expect(parseValue("€1,250,000")).toBe(1_250_000);
  });

  it("gives up rather than guessing", () => {
    expect(parseValue(undefined)).toBeUndefined();
    expect(parseValue("-")).toBeUndefined();
  });
});
