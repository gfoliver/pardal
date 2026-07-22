import { SpatialMatch } from "@fut/spatial";
import { buildTeam } from "./teamFactory.js";

// Calibration harness for the spatial engine over many seeds. Run:
//   npx tsx packages/app-cli/src/spatialDiag.ts
const N = 100;
const acc = { gh: 0, ga: 0, sh: 0, sa: 0, ph: 0, pa: 0, comp: 0, passes: 0, tackles: 0, poss: 0 };
const scores: string[] = [];
const byHalf: Record<string, number> = { homeH1: 0, homeH2: 0, awayH1: 0, awayH2: 0 };
const ownTicks: Record<string, number> = { home: 0, away: 0, loose: 0 };
const gains: Record<string, number> = { home: 0, away: 0 };
const defDepth = { home: 0, away: 0 }; const defTicks = { home: 0, away: 0 };
const trans: Record<string, number> = { homeTackled: 0, awayTackled: 0, homeReleased: 0, awayReleased: 0, homeRecovered: 0, awayRecovered: 0 };
const matrix: Record<string, number> = { "home->home": 0, "home->away": 0, "away->home": 0, "away->away": 0 };

for (let seed = 1; seed <= N; seed++) {
  let prevOwner: string = "";
  let releasedBy: string = "";
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
    // Defensive block depth (avg distance of outfielders from their OWN goal).
    const defTeam = s.possessionTeamId === "home" ? "away" : "home";
    const defs = s.players.filter((p) => p.teamId === defTeam && String(p.pos) !== "goalkeeper");
    if (defs.length) {
      const avgY = defs.reduce((a, p) => a + p.y, 0) / defs.length;
      defDepth[defTeam] += defTeam === "home" ? 100 - avgY : avgY;
      defTicks[defTeam]++;
    }
    const owner = s.players.find((p) => p.hasBall);
    const cur = owner ? owner.teamId : "loose";
    if (owner) {
      ownTicks[owner.teamId]++;
      if (owner.teamId !== prevOwner) gains[owner.teamId]++;
    } else ownTicks.loose++;
    // Classify transitions.
    if (prevOwner === "home" && cur === "away") trans.homeTackled++;
    else if (prevOwner === "away" && cur === "home") trans.awayTackled++;
    else if (prevOwner === "home" && cur === "loose") { trans.homeReleased++; releasedBy = "home"; }
    else if (prevOwner === "away" && cur === "loose") { trans.awayReleased++; releasedBy = "away"; }
    else if (prevOwner === "loose" && cur === "home") { trans.homeRecovered++; matrix[`${releasedBy}->home`]++; }
    else if (prevOwner === "loose" && cur === "away") { trans.awayRecovered++; matrix[`${releasedBy}->away`]++; }
    prevOwner = cur;
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
console.log("gains (possessions won)", gains);
console.log("avg spell (s)", { home: (ownTicks.home/gains.home*0.1).toFixed(1), away: (ownTicks.away/gains.away*0.1).toFixed(1) });
console.log("transitions", trans);
console.log("loose-ball matrix (releasedBy->recoveredBy)", matrix);
console.log("avg def block depth from own goal (m-screen%)", { home: (defDepth.home/defTicks.home).toFixed(1), away: (defDepth.away/defTicks.away).toFixed(1) });
