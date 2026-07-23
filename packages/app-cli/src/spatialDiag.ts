import { MatchEngine } from "@fut/spatial";
import { buildTeam } from "./teamFactory.js";

// Calibration harness for the layered spatial engine. Run:
//   npx tsx packages/app-cli/src/spatialDiag.ts [N]
const N = Number(process.argv[2] ?? 100);

const acc = { g: 0, sh: 0, sot: 0, passes: 0, comp: 0, tk: 0, poss: 0, ticks: 0 };
const side = { gHome: 0, gAway: 0, shHome: 0, shAway: 0, possH1: 0, possH2: 0, passH: 0, compH: 0, passA: 0, compA: 0, tkH: 0, tkA: 0 };
const scores: string[] = [];
const tele = { decisions: 0, pass: 0, dribble: 0, hold: 0, shoot: 0, clear: 0, passComplete: 0, passIntercept: 0, passOut: 0 };

// Average positioning (metres up-pitch from own goal), by line, split by phase.
type Line = "gk" | "def" | "mid" | "fwd";
const mkLines = () => ({ gk: 0, def: 0, mid: 0, fwd: 0 }) as Record<Line, number>;
const posSum = { atk: mkLines(), def: mkLines() };
const posN = { atk: mkLines(), def: mkLines() };
const teamDef = { homeatk: { s: 0, n: 0 }, homedef: { s: 0, n: 0 }, awayatk: { s: 0, n: 0 }, awaydef: { s: 0, n: 0 } };
let spacingSum = 0;
let spacingN = 0;
let gkAheadTicks = 0;
let posSampleTicks = 0;

for (let seed = 1; seed <= N; seed++) {
  const home = buildTeam({ id: "home", name: "Home FC", shortName: "HOM", rating: 72 });
  const away = buildTeam({ id: "away", name: "Away FC", shortName: "AWY", rating: 72 });
  // Use MatchEngine directly to read internal state (agents, telemetry).
  const eng = new MatchEngine(home, away, seed);
  let ticks = 0;
  let hp = 0;
  let hpH1 = 0;
  let h1ticks = 0;
  while (!eng.finished && ticks < 60000) {
    eng.tick(0.1);
    const st = eng.state;
    if (st.possessionTeamId === "home") hp++;
    if (eng.minute < 45) { h1ticks++; if (st.possessionTeamId === "home") hpH1++; }

    if (ticks % 5 === 0) {
      posSampleTicks++;
      for (const team of ["home", "away"] as const) {
        const mine = st.agents.filter((a) => a.teamId === team);
        const phase = team === st.possessionTeamId ? "atk" : "def";
        for (const a of mine) {
          const ln: Line = a.isGK ? "gk" : a.baseDepth < 0.35 ? "def" : a.baseDepth < 0.62 ? "mid" : "fwd";
          const advance = a.dir === 1 ? a.pos.x : 105 - a.pos.x;
          posSum[phase][ln] += advance;
          posN[phase][ln] += 1;
          if (ln === "def") {
            const key = `${team}${phase}` as keyof typeof teamDef;
            teamDef[key].s += advance; teamDef[key].n += 1;
          }
        }
        const gk = mine.find((a) => a.isGK);
        const out = mine.filter((a) => !a.isGK);
        const outMax = Math.max(...out.map((a) => (a.dir === 1 ? a.pos.x : 105 - a.pos.x)));
        const gkAdv = gk ? (gk.dir === 1 ? gk.pos.x : 105 - gk.pos.x) : 0;
        if (gk && gkAdv > outMax) gkAheadTicks++;
        for (const a of out) {
          let nd = Infinity;
          for (const b of out) if (b !== a) nd = Math.min(nd, Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y));
          if (nd < Infinity) { spacingSum += nd; spacingN++; }
        }
      }
    }
    ticks++;
  }
  acc.g += eng.score.home + eng.score.away;
  acc.sh += eng.stats.home.shots + eng.stats.away.shots;
  acc.sot += eng.stats.home.shotsOnTarget + eng.stats.away.shotsOnTarget;
  acc.passes += eng.stats.home.passes + eng.stats.away.passes;
  acc.comp += eng.stats.home.passesCompleted + eng.stats.away.passesCompleted;
  acc.tk += eng.stats.home.tackles + eng.stats.away.tackles;
  acc.poss += hp / ticks;
  acc.ticks += ticks;
  side.gHome += eng.score.home;
  side.gAway += eng.score.away;
  side.shHome += eng.stats.home.shots;
  side.shAway += eng.stats.away.shots;
  side.possH1 += hpH1 / (h1ticks || 1);
  side.possH2 += (hp - hpH1) / ((ticks - h1ticks) || 1);
  side.passH += eng.stats.home.passes; side.compH += eng.stats.home.passesCompleted;
  side.passA += eng.stats.away.passes; side.compA += eng.stats.away.passesCompleted;
  side.tkH += eng.stats.home.tackles; side.tkA += eng.stats.away.tackles;
  const t = eng.state.telemetry;
  for (const k of Object.keys(tele) as (keyof typeof tele)[]) tele[k] += t[k];
  if (seed <= 10) scores.push(`${eng.score.home}-${eng.score.away}`);
}

const per = (x: number) => (x / N).toFixed(2);
const avgLine = (phase: "atk" | "def", ln: Line) => (posN[phase][ln] ? posSum[phase][ln] / posN[phase][ln] : 0).toFixed(1);
console.log(`Spatial engine (layered) — ${N} matches (even teams, rating 72)`);
console.log(`goals/team       ${per(acc.g / 2)}`);
console.log(`shots/team       ${per(acc.sh / 2)}   on-target/team ${per(acc.sot / 2)}`);
console.log(`passes/team      ${per(acc.passes / 2)}   completion ${((acc.comp / (acc.passes || 1)) * 100).toFixed(1)}%`);
console.log(`tackles/team     ${per(acc.tk / 2)}`);
console.log(`home possession  ${((acc.poss / N) * 100).toFixed(1)}%  (H1 ${((side.possH1 / N) * 100).toFixed(1)}% / H2 ${((side.possH2 / N) * 100).toFixed(1)}%)`);
console.log(`goals   home ${per(side.gHome)} away ${per(side.gAway)}   shots home ${per(side.shHome)} away ${per(side.shAway)}`);
console.log(`per-team completion  home ${((side.compH / (side.passH || 1)) * 100).toFixed(1)}%  away ${((side.compA / (side.passA || 1)) * 100).toFixed(1)}%`);
console.log(`per-team tackles     home ${per(side.tkH)} away ${per(side.tkA)}`);
console.log(`avg match length ${(acc.ticks / N / 600).toFixed(1)} sim-min of ticks`);
console.log(`sample scores    ${scores.join(", ")}`);
console.log("action mix       ", {
  pass: tele.pass, dribble: tele.dribble, hold: tele.hold, shoot: tele.shoot, clear: tele.clear,
});
console.log("pass fate        ", {
  complete: tele.passComplete, intercepted: tele.passIntercept, out: tele.passOut,
  completionOfResolved: `${((tele.passComplete / ((tele.passComplete + tele.passIntercept + tele.passOut) || 1)) * 100).toFixed(1)}%`,
});
console.log("avg position (m up-pitch from own goal, 0=own … 105=opp)");
console.log(`  in possession   GK ${avgLine("atk", "gk")}  DEF ${avgLine("atk", "def")}  MID ${avgLine("atk", "mid")}  FWD ${avgLine("atk", "fwd")}`);
console.log(`  out of poss.    GK ${avgLine("def", "gk")}  DEF ${avgLine("def", "def")}  MID ${avgLine("def", "mid")}  FWD ${avgLine("def", "fwd")}`);
console.log(`  keeper ahead of last defender: ${((gkAheadTicks / (posSampleTicks * 2)) * 100).toFixed(1)}%`);
console.log(`  avg nearest-teammate spacing: ${(spacingSum / (spacingN || 1)).toFixed(1)} m`);
const td = (k: keyof typeof teamDef) => (teamDef[k].s / (teamDef[k].n || 1)).toFixed(1);
console.log(`  DEF-line advance (m): home atk ${td("homeatk")} def ${td("homedef")} | away atk ${td("awayatk")} def ${td("awaydef")}`);
