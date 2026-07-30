import { describe, expect, it } from "vitest";
import { SeededRandom } from "@fut/engine";
import { buildTeam } from "@fut/app-cli";
import { SpatialMatch } from "../src/SpatialMatch.js";
import { StateHasher } from "../src/stateHash.js";

const mk = (id: string) => buildTeam({ id, name: id, shortName: id.slice(0, 3).toUpperCase(), rating: 72 });
const match = (seed: number) => new SpatialMatch({ home: mk("home"), away: mk("away"), seed });

/** Run to a given step count, sampling the hash on the way. */
function trace(seed: number, steps: number, every: number): { step: number; hash: string }[] {
  const m = match(seed);
  const out: { step: number; hash: string }[] = [];
  let next = every;
  while (!m.finished && m.steps < steps) {
    m.tick(0.1);
    if (m.steps >= next) {
      out.push({ step: m.steps, hash: m.stateHash() });
      next += every;
    }
  }
  return out;
}

describe("StateHasher", () => {
  it("separates values a rounding hash would collapse", () => {
    const h = (f: (x: StateHasher) => void): string => {
      const s = new StateHasher();
      f(s);
      return s.digest();
    };
    // The whole point: last-bit differences must survive into the digest, because
    // those are exactly what a cross-engine divergence looks like.
    expect(h((s) => s.num(1))).not.toBe(h((s) => s.num(1 + Number.EPSILON)));
    expect(h((s) => s.num(0))).not.toBe(h((s) => s.num(-0)));
    expect(h((s) => s.num(0.1 + 0.2))).not.toBe(h((s) => s.num(0.3)));
    // ...and absent must not read as empty
    expect(h((s) => s.maybeStr(null))).not.toBe(h((s) => s.maybeStr("")));
    // ...nor should field order be lost
    expect(h((s) => s.num(1).num(2))).not.toBe(h((s) => s.num(2).num(1)));
  });

  it("is stable for the same input", () => {
    const build = (): string => new StateHasher().str("a").num(1.5).int(3).bool(true).digest();
    expect(build()).toBe(build());
    expect(build()).toHaveLength(16);
  });
});

describe("SeededRandom state", () => {
  it("round-trips mid-stream, so a divergence in draw COUNT is visible", () => {
    const a = new SeededRandom(12345);
    for (let i = 0; i < 50; i++) a.next();
    const resumed = SeededRandom.fromState(a.getState());
    const tail = Array.from({ length: 20 }, () => a.next());
    expect(Array.from({ length: 20 }, () => resumed.next())).toEqual(tail);
  });

  it("changes state on every draw", () => {
    const r = new SeededRandom(7);
    const before = r.getState();
    r.next();
    expect(r.getState()).not.toBe(before);
  });
});

describe("match state hash", () => {
  it("agrees step-for-step between two runs of the same seed", () => {
    const a = trace(4242, 900, 300);
    const b = trace(4242, 900, 300);
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
  });

  it("differs between seeds — it is not hashing a constant", () => {
    const a = trace(1, 900, 300);
    const b = trace(2, 900, 300);
    expect(a.map((x) => x.hash)).not.toEqual(b.map((x) => x.hash));
  });

  it("is unaffected by how the match was driven, only by how far it got", () => {
    // dt decides how many substeps a tick runs, nothing else — so the same step
    // index must hash the same however the caller sliced its time. This is what
    // lets the conformance harness compare a browser at 12 fps with a Worker
    // draining the match flat out.
    //
    // Note the thing that makes this fiddly, because it caught me: the number of
    // substeps a tick runs is NOT dt/PHYS_DT exactly. `tick` accumulates dt and
    // drains it in 1/60 pieces, and 1/60 is not binary-exact, so ten ticks of 1.0
    // yield 599 substeps rather than 600. The trajectory per step is unaffected —
    // but it means step count at a tick boundary depends on dt by a step or so, so
    // comparisons must be made at equal STEP indices and never at equal tick counts.
    const TARGET = 600;
    const driveToStep = (coarse: number): SpatialMatch => {
      const m = match(99);
      // Coarse slices while a whole one still fits, then land exactly.
      while (m.steps + Math.floor(coarse * 60) <= TARGET) m.tick(coarse);
      while (m.steps < TARGET) m.tick(1 / 60);
      return m;
    };
    const perStep = driveToStep(1 / 60);
    const perTenth = driveToStep(0.1);
    const perSecond = driveToStep(1.0);

    expect([perStep.steps, perTenth.steps, perSecond.steps]).toEqual([TARGET, TARGET, TARGET]);
    expect(perTenth.stateHash()).toBe(perStep.stateHash());
    expect(perSecond.stateHash()).toBe(perStep.stateHash());
  });
});
