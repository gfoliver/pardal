import { MatchRules, SubstitutionRules } from "@fut/domain";
import { MatchSimulator } from "@fut/engine";
import { MatchEngine } from "@fut/spatial";
import { buildTeam } from "./teamFactory.js";

/**
 * How each engine converts a RATING GAP into a result.
 *
 * The parity harness compares mean stats on a mirrored fixture, which says nothing
 * about the property that actually decides a league: how much better a better team
 * does. If the two engines disagree there, then a strong club's expected points
 * depend on which engine played its fixtures — the same unfairness as the card gap,
 * but on the result itself rather than a stat column.
 *
 * So this is the constraint any calibration has to PRESERVE, not just a diagnostic:
 * tuning fouls or shot accuracy to close a stat gap is worthless if it flattens or
 * steepens the rating response on the way.
 *
 * Sample sizes are deliberately LOPSIDED. A zone match costs ~15 ms and a spatial
 * match ~6.4 s, so the zone column can be made almost exact for free while spatial
 * is the budget. Do not skimp: at 30 per cell the zone curve came out
 * NON-MONOTONIC (gap 6 above gap 12) and showed the home side losing more than it
 * won at equal ratings — both pure noise, and both would have been read as findings.
 *
 * Run: npx tsx packages/app-cli/src/engineRatingCurve.ts [zoneN] [spatialN] [onlyGap]
 *
 * `onlyGap` runs a single cell, so the four cells can be run as parallel processes
 * and their output pasted together.
 */
const ZONE_N = Number(process.argv[2] ?? 2000);
const SPATIAL_N = Number(process.argv[3] ?? 150);
const ONLY_GAP = process.argv[4] === undefined ? null : Number(process.argv[4]);
const HOME = 80;
const GAPS = (ONLY_GAP === null ? [0, 6, 12, 18] : [ONLY_GAP]) as readonly number[];

interface Outcome {
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
}
const zero = (): Outcome => ({ won: 0, drawn: 0, lost: 0, gf: 0, ga: 0 });
const played = (o: Outcome): number => o.won + o.drawn + o.lost;
const tally = (o: Outcome, h: number, a: number): void => {
  o.gf += h;
  o.ga += a;
  if (h > a) o.won++;
  else if (h < a) o.lost++;
  else o.drawn++;
};

const mk = (id: string, rating: number) =>
  buildTeam({ id, name: id, shortName: id.toUpperCase().slice(0, 3), rating });

const sim = new MatchSimulator();

function zoneRun(gap: number): Outcome {
  const o = zero();
  for (let seed = 1; seed <= ZONE_N; seed++) {
    const r = sim.simulate({
      home: mk("home", HOME),
      away: mk("away", HOME - gap),
      seed,
      matchRules: MatchRules.league(),
      substitutionRules: SubstitutionRules.brasileirao(),
    });
    tally(o, r.stats.home.goals, r.stats.away.goals);
  }
  return o;
}

function spatialRun(gap: number): Outcome {
  const o = zero();
  for (let seed = 1; seed <= SPATIAL_N; seed++) {
    const e = new MatchEngine(mk("home", HOME), mk("away", HOME - gap), seed);
    let guard = 0;
    while (!e.finished && guard++ < 200000) e.tick(0.1);
    tally(o, e.score.home, e.score.away);
  }
  return o;
}

/** Points per match for the stronger side — the league-relevant summary. */
const ppm = (o: Outcome): number => (o.won * 3 + o.drawn) / played(o);
const winPct = (o: Outcome): number => (o.won / played(o)) * 100;
const gd = (o: Outcome): number => (o.gf - o.ga) / played(o);
/** Standard error of ppm, so a gap can be read against its own noise. */
const ppmSe = (o: Outcome): number => {
  const n = played(o);
  const mean = ppm(o);
  const varr = (o.won * (3 - mean) ** 2 + o.drawn * (1 - mean) ** 2 + o.lost * (0 - mean) ** 2) / n;
  return Math.sqrt(varr / n);
};

console.log(`\nRating response — home ${HOME} vs (${HOME} − gap); zone n=${ZONE_N}, spatial n=${SPATIAL_N}\n`);
console.log(
  "gap".padStart(4) +
    "  |" +
    "ZONE ppm".padStart(10) +
    "win%".padStart(8) +
    "GD".padStart(7) +
    "  |" +
    "SPATIAL ppm".padStart(13) +
    "win%".padStart(8) +
    "GD".padStart(7) +
    "  | ppm gap    noise",
);
const rows: { gap: number; z: Outcome; s: Outcome }[] = [];
for (const gap of GAPS) {
  const z = zoneRun(gap);
  const s = spatialRun(gap);
  rows.push({ gap, z, s });
  const d = ppm(s) - ppm(z);
  // Read the gap against the noise of the two cells it is made of, or you will
  // "find" a difference that is a coin toss.
  const se = Math.sqrt(ppmSe(z) ** 2 + ppmSe(s) ** 2);
  console.log(
    String(gap).padStart(4) +
      "  |" +
      ppm(z).toFixed(2).padStart(10) +
      winPct(z).toFixed(0).padStart(8) +
      gd(z).toFixed(2).padStart(7) +
      "  |" +
      ppm(s).toFixed(2).padStart(13) +
      winPct(s).toFixed(0).padStart(8) +
      gd(s).toFixed(2).padStart(7) +
      "  |" +
      `${d >= 0 ? "+" : ""}${d.toFixed(2)}`.padStart(9) +
      `${(Math.abs(d) / se).toFixed(1)} SE`.padStart(9),
  );
}

// The SLOPE is what matters: how many points a 6-rating advantage is worth.
// Least squares over ALL cells, not endpoint-minus-endpoint: an endpoint slope
// inherits the full noise of two cells, and the gap-0 cell is exactly the one that
// came out wrong at small n.
const slope = (pick: (r: { z: Outcome; s: Outcome }) => Outcome): string => {
  if (rows.length < 2) return "n/a";
  const xs = rows.map((r) => r.gap);
  const ys = rows.map((r) => ppm(pick(r)));
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  xs.forEach((x, i) => {
    num += (x - mx) * (ys[i]! - my);
    den += (x - mx) ** 2;
  });
  return ((num / den) * 6).toFixed(2);
};
console.log(
  `\nppm gained per 6 rating points (least squares) — zone ${slope((r) => r.z)}, spatial ${slope((r) => r.s)}`,
);
console.log(
  `\nCalibrating one engine toward the other must keep these two columns tracking each\n` +
    `other. A stat gap can be closed by a constant; this slope cannot, and it is the\n` +
    `one a manager would actually notice.\n`,
);
