import { readFileSync } from "node:fs";
import { type Position, positionOverall } from "@fut/domain";
import { loadPlayer } from "@fut/competition";

/**
 * Position-accurate overalls for a league artifact.
 *
 * The flat attribute mean is NOT a player's rating: `positionOverall` weights
 * what his position actually rewards, so a centre-back's marking counts and his
 * finishing does not. Anything comparing players has to use this one.
 *
 * Run: npx tsx packages/app-cli/src/leagueOveralls.ts <league.json>
 */
const league = JSON.parse(readFileSync(process.argv[2]!, "utf8")) as {
  teams: { name: string; players: Record<string, unknown>[] }[];
};

const rate = (p: Record<string, unknown>) => {
  const player = loadPlayer(p as never);
  return Math.round(positionOverall(player, player.position));
};

const rows = league.teams
  .map((t) => {
    const rated = t.players.map((p) => ({ name: String(p.name), pos: String(p.position), ovr: rate(p) })).sort((a, b) => b.ovr - a.ovr);
    const mean = rated.reduce((s, r) => s + r.ovr, 0) / rated.length;
    // The first XI is what actually plays, so it says more than a squad mean.
    const xi = rated.slice(0, 11).reduce((s, r) => s + r.ovr, 0) / Math.min(11, rated.length);
    return { name: t.name, n: rated.length, mean, xi, best: rated[0]!, worst: rated.at(-1)! };
  })
  .sort((a, b) => b.xi - a.xi);

const all = league.teams.flatMap((t) => t.players.map(rate)).sort((a, b) => a - b);
const mean = all.reduce((a, b) => a + b, 0) / all.length;
const sd = Math.sqrt(all.reduce((s, v) => s + (v - mean) ** 2, 0) / all.length);
const q = (f: number) => all[Math.floor(all.length * f)];

console.log(`LEAGUE — ${all.length} players`);
console.log(`  min ${all[0]}  p10 ${q(0.1)}  median ${q(0.5)}  p90 ${q(0.9)}  max ${all.at(-1)}`);
console.log(`  mean ${mean.toFixed(1)}   sd ${sd.toFixed(2)}\n`);

const pad = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n));
console.log(`${"#".padStart(2)}  ${pad("club", 26)} XI  squad  n   ${pad("best", 34)} ${pad("worst", 30)}`);
rows.forEach((r, i) => {
  console.log(
    `${String(i + 1).padStart(2)}  ${pad(r.name, 26)} ${r.xi.toFixed(1).padStart(4)} ${r.mean.toFixed(1).padStart(5)} ${String(r.n).padStart(3)}   ` +
      `${pad(`${r.best.name} ${r.best.ovr} (${r.best.pos})`, 34)} ${pad(`${r.worst.name} ${r.worst.ovr} (${r.worst.pos})`, 30)}`,
  );
});
console.log(`\nbest XI minus worst XI: ${(rows[0]!.xi - rows.at(-1)!.xi).toFixed(1)} points`);
