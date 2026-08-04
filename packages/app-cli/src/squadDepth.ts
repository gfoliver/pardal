import { readFileSync } from "node:fs";
import type { LeagueData } from "@fut/competition";
import { Career } from "@fut/career";

/**
 * Where every squad in the league ends up over several seasons.
 *
 * The thing to watch is not one club but the SHAPE of the league: AI clubs are floored at 16 and the
 * manager is not floored at all, so this is the harness that says whether "AI clubs sometimes let
 * players go" churns the league or drains it. `freeAgentIds` has no signing path yet, so every
 * release is currently a permanent withdrawal — the pool column is the size of that leak.
 *
 *   npx tsx packages/app-cli/src/squadDepth.ts [seasons] [seed]
 */

const league = JSON.parse(readFileSync("packages/web/src/lib/career/datasets/brasileirao-serie-a/league.json", "utf8")) as LeagueData;
const world = JSON.parse(readFileSync("packages/web/src/lib/career/datasets/brasileirao-serie-a/world.json", "utf8")) as never;

const seasons = Number(process.argv[2] ?? 5);
const seed = Number(process.argv[3] ?? 4242);
const mine = league.teams.find((t) => t.name.includes("Flamengo"))?.id ?? league.teams[0]!.id;
const c = Career.create(league, { leagueId: "BRA1", managedClubId: mine, seed, world });

const row = (label: string) => {
  const s = c.snapshot();
  const sizes = Object.entries(s.clubs)
    .filter(([id]) => id !== mine)
    .map(([, club]) => club.squad.playerIds.length);
  const mineSize = s.clubs[mine]!.squad.playerIds.length;
  const pool = (s.freeAgentIds ?? []).length;
  const mean = sizes.reduce((a, b) => a + b, 0) / sizes.length;
  const registered = Object.keys(s.contracts).length;
  console.log(
    `${label.padEnd(11)} mine ${String(mineSize).padStart(3)}   AI min ${String(Math.min(...sizes)).padStart(3)}` +
      `  mean ${mean.toFixed(1).padStart(5)}  max ${String(Math.max(...sizes)).padStart(3)}` +
      `   free agents ${String(pool).padStart(4)}   under contract ${String(registered).padStart(4)}`,
  );
};

console.log(`${s0()}\n`);
function s0() {
  const s = c.snapshot();
  return `${s.clubs[mine]!.name} · seed ${seed} · ${Object.keys(s.clubs).length} clubs · season ${s.totalDays} days`;
}

row("start");
for (let i = 0; i < seasons; i++) {
  let guard = 0;
  while (!c.seasonComplete && guard++ < 2_000) c.advance();
  // Counted BEFORE the rollover: it clears the season's results.
  const awarded = c.snapshot().competitions.flatMap((comp) => comp.results.filter((r) => r.status));
  c.rolloverSeason();
  row(`season ${i + 1}`);
  if (awarded.length) {
    const mineAwarded = awarded.filter((r) => r.homeTeamId === mine || r.awayTeamId === mine).length;
    console.log(`            ↳ ${awarded.length} awarded fixtures (${mineAwarded} ours)`);
  }
}

// Where the manager's losses came from, and whether the league can still play.
const s = c.snapshot();
const shortClubs = Object.entries(s.clubs).filter(([, club]) => club.squad.playerIds.length < 11);
console.log(`\nclubs that could not field eleven: ${shortClubs.length}${shortClubs.length ? ` (${shortClubs.map(([id]) => id).join(", ")})` : ""}`);
const forfeits = s.competitions.flatMap((comp) => comp.results.filter((r) => r.status === "forfeit" || r.status === "void"));
console.log(`awarded fixtures in the final season: ${forfeits.length}`);
