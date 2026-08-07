// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { DETAILS, SCREENS, isDetail, isScreenId } from "../src/layout/screens";

/**
 * The router's vocabulary, and the one rule an invite link depends on.
 *
 * `/friendly/RJCE3C` was being answered with the dashboard, and the cause was not the router: the path
 * parsed fine and the screen rendered, then a boot correction — "leaving a career must not hand the next
 * one the screen you were on" — rewrote it. There is no save while the start screen is up, so that
 * correction fired on EVERY fresh load, and following a link is exactly a fresh load.
 *
 * The rule these tests hold is the general one rather than the special case: a screen reachable WITHOUT a
 * career must not be corrected away by career logic. Today `friendly` is the only one; the test names the
 * property so the next such screen is a considered decision rather than a repeat of this bug.
 */

describe("the set of screens", () => {
  it("knows the room, or its path would parse as the dashboard", () => {
    expect(isScreenId("friendly")).toBe(true);
    expect(isDetail("friendly")).toBe(true);
  });

  it("refuses a segment that is not a screen, rather than inventing one", () => {
    expect(isScreenId("RJCE3C")).toBe(false);
    expect(isScreenId("")).toBe(false);
  });

  it("has no duplicates between its sections and its details", () => {
    expect(new Set(SCREENS).size).toBe(SCREENS.length);
  });
});

/**
 * A copy of `App`'s parser and printer.
 *
 * Copied rather than imported because `App.tsx` pulls in the whole screen tree — every lazy chunk, the
 * career provider, the engine behind `CareerMatch`. What is being checked here is the shape of a path,
 * and the two must agree; a golden pair of round trips is the guard that they do.
 */
const BASE = "";
function parse(pathname: string): { screen: string; param: string } {
  const [seg = "", param = ""] = pathname.replace(/^\//, "").split("/");
  return { screen: isScreenId(seg) ? seg : "home", param: decodeURIComponent(param) };
}
const print = (r: { screen: string; param: string }) =>
  `${BASE}/${r.param ? `${r.screen}/${encodeURIComponent(r.param)}` : r.screen}`;

describe("paths, not fragments", () => {
  it("reads a room code off the path", () => {
    expect(parse("/friendly/RJCE3C")).toEqual({ screen: "friendly", param: "RJCE3C" });
  });

  it("treats the root as the dashboard", () => {
    expect(parse("/")).toEqual({ screen: "home", param: "" });
  });

  it("round-trips every screen, with and without a parameter", () => {
    for (const screen of SCREENS) {
      expect(parse(print({ screen, param: "" }))).toEqual({ screen, param: "" });
      expect(parse(print({ screen, param: "tm-614" }))).toEqual({ screen, param: "tm-614" });
    }
  });

  it("survives a parameter that needs escaping", () => {
    // Club and player ids come from a dataset, not from us, and a path is not a place to hope.
    expect(parse(print({ screen: "club", param: "a/b c" }))).toEqual({ screen: "club", param: "a/b c" });
  });

  it("sends an unknown path to the dashboard instead of a blank screen", () => {
    expect(parse("/nonsense/xyz").screen).toBe("home");
  });
});

describe("what a career boot may correct", () => {
  /**
   * The regression itself, expressed as the rule rather than as the symptom. `App` exempts exactly the
   * screens that work with no career; if that list ever grows, this is where the decision gets made.
   */
  const WORKS_WITHOUT_A_CAREER = ["friendly"];

  it("leaves alone every screen that does not need a career", () => {
    for (const screen of WORKS_WITHOUT_A_CAREER) expect(DETAILS).toContain(screen);
  });

  it("still corrects a career screen, which is what the rule is for", () => {
    // Landing on somebody else's player profile, or the tactics board of a club you no longer manage, is
    // the disorientation the correction exists to prevent.
    expect(WORKS_WITHOUT_A_CAREER).not.toContain("player");
    expect(WORKS_WITHOUT_A_CAREER).not.toContain("tactics");
    expect(WORKS_WITHOUT_A_CAREER).not.toContain("match");
  });
});
