import { readFileSync } from "node:fs";
import { Goalkeeper } from "@fut/domain";
import { loadLeagueTeams, type LeagueData } from "@fut/competition";

/**
 * How much INDEPENDENT information the ratings actually carry.
 *
 * This is the measurement that justifies a change of ratings source, and it is not the same thing
 * as spread. A source that derives five of our attributes from one of its own figures produces
 * attributes that move in lockstep: the league can look varied in overall terms while every player
 * is really the same player at a different volume, because two attributes that are the same number
 * renamed correlate at 1.00.
 *
 * Reported per player, with each player's own mean subtracted first. Without that step every pair
 * correlates strongly for an uninteresting reason — good players are good at everything — and the
 * measurement would say nothing about the source.
 *
 *   npx tsx packages/app-cli/src/attributeIndependence.ts <league.json>...
 */

const KEYS = [
  "pace", "stamina", "strength", "agility",
  "decisions", "composure", "workRate", "teamwork", "aggression", "anticipation", "positioning", "vision",
  "passing", "technique", "dribbling", "finishing", "shotPower", "tackling", "marking", "crossing",
] as const;

const pearson = (xs: readonly number[], ys: readonly number[]): number => {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx, dy = ys[i]! - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  return sxx === 0 || syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy);
};

for (const path of process.argv.slice(2)) {
  const teams = loadLeagueTeams(JSON.parse(readFileSync(path, "utf8")) as LeagueData);
  const outfielders = teams
    .flatMap((t) => [...t.startingXi, ...t.bench])
    .filter((p) => !(p instanceof Goalkeeper));

  // Each player's attribute vector, centred on his own mean so quality drops out and only SHAPE
  // is left. What survives is whether the source distinguishes these attributes at all.
  const shapes = outfielders.map((p) => {
    const all = { ...p.physical, ...p.mental, ...p.technical } as Record<string, number>;
    const v = KEYS.map((k) => all[k]!);
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    return v.map((x) => x - mean);
  });

  const pairs: { a: string; b: string; r: number }[] = [];
  for (let i = 0; i < KEYS.length; i++) {
    for (let j = i + 1; j < KEYS.length; j++) {
      pairs.push({ a: KEYS[i]!, b: KEYS[j]!, r: pearson(shapes.map((s) => s[i]!), shapes.map((s) => s[j]!)) });
    }
  }
  const abs = pairs.map((p) => Math.abs(p.r)).sort((x, y) => y - x);
  const mean = abs.reduce((a, b) => a + b, 0) / abs.length;
  const locked = pairs.filter((p) => Math.abs(p.r) > 0.9);

  console.log(`\n${path.split(/[\\/]/).pop()}  (${outfielders.length} outfielders)`);
  console.log(`  mean |r| between attribute pairs   ${mean.toFixed(3)}   (lower = more independent)`);
  console.log(`  pairs |r| > 0.90 (same number renamed)  ${locked.length} of ${pairs.length}`);
  console.log(`  pairs |r| > 0.70                        ${abs.filter((r) => r > 0.7).length}`);
  if (locked.length) console.log(`    ${locked.slice(0, 8).map((p) => `${p.a}~${p.b} ${p.r.toFixed(2)}`).join(", ")}`);
}
