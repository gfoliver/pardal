import { readFileSync } from "node:fs";
import { Goalkeeper, MatchRules, SubstitutionRules, positionOverall, type Team } from "@fut/domain";
import { MatchSimulator, possessionPercent } from "@fut/engine";
import { loadLeagueTeams, type LeagueData } from "@fut/competition";

/**
 * What the real dataset actually plays like.
 *
 * `measure.ts` builds synthetic even teams at rating 65, so it is blind to the dataset entirely —
 * it cannot see a change of ratings source. This harness plays a full double round-robin with the
 * squads as emitted and reports both the football aggregates AND the table spread, which is the
 * part a ratings change moves: if every player is compressed into a narrow band the table
 * flattens, and if the ratings are stretched too far the strong clubs run away with it.
 *
 *   npx tsx packages/app-cli/src/datasetSeason.ts <path to league.json>
 */

const path = process.argv[2] ?? "packages/web/src/lib/career/datasets/brasileirao/league.json";
/**
 * Shifts every fixture's seed, so the same squads can play a DIFFERENT season.
 *
 * One season is one sample. That matters most for the squad-rating/position correlation at the end:
 * over forty clubs its sampling error is wide enough that a change of a tenth means nothing, and a
 * single run cannot tell you which. Run a few offsets before believing a movement in it.
 */
const seedOffset = Number(process.argv[3] ?? 0) * 100_000;
const data = JSON.parse(readFileSync(path, "utf8")) as LeagueData;
const teams = loadLeagueTeams(data);

const sim = new MatchSimulator();
const acc = {
  goals: 0, shots: 0, onTarget: 0, passes: 0, passesCompleted: 0,
  tackles: 0, fouls: 0, offsides: 0, corners: 0, yellow: 0, red: 0, possHome: 0,
};
const points = new Map<string, number>(teams.map((t) => [t.id, 0]));
const scored = new Map<string, number>(teams.map((t) => [t.id, 0]));
let matches = 0;
let homeWins = 0;
let draws = 0;

// Double round-robin, every pairing both ways — the same fixture set a season plays.
for (const home of teams) {
  for (const away of teams) {
    if (home.id === away.id) continue;
    matches++;
    const r = sim.simulate({
      home, away, seed: matches + seedOffset,
      matchRules: MatchRules.league(),
      substitutionRules: SubstitutionRules.brasileirao(),
    });
    for (const s of [r.stats.home, r.stats.away]) {
      acc.goals += s.goals; acc.shots += s.shots; acc.onTarget += s.shotsOnTarget;
      acc.passes += s.passes; acc.passesCompleted += s.passesCompleted;
      acc.tackles += s.tackles; acc.fouls += s.fouls; acc.offsides += s.offsides;
      acc.corners += s.corners; acc.yellow += s.yellowCards; acc.red += s.redCards;
    }
    acc.possHome += possessionPercent(r.stats.home, r.stats.away).home;
    scored.set(home.id, scored.get(home.id)! + r.stats.home.goals);
    scored.set(away.id, scored.get(away.id)! + r.stats.away.goals);
    if (r.stats.home.goals > r.stats.away.goals) { points.set(home.id, points.get(home.id)! + 3); homeWins++; }
    else if (r.stats.away.goals > r.stats.home.goals) points.set(away.id, points.get(away.id)! + 3);
    else { points.set(home.id, points.get(home.id)! + 1); points.set(away.id, points.get(away.id)! + 1); draws++; }
  }
}

const stats = (xs: readonly number[]) => {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  return { mean, sd, min: Math.min(...xs), max: Math.max(...xs) };
};
/** Everyone who can take the field, which is the population the result depends on. */
const squadOf = (t: Team) => [...t.startingXi, ...t.bench];
/** Every attribute of every player, flat — the pool a ratings source defines. */
const pool = teams.flatMap((t: Team) =>
  squadOf(t).flatMap((p) => [
    ...Object.values(p.physical), ...Object.values(p.mental), ...Object.values(p.technical),
    ...(p instanceof Goalkeeper ? Object.values(p.goalkeeping) : []),
  ] as number[]),
);
const overalls = teams.flatMap((t: Team) => squadOf(t).map((p) => positionOverall(p, p.position)));
/** The XI a manager actually picks — the number that should predict where a club finishes. */
const squadRating = teams.map((t: Team) => {
  const xi = t.startingXi.map((p) => positionOverall(p, p.position));
  return xi.reduce((a, b) => a + b, 0) / xi.length;
});

const per = (x: number) => (x / (matches * 2)).toFixed(2);
const f1 = (x: number) => x.toFixed(1);
const f2 = (x: number) => x.toFixed(2);
console.log(`${path}`);
console.log(`${teams.length} clubs · ${matches} matches (double round-robin)\n`);
console.log(`Per team per match:`);
console.log(`  goals        ${per(acc.goals)}`);
console.log(`  shots        ${per(acc.shots)}`);
console.log(`  onTarget     ${per(acc.onTarget)}`);
console.log(`  passes       ${per(acc.passes)}`);
console.log(`  passAcc      ${f1((acc.passesCompleted / acc.passes) * 100)}%`);
console.log(`  tackles      ${per(acc.tackles)}`);
console.log(`  fouls        ${per(acc.fouls)}`);
console.log(`  offsides     ${per(acc.offsides)}`);
console.log(`  corners      ${per(acc.corners)}`);
console.log(`  yellow       ${per(acc.yellow)}`);
console.log(`  red          ${per(acc.red)}`);
console.log(`  poss(home)   ${f1(acc.possHome / matches)}%`);
console.log(`  home wins    ${f1((homeWins / matches) * 100)}%   draws ${f1((draws / matches) * 100)}%\n`);

const a = stats(pool), o = stats(overalls), sr = stats(squadRating);
const pts = [...points.values()].sort((x, y) => y - x);
const p = stats(pts);
console.log(`Attribute pool  mean ${f1(a.mean)}  sd ${f2(a.sd)}  range ${a.min}–${a.max}  (n=${pool.length})`);
console.log(`Player overall  mean ${f1(o.mean)}  sd ${f2(o.sd)}  range ${f1(o.min)}–${f1(o.max)}`);
console.log(`Squad rating    mean ${f1(sr.mean)}  sd ${f2(sr.sd)}  range ${f1(sr.min)}–${f1(sr.max)}`);
console.log(`Points          mean ${f1(p.mean)}  sd ${f2(p.sd)}  champion ${pts[0]}  bottom ${pts.at(-1)}  spread ${pts[0]! - pts.at(-1)!}`);
// Does a better squad actually finish higher? A ratings source that compresses the league drives
// this towards 0 however sensible the per-match aggregates look.
const rank = (xs: readonly number[]) => xs.map((v) => xs.filter((w) => w > v).length);
const rs = rank(squadRating), rp = rank(teams.map((t) => points.get(t.id)!));
const n = teams.length;
const rho = 1 - (6 * rs.reduce((s, v, i) => s + (v - rp[i]!) ** 2, 0)) / (n * (n * n - 1));
console.log(`Squad-rating → finishing position, Spearman ρ ${f2(rho)}`);
