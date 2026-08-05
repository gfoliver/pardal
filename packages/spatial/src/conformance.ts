import {
  Coach,
  Formation,
  getFormationTemplate,
  Goalkeeper,
  Mentality,
  Player,
  Position,
  TacticsBuilder,
  Team,
  type GoalkeepingAttributes,
  type MentalAttributes,
  type PhysicalAttributes,
  type TechnicalAttributes,
} from "@fut/domain";
import { MatchEngine } from "./MatchEngine.js";

/**
 * The cross-runtime conformance trace.
 *
 * The engine claims to produce identical results on every JS engine. This turns that
 * claim into a comparable artifact: a list of (seed, step, state hash) samples that
 * any runtime can produce and any two runtimes can diff. The committed golden trace
 * is what CI checks Node against; the same function, loaded in a browser page or a
 * `workerd` isolate, is what checks those.
 *
 * Two design points worth defending:
 *
 * - The fixture is built HERE, from `@fut/domain` alone, rather than reusing the
 *   `buildTeam` helper the tests use. Partly direction of dependency (that helper
 *   lives in a dev package which itself depends on this one), but mostly because a
 *   golden trace has to pin its INPUTS as firmly as its outputs — otherwise an
 *   unrelated edit to a test helper breaks the golden and teaches everyone to
 *   regenerate it without reading why.
 * - No I/O, no `fs`, no Node built-ins. The module has to load unchanged in a
 *   browser and in a Worker, which is the entire point.
 *
 * A failing trace does NOT necessarily mean a portability bug: a deliberate change
 * to match behaviour will also fail it, which is correct — such a change is exactly
 * what has to bump the engine version, since it invalidates stored replays.
 */

const phys = (v: number): PhysicalAttributes => ({ pace: v, stamina: v, strength: v, agility: v });
const ment = (v: number): MentalAttributes => ({
  decisions: v,
  composure: v,
  workRate: v,
  teamwork: v,
  aggression: v,
  anticipation: v,
  positioning: v,
  vision: v,
  offTheBall: v,
});
const tech = (v: number): TechnicalAttributes => ({
  passing: v,
  technique: v,
  dribbling: v,
  finishing: v,
  shotPower: v,
  tackling: v,
  marking: v,
  crossing: v,
  firstTouch: v,
  heading: v,
});
const gk = (v: number): GoalkeepingAttributes => ({ reflexes: v, handling: v, positioning: v, oneOnOnes: v });

/**
 * Attributes vary per player, by integer arithmetic only. Deliberately NOT a flat
 * rating: identical players make a symmetric match, and a symmetry can hide a bug
 * that only shows when two agents are ranked against each other.
 */
const ratingFor = (base: number, index: number): number => base - 6 + ((index * 7) % 13);

function side(id: string, tag: string, base: number): Team {
  const template = getFormationTemplate(Formation.F442);
  const starters: Player[] = template.map((slot, i) => {
    const v = ratingFor(base, i);
    const pid = `${id}-p${i}`;
    const name = `${tag} ${i}`;
    return slot.position === Position.Goalkeeper
      ? new Goalkeeper({
          id: pid,
          name,
          age: 27,
          nationality: "BR",
          physical: phys(v),
          mental: ment(v),
          technical: tech(v),
          goalkeeping: gk(v),
        })
      : new Player({
          id: pid,
          name,
          age: 25,
          nationality: "BR",
          position: slot.position,
          physical: phys(v),
          mental: ment(v),
          technical: tech(v),
        });
  });
  // A bench, because the engine substitutes on its own and bench ORDER is part of
  // the input — a trace that left it out would not exercise that path at all.
  const benchSpec: readonly Position[] = [
    Position.CentreBack,
    Position.CentralMidfielder,
    Position.Winger,
    Position.Striker,
  ];
  const bench: Player[] = [
    new Goalkeeper({
      id: `${id}-b0`,
      name: `${tag} B0`,
      age: 26,
      nationality: "BR",
      physical: phys(base),
      mental: ment(base),
      technical: tech(base),
      goalkeeping: gk(base),
    }),
    ...benchSpec.map((position, i) => {
      const v = ratingFor(base, i + 11);
      return new Player({
        id: `${id}-b${i + 1}`,
        name: `${tag} B${i + 1}`,
        age: 24,
        nationality: "BR",
        position,
        physical: phys(v),
        mental: ment(v),
        technical: tech(v),
      });
    }),
  ];
  const coach = new Coach({
    id: `${id}-coach`,
    name: `${tag} Coach`,
    age: 50,
    nationality: "BR",
    attributes: { adaptability: 60, tacticalKnowledge: 60, reactiveness: 60, composure: 60 },
  });
  const tactics = new TacticsBuilder().simple(starters, {
    formation: Formation.F442,
    mentality: Mentality.Balanced,
  });
  return new Team({ id, name: tag, shortName: tag.slice(0, 3).toUpperCase(), coach, startingXi: starters, bench, tactics });
}

/** The frozen fixture. Changing anything here invalidates the golden trace. */
export function conformanceFixture(): { home: Team; away: Team } {
  // Different ratings per side, so home/away are not mirror images.
  return { home: side("home", "Home", 72), away: side("away", "Away", 68) };
}

export interface TraceSample {
  readonly seed: number;
  readonly step: number;
  readonly hash: string;
}

export interface ConformanceTrace {
  readonly seeds: readonly number[];
  readonly sampleEvery: number;
  /** `null` = played to full time. (`Infinity` does not survive JSON.) */
  readonly maxSteps: number | null;
  readonly samples: readonly TraceSample[];
  /** Final scoreline per seed, for a human-readable first look at a mismatch. */
  readonly finals: readonly string[];
}

export interface TraceOptions {
  readonly seeds?: readonly number[];
  /** Sample the state hash every N physics substeps. */
  readonly sampleEvery?: number;
  /**
   * Stop each match after this many substeps; `Infinity` (the default) plays to full
   * time.
   *
   * A short cap detects divergence perfectly well — two runtimes that differ do so
   * within a few hundred steps — but it leaves the trace worthless as a record of
   * BEHAVIOUR: 3000 steps is under three match-minutes, so every seed finishes 0-0
   * and the goal, restart and substitution paths are never entered. Full matches
   * cost ~6.5 s of CPU each, which is why the default is three seeds and not thirty.
   */
  readonly maxSteps?: number;
}

/** Produce the trace. Pure, no I/O, and identical on any conforming runtime. */
export function conformanceTrace(options: TraceOptions = {}): ConformanceTrace {
  const seeds = options.seeds ?? [1, 7, 987654321];
  const sampleEvery = options.sampleEvery ?? 5000;
  const maxSteps = options.maxSteps ?? Infinity;
  const samples: TraceSample[] = [];
  const finals: string[] = [];

  for (const seed of seeds) {
    const { home, away } = conformanceFixture();
    const engine = new MatchEngine(home, away, seed);
    let next = sampleEvery;
    // Driven one substep at a time: tick(dt) accumulates and drains dt in 1/60
    // pieces, so a coarse dt would land the samples on different step indices in a
    // runtime-dependent-looking (though actually just arithmetic) way. One substep
    // per tick makes the sample points exact.
    while (!engine.finished && engine.steps < maxSteps) {
      engine.tick(1 / 60);
      if (engine.steps >= next) {
        samples.push({ seed, step: engine.steps, hash: engine.stateHash() });
        next += sampleEvery;
      }
    }
    finals.push(`${engine.score.home}-${engine.score.away}`);
  }

  return { seeds, sampleEvery, maxSteps: Number.isFinite(maxSteps) ? maxSteps : null, samples, finals };
}

export interface TraceDivergence {
  readonly seed: number;
  readonly step: number;
  readonly expected: string;
  readonly actual: string;
}

/**
 * Compare two traces, reporting the FIRST divergence per seed.
 *
 * Only the first matters: after one substep differs the two simulations are
 * different matches, and every later sample differing tells you nothing new. The
 * step it returns is the window to read code in.
 */
export function diffTraces(expected: ConformanceTrace, actual: ConformanceTrace): TraceDivergence[] {
  const key = (s: TraceSample): string => `${s.seed}:${s.step}`;
  const actualByKey = new Map(actual.samples.map((s) => [key(s), s.hash]));
  const out: TraceDivergence[] = [];
  const reported = new Set<number>();
  for (const s of expected.samples) {
    if (reported.has(s.seed)) continue;
    const got = actualByKey.get(key(s));
    if (got === s.hash) continue;
    out.push({ seed: s.seed, step: s.step, expected: s.hash, actual: got ?? "(missing)" });
    reported.add(s.seed);
  }
  return out;
}
