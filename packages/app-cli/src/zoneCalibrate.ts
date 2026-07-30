import { MatchRules, SubstitutionRules } from "@fut/domain";
import { MatchEventType, MatchSimulator, possessionPercent } from "@fut/engine";
import { buildTeam } from "./teamFactory.js";

/**
 * Fast zone-only calibration loop, against the spatial engine's measured numbers.
 *
 * The spatial engine is the REFERENCE now — it is the one a human actually watches,
 * so it defines the game's feel, and the zone engine (which plays CPU-vs-CPU
 * fixtures in a multiplayer league) is calibrated toward it. That is the opposite of
 * the direction `balance.ts` was written for.
 *
 * A zone match costs ~15 ms against spatial's ~6.4 s, so the spatial targets are
 * measured ONCE (recorded below with their noise) and iteration happens here at a
 * sample size where the zone column is effectively exact.
 *
 * The targets carry standard errors for a reason: two of these "gaps" are barely
 * outside noise and must NOT be chased with a constant. See the priority note below.
 *
 * Run: npx tsx packages/app-cli/src/zoneCalibrate.ts [N]
 */

/**
 * Spatial, mirror 4-4-2 rating 80, per team per match, n=60 (`npm run balance:parity`).
 * `se` is the standard error of that measurement — the resolution of the target.
 */
const TARGET = {
  goals: { value: 1.27, se: 0.11 },
  shots: { value: 13.46, se: 0.5 },
  onTarget: { value: 4.74, se: 0.25 },
  fouls: { value: 8.21, se: 0.23 },
  yellow: { value: 1.99, se: 0.09 },
  red: { value: 0.25, se: 0.06 },
  offsides: { value: 3.6, se: 0.2 },
  corners: { value: 4.74, se: 0.3 },
} as const;

const N = Number(process.argv[2] ?? 600);
const RATING = 80;
const mk = (id: string, rating = RATING) =>
  buildTeam({ id, name: id, shortName: id.toUpperCase().slice(0, 3), rating });

const acc = {
  goals: 0, shots: 0, onTarget: 0, fouls: 0, yellow: 0, red: 0, offsides: 0, corners: 0,
  poss: 0, tackles: 0, passes: 0, passesCompleted: 0, injuries: 0,
};

const sim = new MatchSimulator();
for (let seed = 1; seed <= N; seed++) {
  const r = sim.simulate({
    home: mk("home"), away: mk("away"), seed,
    matchRules: MatchRules.league(), substitutionRules: SubstitutionRules.brasileirao(),
  });
  for (const s of [r.stats.home, r.stats.away]) {
    acc.goals += s.goals; acc.shots += s.shots; acc.onTarget += s.shotsOnTarget;
    acc.fouls += s.fouls; acc.yellow += s.yellowCards; acc.red += s.redCards;
    acc.offsides += s.offsides; acc.corners += s.corners; acc.tackles += s.tackles;
    acc.passes += s.passes; acc.passesCompleted += s.passesCompleted;
  }
  acc.poss += possessionPercent(r.stats.home, r.stats.away).home;
  acc.injuries += r.timeline.filter((e) => e.type === MatchEventType.Injury).length;
}

const per = (x: number) => x / (N * 2);
console.log(`\nZone vs the spatial reference — mirror 4-4-2 rating ${RATING}, ${N} zone matches\n`);
console.log(
  "".padEnd(12) + "ZONE".padStart(8) + "TARGET".padStart(9) + "delta".padStart(9) + "  (target noise)",
);
let worst = 0;
for (const [key, t] of Object.entries(TARGET) as [keyof typeof TARGET, { value: number; se: number }][]) {
  const got = per(acc[key]);
  const delta = got - t.value;
  const inNoise = Math.abs(delta) <= 2 * t.se;
  const sigmas = Math.abs(delta) / t.se;
  if (!inNoise) worst = Math.max(worst, sigmas);
  console.log(
    key.padEnd(12) +
      got.toFixed(2).padStart(8) +
      t.value.toFixed(2).padStart(9) +
      `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`.padStart(9) +
      `   ±${t.se.toFixed(2)}  ${inNoise ? "within noise" : `${sigmas.toFixed(1)} SE OFF`}`,
  );
}

console.log(
  `\nderived: conversion ${((acc.goals / acc.shots) * 100).toFixed(1)}% | ` +
    `on-target share ${((acc.onTarget / acc.shots) * 100).toFixed(1)}% | ` +
    `goals per on-target ${((acc.goals / acc.onTarget) * 100).toFixed(1)}%`,
);
console.log(
  `         yellow per foul ${(acc.yellow / acc.fouls).toFixed(3)} | ` +
    `red per foul ${(acc.red / acc.fouls).toFixed(4)} | ` +
    `tackles ${per(acc.tackles).toFixed(1)} | ` +
    `pass completion ${((acc.passesCompleted / acc.passes) * 100).toFixed(0)}% | ` +
    `possession(home) ${(acc.poss / N).toFixed(1)}%`,
);
console.log(
  `\nPriority, by how far outside its own noise each gap sits — chasing a 1-2 SE gap\n` +
    `with a constant is exactly the blind tuning that hides real bugs.\n`,
);
