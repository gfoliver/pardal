import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseHeadCoach } from "../src/scrape/transfermarktHtml.js";

/**
 * Reading the head coach off Transfermarkt's real staff markup.
 *
 * The fixture is CR Flamengo's staff table as served, cut to the table itself. Flamengo is the useful
 * case rather than an arbitrary one: its manager is listed above three assistants, he is a dual national
 * (Portugal and Venezuela), and the whole row is wrapped in a nested `inline-table`, which is what
 * defeats the squad parser's row splitter.
 */

const HTML = readFileSync(fileURLToPath(new URL("./fixtures/tm-staff.html", import.meta.url)), "utf8");

describe("the head coach on a staff page", () => {
  it("reads the manager, his age and his nationality", () => {
    expect(parseHeadCoach(HTML, "614")).toEqual({
      id: "10682",
      name: "Leonardo Jardim",
      clubId: "614",
      age: 52,
      nationality: "Portugal",
    });
  });

  /**
   * The one that matters. A club lists two or three assistants, and one between managers may list an
   * assistant above the vacancy — so "the first coach on the page" would name an assistant as the head
   * coach with nothing in the data to show it had happened.
   */
  it("is chosen by ROLE, never by being first in the table", () => {
    const assistants = [...HTML.matchAll(/<td>Assistant Manager<\/td>/g)].length;
    expect(assistants).toBeGreaterThan(0);
    expect(parseHeadCoach(HTML, "614")!.name).not.toMatch(/Torres|Vieira|Barros/);
  });

  it("takes the FIRST nationality of a dual national", () => {
    // The page gives Portugal and Venezuela and no way to say which he represents.
    expect(HTML).toContain('title="Venezuela"');
    expect(parseHeadCoach(HTML, "614")!.nationality).toBe("Portugal");
  });

  it("returns undefined for a club between managers, rather than the nearest coach", () => {
    // Measured on the real league: São Bernardo genuinely lists no Manager. Absent has to stay absent,
    // because the emitter's whole job here is to stop inventing a person.
    const noManager = HTML.replace(/<td>Manager<\/td>/, "<td>Interim Manager</td>");
    expect(parseHeadCoach(noManager, "614")).toBeUndefined();
  });

  it("says nothing about a page it cannot read, instead of guessing", () => {
    expect(parseHeadCoach("", "614")).toBeUndefined();
    expect(parseHeadCoach("<html><body>Not found</body></html>", "614")).toBeUndefined();
  });
});
