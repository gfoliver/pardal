import { MatchEventType } from "@fut/engine";
import { SpatialMatch } from "@fut/spatial";
import { buildTeam } from "./teamFactory.js";

// Diagnostic harness for the spatial engine. Run:
//   npx tsx packages/app-cli/src/spatialDiag.ts

const m = new SpatialMatch({
  home: buildTeam({ id: "home", name: "Home FC", shortName: "HOM", rating: 72 }),
  away: buildTeam({ id: "away", name: "Away FC", shortName: "AWY", rating: 72 }),
  seed: 7,
});

let ticks = 0;
let poss = { home: 0, away: 0 };
let minY = 100; // home attacks toward y=0
let maxY = 0; // away attacks toward y=100
let homeFinalThird = 0;
let awayFinalThird = 0;
let loose = 0;

while (!m.finished && ticks < 60000) {
  m.tick(0.1);
  ticks++;
  const s = m.snapshot();
  if (s.possessionTeamId === "home") poss.home++;
  else poss.away++;
  minY = Math.min(minY, s.ball.y);
  maxY = Math.max(maxY, s.ball.y);
  if (s.ball.y < 30) homeFinalThird++;
  if (s.ball.y > 70) awayFinalThird++;
  const carrier = s.players.find((p) => p.hasBall);
  if (!carrier) loose++;
}

const evCount: Record<string, number> = {};
for (const e of m.events) evCount[e.type] = (evCount[e.type] ?? 0) + 1;

console.log("ticks", ticks, "score", m.score);
console.log("possession%", {
  home: Math.round((poss.home / ticks) * 100),
  away: Math.round((poss.away / ticks) * 100),
});
console.log("looseTicks%", Math.round((loose / ticks) * 100));
console.log("ball closest to away goal (minY, →0)", minY.toFixed(1), "| to home goal (maxY, →100)", maxY.toFixed(1));
console.log("finalThird ticks", { home: homeFinalThird, away: awayFinalThird });
console.log("stats.home", { shots: m.stats.home.shots, passes: m.stats.home.passes, completed: m.stats.home.passesCompleted, tackles: m.stats.home.tackles });
console.log("stats.away", { shots: m.stats.away.shots, passes: m.stats.away.passes, completed: m.stats.away.passesCompleted, tackles: m.stats.away.tackles });
console.log("events", evCount);
console.log("goals", m.events.filter((e) => e.type === MatchEventType.Goal).map((e) => `${e.minute}' ${e.teamId} ${e.playerName}`));
