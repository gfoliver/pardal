import { SpatialMatch } from "@fut/spatial";
import { buildTeam } from "./teamFactory.js";

// Calibration harness for the spatial engine over many seeds. Run:
//   npx tsx packages/app-cli/src/spatialDiag.ts
const N = 20;
const acc = { gh: 0, ga: 0, sh: 0, sa: 0, ph: 0, pa: 0, comp: 0, passes: 0, tackles: 0, poss: 0 };
const scores: string[] = [];
const byHalf: Record<string, number> = { homeH1: 0, homeH2: 0, awayH1: 0, awayH2: 0 };
const ownTicks: Record<string, number> = { home: 0, away: 0, loose: 0 };

for (let seed = 1; seed <= N; seed++) {
  const m = new SpatialMatch({
    home: buildTeam({ id: "home", name: "Home FC", shortName: "HOM", rating: 72 }),
    away: buildTeam({ id: "away", name: "Away FC", shortName: "AWY", rating: 72 }),
    seed,
  });
  let ticks = 0;
  let hp = 0;
  while (!m.finished && ticks < 60000) {
    m.tick(0.1);
    const s = m.snapshot();
    if (s.possessionTeamId === "home") hp++;
    const owner = s.players.find((p) => p.hasBall);
    if (owner) ownTicks[owner.teamId]++;
    else ownTicks.loose++;
    ticks++;
  }
  acc.gh += m.score.home;
  acc.ga += m.score.away;
  acc.sh += m.stats.home.shots;
  acc.sa += m.stats.away.shots;
  acc.passes += m.stats.home.passes + m.stats.away.passes;
  acc.comp += m.stats.home.passesCompleted + m.stats.away.passesCompleted;
  acc.tackles += m.stats.home.tackles + m.stats.away.tackles;
  acc.poss += hp / ticks;
  for (const e of m.events) {
    if (e.type !== "goal") continue;
    const half = e.minute < 45 ? "H1" : "H2";
    const who = e.teamId === "home" ? "home" : "away";
    byHalf[`${who}${half}`]++;
  }
  if (seed <= 10) scores.push(`${m.score.home}-${m.score.away}`);
}

const per = (x: number) => (x / N).toFixed(2);
console.log(`Spatial engine — ${N} matches (even teams, rating 72)`);
console.log(`goals/team       ${per(acc.gh / 2 + acc.ga / 2)}  (home ${per(acc.gh)}, away ${per(acc.ga)})`);
console.log(`shots/team       ${per(acc.sh / 2 + acc.sa / 2)}  (home ${per(acc.sh)}, away ${per(acc.sa)})`);
console.log(`passes/team      ${per(acc.passes / 2)}`);
console.log(`pass accuracy    ${((acc.comp / acc.passes) * 100).toFixed(1)}%`);
console.log(`tackles/team     ${per(acc.tackles / 2)}`);
console.log(`home possession  ${((acc.poss / N) * 100).toFixed(1)}%`);
console.log(`sample scores    ${scores.join(", ")}`);
console.log("goals by half", byHalf);
console.log("owner ticks", ownTicks);
