import { readFileSync } from "node:fs";
import { positionOverall, type Player, type Team } from "@fut/domain";
import { loadLeagueTeams, type LeagueData } from "@fut/competition";

/**
 * How far apart the league's players actually are, by position.
 *
 * A league-wide standard deviation hides the thing a manager notices, which is the gap between the
 * best players available to him and the ordinary ones IN THE SAME ROLE. A ratings scale can look
 * healthy overall and still leave every striker within two points of every other striker.
 *
 * Reported as the top 20 per position plus the gap from 1st to 20th, so two datasets can be
 * compared on the axis that matters rather than on a single summary number.
 *
 *   npx tsx packages/app-cli/src/ratingSpread.ts <a.json> <b.json>
 */

const load = (path: string) => {
  const teams = loadLeagueTeams(JSON.parse(readFileSync(path, "utf8")) as LeagueData);
  const byPos = new Map<string, { p: Player; club: string; o: number }[]>();
  for (const t of teams as Team[]) {
    for (const p of [...t.startingXi, ...t.bench]) {
      const row = { p, club: t.shortName, o: positionOverall(p, p.position) };
      byPos.set(p.position, [...(byPos.get(p.position) ?? []), row]);
    }
  }
  for (const rows of byPos.values()) rows.sort((a, b) => b.o - a.o);
  return byPos;
};

const paths = process.argv.slice(2);
const sets = paths.map(load);
const positions = [...new Set(sets.flatMap((s) => [...s.keys()]))];
const f = (x: number) => x.toFixed(1);

console.log(`Top-20 spread per position — ${paths.map((p) => p.split(/[\\/]/).pop()).join("  vs  ")}\n`);
console.log(`${"position".padEnd(20)} ${"n".padStart(3)}  ${paths.map((_, i) => `#1    #5    #10   #20   gap(1→20)`).join("   ")}`);
for (const pos of positions) {
  const cells = sets.map((s) => {
    const rows = s.get(pos) ?? [];
    const at = (i: number) => (rows[Math.min(i, rows.length - 1)]?.o ?? 0);
    return `${f(at(0)).padStart(5)} ${f(at(4)).padStart(5)} ${f(at(9)).padStart(5)} ${f(at(19)).padStart(5)} ${f(at(0) - at(19)).padStart(9)}`;
  });
  const n = sets[0]!.get(pos)?.length ?? 0;
  console.log(`${pos.padEnd(20)} ${String(n).padStart(3)}  ${cells.join("   ")}`);
}

// The names, for the positions where a scale problem shows up as implausible ordering.
for (const pos of process.env.SHOW?.split(",") ?? []) {
  console.log(`\n--- ${pos}`);
  sets.forEach((s, i) => {
    const rows = (s.get(pos) ?? []).slice(0, 20);
    console.log(`  ${paths[i]!.split(/[\\/]/).pop()}`);
    console.log(`    ${rows.map((r, k) => `${k + 1}.${r.p.name}(${r.club}) ${f(r.o)}`).join("  ")}`);
  });
}
