import { describe, expect, it } from "vitest";
import { WEIGHTS, type AttrName } from "../src/overall.js";
import { Position } from "../src/types.js";

/**
 * Structural rules the weight sets have to keep. Not a snapshot of the numbers — those are a judgement
 * call answerable to `weightAudit.ts` — but the properties whose violation was an actual defect.
 */

const POSITIONS = Object.keys(WEIGHTS) as Position[];
const keysOf = (pos: Position) => new Set(Object.keys(WEIGHTS[pos]) as AttrName[]);
const GK_KEYS: readonly AttrName[] = ["reflexes", "handling", "gkPositioning", "oneOnOnes"];

describe("position weight sets", () => {
  it("weights every position on something, with positive integers", () => {
    for (const pos of POSITIONS) {
      const w = WEIGHTS[pos];
      const entries = Object.entries(w) as [AttrName, number][];
      expect(entries.length, pos).toBeGreaterThan(0);
      for (const [k, v] of entries) {
        expect(Number.isInteger(v), `${pos}.${k}`).toBe(true);
        expect(v, `${pos}.${k}`).toBeGreaterThan(0);
      }
    }
  });

  /**
   * The defect this replaces: six of the defensive midfielder's eight keys were also centre-back keys
   * and carried 12 of its 14 weight, so the two lenses could not tell each other's players apart —
   * eleven of the top twenty centre-backs rated higher as defensive midfielders than at their own
   * position. A position whose keys are a subset of another's cannot distinguish anybody.
   */
  it("gives every position at least one attribute no other position weights the same way", () => {
    for (const a of POSITIONS) {
      for (const b of POSITIONS) {
        if (a === b) continue;
        const ka = keysOf(a);
        const kb = keysOf(b);
        const subset = [...ka].every((k) => kb.has(k));
        expect(subset, `${a} keys are a subset of ${b}'s`).toBe(false);
      }
    }
  });

  /**
   * `positionOverall` iterates the keys present in a weight set, so an attribute no set names
   * contributes nothing anywhere — it is modelled, stored, shown in the UI, and silently ignored. That
   * was the deliberate state while the three were being introduced; leaving one there by accident is
   * the thing to catch.
   */
  it("leaves no outfield attribute unweighted by every position", () => {
    const weighted = new Set(POSITIONS.flatMap((p) => [...keysOf(p)]));
    for (const key of ["offTheBall", "firstTouch", "heading"] as const) {
      expect(weighted.has(key), `${key} is weighted nowhere`).toBe(true);
    }
  });

  it("keeps goalkeeping attributes to the goalkeeper, and gives him some", () => {
    for (const pos of POSITIONS) {
      const has = GK_KEYS.filter((k) => keysOf(pos).has(k));
      if (pos === Position.Goalkeeper) expect(has.length).toBeGreaterThan(0);
      else expect(has, pos).toEqual([]);
    }
  });

  /**
   * The weight total is the DENOMINATOR, so adding a term without removing one dilutes whatever the
   * position is actually defined by — a specialist stops standing out because his best attribute is
   * now one voice in a larger crowd.
   *
   * A sixth, and NOT a stricter fraction, because the binding case is legitimate: the full-back
   * carries four attributes at weight 2 and no headline at all, since the job is to defend and to get
   * up the pitch and neither dominates. Demanding a headline attribute would have meant bending the
   * model to satisfy the test. Written as integer arithmetic so the full-back sits inside the rule
   * rather than on a floating-point knife edge — and so adding one more weight-1 term to him fails,
   * which is exactly the dilution this is here to catch.
   *
   * It earned its place immediately: the centre-back gained `heading` with nothing taken out, which
   * pushed `marking` from 20% of his rating to 17.6%.
   */
  it("keeps each position's heaviest attribute worth at least a sixth of its rating", () => {
    for (const pos of POSITIONS) {
      const values = Object.values(WEIGHTS[pos]) as number[];
      const total = values.reduce((s, v) => s + v, 0);
      expect(Math.max(...values) * 6, `${pos} (total ${total})`).toBeGreaterThanOrEqual(total);
    }
  });
});
