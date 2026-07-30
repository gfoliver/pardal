import { MatchRules, SubstitutionRules } from "@fut/domain";
import { MatchEventType, MatchSimulator, possessionPercent } from "@fut/engine";
import { MatchEngine } from "@fut/spatial";
import { buildTeam } from "./teamFactory.js";

/**
 * Engine PARITY, for the multiplayer league.
 *
 * A competitive league runs CPU-vs-CPU fixtures through the fast zone engine and
 * anything involving a human through the spatial engine — but both feed ONE table,
 * one top-scorer list and one set of suspensions. So the question is not "is each
 * engine deterministic" (it is) but "does it matter which engine played your
 * fixture". Anywhere the two disagree systematically, a manager's league position
 * depends on who happened to be on their schedule.
 *
 * Run: npx tsx packages/app-cli/src/engineParity.ts [N]
 */
const N = Number(process.argv[2] ?? 60);
const RATING = 80;
const mk = (id: string) => buildTeam({ id, name: id, shortName: id.toUpperCase().slice(0, 3), rating: RATING });

interface Acc {
  goals: number; shots: number; onTarget: number; fouls: number; offs: number;
  corners: number; yellow: number; red: number; poss: number; injuries: number;
}
const zero = (): Acc => ({ goals: 0, shots: 0, onTarget: 0, fouls: 0, offs: 0, corners: 0, yellow: 0, red: 0, poss: 0, injuries: 0 });

const z = zero();
const sp = zero();
const sim = new MatchSimulator();

for (let seed = 1; seed <= N; seed++) {
  const r = sim.simulate({
    home: mk("home"), away: mk("away"), seed,
    matchRules: MatchRules.league(), substitutionRules: SubstitutionRules.brasileirao(),
  });
  for (const s of [r.stats.home, r.stats.away]) {
    z.goals += s.goals; z.shots += s.shots; z.onTarget += s.shotsOnTarget;
    z.fouls += s.fouls; z.offs += s.offsides; z.corners += s.corners;
    z.yellow += s.yellowCards; z.red += s.redCards;
  }
  z.poss += possessionPercent(r.stats.home, r.stats.away).home;
  z.injuries += r.timeline.filter((e) => e.type === MatchEventType.Injury).length;
}

for (let seed = 1; seed <= N; seed++) {
  const eng = new MatchEngine(mk("home"), mk("away"), seed);
  let guard = 0;
  while (!eng.finished && guard++ < 200000) eng.tick(0.1);
  for (const s of [eng.stats.home, eng.stats.away]) {
    sp.goals += s.goals; sp.shots += s.shots; sp.onTarget += s.shotsOnTarget;
    sp.fouls += s.fouls; sp.offs += s.offsides; sp.corners += s.corners;
    sp.yellow += s.yellowCards; sp.red += s.redCards;
  }
  sp.poss += possessionPercent(eng.stats.home, eng.stats.away).home;
  sp.injuries += eng.events.filter((e) => e.type === MatchEventType.Injury).length;
}

const per = (x: number) => x / (N * 2);
const row = (label: string, a: number, b: number, digits = 2) => {
  const gap = a === 0 ? (b === 0 ? 0 : Infinity) : ((b - a) / a) * 100;
  const flag = Math.abs(gap) >= 25 ? "  <-- diverges" : Math.abs(gap) >= 10 ? "  <-- watch" : "";
  console.log(
    label.padEnd(16) +
      per(a).toFixed(digits).padStart(9) +
      per(b).toFixed(digits).padStart(11) +
      (Number.isFinite(gap) ? `${gap >= 0 ? "+" : ""}${gap.toFixed(0)}%` : "n/a").padStart(9) +
      flag,
  );
};

console.log(`\nEngine parity — mirror 4-4-2 rating ${RATING}, ${N} matches each, per team per match\n`);
console.log("".padEnd(16) + "ZONE".padStart(9) + "SPATIAL".padStart(11) + "gap".padStart(9));
row("goals", z.goals, sp.goals);
row("shots", z.shots, sp.shots);
row("shots on target", z.onTarget, sp.onTarget);
row("corners", z.corners, sp.corners);
row("fouls", z.fouls, sp.fouls);
row("yellow cards", z.yellow, sp.yellow);
row("red cards", z.red, sp.red, 3);
row("offsides", z.offs, sp.offs);
console.log("possession home%".padEnd(16) + (z.poss / N).toFixed(1).padStart(9) + (sp.poss / N).toFixed(1).padStart(11));
console.log("injuries/match".padEnd(16) + (z.injuries / N).toFixed(2).padStart(9) + (sp.injuries / N).toFixed(2).padStart(11));
console.log(
  `\nA league mixing the two shares one table, one scorers list and one suspension\n` +
    `ledger, so every "diverges" row is a place where your standing depends on which\n` +
    `engine happened to play your fixtures.\n`,
);
