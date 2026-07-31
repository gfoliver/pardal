import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runPipeline, type RawSnapshot } from "@fut/dataset";
import { Position } from "@fut/domain";
import { SeededRandom } from "@fut/engine";
import { devSeed, effectiveOverall, indexPlayers, newPlayerDev, progressSeason, type PlayerDev } from "@fut/career";

/**
 * What ageing does to a real squad, in DISPLAYED overall points.
 *
 * Written because "the end-of-season progression is too aggressive — players losing 10
 * rating from one year to the next" is a claim about the number the manager reads on the
 * squad screen, while `progressSeason` is written in CA (0..200). Half of any CA change
 * lands on the overall, so a CA figure in the engine is worth half what it looks like, and
 * the two branches that can move a rating are on completely different scales.
 *
 * Prints the DISTRIBUTION per age, not the mean — a mean hides the case being complained
 * about. Read `worst` and `p10`.
 *
 * Run: npx tsx packages/app-cli/src/careerProgression.ts [seasons] [seed]
 */
const SEASONS = Number(process.argv[2] ?? 10);
const SEED = Number(process.argv[3] ?? 7);

const RAW: RawSnapshot = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../dataset/data/brasileirao-serie-a/raw.json", import.meta.url)), "utf8"),
);
const { league } = runPipeline(RAW);
const dataById = indexPlayers(league);

/** One observed season for one player: how old he was, and what his rating did. */
interface Step {
  readonly age: number;
  readonly delta: number;
  readonly gk: boolean;
}
/** A player's rating season by season, for the peak-to-veteran question. */
interface Trail {
  readonly name: string;
  readonly startAge: number;
  readonly ratings: number[];
}

const steps: Step[] = [];
const trails: Trail[] = [];

for (const team of league.teams) {
  for (const data of team.players) {
    // Rebuild the dev record exactly as createCareer does, so age, CA and the hidden
    // ceiling are the ones a real career actually starts with.
    const rng0 = new SeededRandom(devSeed(SEED, 0, data.id));
    const ca = clamp(Math.round(effectiveOverall(data) * 2), 1, 200);
    const room = data.age < 24 ? 10 + rng0.int(41) : rng0.int(11);
    const dev: PlayerDev = newPlayerDev(data.id, ca, clamp(ca + room, ca, 200), data.age);
    const isGk = data.position === Position.Goalkeeper;

    const ratings: number[] = [Math.round(effectiveOverall(data, dev))];
    for (let season = 1; season <= SEASONS; season++) {
      const age = dev.ageAtSeasonStart;
      const before = effectiveOverall(data, dev);
      progressSeason(dev, new SeededRandom(devSeed(SEED, season, data.id)), isGk);
      steps.push({ age, delta: Math.round(effectiveOverall(data, dev)) - Math.round(before), gk: isGk });
      ratings.push(Math.round(effectiveOverall(data, dev)));
    }
    trails.push({ name: data.name, startAge: data.age, ratings });
  }
}

console.log(`\nAgeing over ${SEASONS} seasons, Brasileirão, seed ${SEED} — DISPLAYED overall change per season\n`);
console.log("age at season start     n     mean   median      p10     worst     best");
for (const age of [...new Set(steps.map((s) => s.age))].sort((a, b) => a - b)) {
  const ds = steps.filter((s) => s.age === age).map((s) => s.delta).sort((a, b) => a - b);
  if (ds.length < 5) continue; // too few to say anything about
  const at = (q: number) => ds[Math.min(ds.length - 1, Math.floor(q * ds.length))]!;
  const mean = ds.reduce((a, b) => a + b, 0) / ds.length;
  console.log(
    `${String(age).padStart(19)}  ${String(ds.length).padStart(6)}  ${mean.toFixed(2).padStart(7)}  ` +
      `${String(at(0.5)).padStart(7)}  ${String(at(0.1)).padStart(7)}  ${String(ds[0]).padStart(8)}  ${String(ds[ds.length - 1]).padStart(7)}`,
  );
}

const worst = [...steps].sort((a, b) => a.delta - b.delta)[0]!;
const dropped5 = steps.filter((s) => s.delta <= -5).length;
console.log(
  `\nworst single season: ${worst.delta} at age ${worst.age}.  ` +
    `seasons losing 5+ points: ${dropped5}/${steps.length} (${((dropped5 / steps.length) * 100).toFixed(1)}%)`,
);

// Keepers are meant to peak later, so the split has to be visible or the constant that
// says so is unverified.
console.log("\nmean change by age, keepers vs outfielders");
console.log("age        gk   outfield");
for (const age of [30, 32, 34, 36, 38]) {
  const mean = (xs: Step[]) => (xs.length === 0 ? NaN : xs.reduce((a, b) => a + b.delta, 0) / xs.length);
  const here = steps.filter((s) => s.age === age);
  const g = mean(here.filter((s) => s.gk));
  const o = mean(here.filter((s) => !s.gk));
  console.log(`${String(age).padStart(3)}  ${g.toFixed(2).padStart(8)}  ${o.toFixed(2).padStart(9)}`);
}

// The other half of the question: one gentle season is fine if eight of them still wipe
// out a career. Shown for the archetype nearest each starting age.
console.log("\ntrajectories (rating each season, from the given starting age)");
for (const startAge of [18, 22, 26, 30, 34]) {
  const pick = trails
    .filter((t) => t.startAge === startAge)
    .sort((a, b) => b.ratings[0]! - a.ratings[0]!)[0];
  if (!pick) continue;
  const net = pick.ratings.at(-1)! - pick.ratings[0]!;
  console.log(`  ${String(startAge).padStart(2)}  ${pick.name.padEnd(22)} ${pick.ratings.join(" ")}   net ${net >= 0 ? "+" : ""}${net}`);
}
console.log(
  "\nA season's rating change is round(CA change / 2), so an engine-side CA constant is\n" +
    "worth half as much as it looks on the squad screen.\n",
);

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}
