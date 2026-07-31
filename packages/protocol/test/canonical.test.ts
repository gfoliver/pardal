import { describe, expect, it } from "vitest";
import { canonicalJson, CanonicalJsonError } from "../src/canonical.js";

describe("canonical JSON", () => {
  it("is insensitive to the order the object was built in", () => {
    // The reason this function exists. Two code paths assembling the same lineup put
    // their keys in whatever order they happened to assign them, and JSON.stringify
    // preserves that — so the two sides would hash differently and each accuse the
    // other over a difference that is not there.
    const a = { clubId: "x", startingXi: ["p1", "p2"], coachId: "c" };
    const b = { coachId: "c", clubId: "x", startingXi: ["p1", "p2"] };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(canonicalJson(a)).not.toBe(JSON.stringify(b));
  });

  it("sorts keys by codepoint, not by locale", () => {
    // localeCompare would order these by language rules that differ between runtimes.
    const out = canonicalJson({ "á": 1, Z: 2, a: 3, "Á": 4 });
    expect(out).toBe('{"Z":2,"a":3,"Á":4,"á":1}');
  });

  it("keeps array order, because lineup order changes the match", () => {
    const xi = ["gk", "cb", "st"];
    expect(canonicalJson({ xi })).toBe('{"xi":["gk","cb","st"]}');
    expect(canonicalJson({ xi })).not.toBe(canonicalJson({ xi: ["cb", "gk", "st"] }));
  });

  it("rejects undefined instead of dropping it", () => {
    // JSON.stringify removes it from an object and turns it into null in an array —
    // two different silent mutations of the thing being hashed.
    expect(() => canonicalJson({ a: 1, b: undefined })).toThrow(CanonicalJsonError);
    expect(() => canonicalJson([1, undefined])).toThrow(CanonicalJsonError);
    // An absent field must be absent, and that has to be the caller's decision.
    expect(canonicalJson({ a: 1 })).toBe('{"a":1}');
  });

  it("rejects NaN and Infinity instead of writing null", () => {
    expect(() => canonicalJson({ x: NaN })).toThrow(/not representable/);
    expect(() => canonicalJson({ x: Infinity })).toThrow(/not representable/);
    expect(() => canonicalJson({ x: -Infinity })).toThrow(/not representable/);
  });

  it("refuses exotic objects rather than guessing a wire form", () => {
    expect(() => canonicalJson({ when: new Date(0) })).toThrow(/only plain objects/);
    expect(() => canonicalJson({ m: new Map() })).toThrow(/only plain objects/);
    expect(() => canonicalJson({ s: new Set() })).toThrow(/only plain objects/);
    class Team {
      id = "x";
    }
    expect(() => canonicalJson({ t: new Team() })).toThrow(/only plain objects/);
  });

  it("ignores toJSON, so a class cannot decide its own hashed form", () => {
    const sneaky = { a: 1, toJSON: () => ({ a: 2 }) };
    // toJSON is a function, and a function is not hashable — so this is refused
    // outright rather than quietly hashing a different value than the one given.
    expect(() => canonicalJson(sneaky)).toThrow(/function/);
  });

  it("reports the path of the problem", () => {
    try {
      canonicalJson({ home: { startingXi: ["a", undefined] } });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as CanonicalJsonError).path).toBe("home.startingXi[1]");
    }
  });

  it("rejects cycles with a path rather than a stack overflow", () => {
    const a: Record<string, unknown> = { name: "a" };
    a.self = a;
    expect(() => canonicalJson(a)).toThrow(/cycle/);
  });

  it("handles the boring cases", () => {
    expect(canonicalJson(null)).toBe("null");
    expect(canonicalJson(0)).toBe("0");
    expect(canonicalJson(-0)).toBe("0"); // JSON has no negative zero
    expect(canonicalJson(true)).toBe("true");
    expect(canonicalJson("q\"uote")).toBe('"q\\"uote"');
    expect(canonicalJson([])).toBe("[]");
    expect(canonicalJson({})).toBe("{}");
    expect(canonicalJson({ a: [{ b: 1 }, { b: 2 }] })).toBe('{"a":[{"b":1},{"b":2}]}');
  });

  it("round-trips through JSON.parse to an equal value", () => {
    const value = { z: 1, a: [true, null, "x", 2.5], n: { deep: { deeper: 3 } } };
    expect(JSON.parse(canonicalJson(value))).toEqual(value);
  });
});
