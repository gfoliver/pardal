import { MatchRules, SubstitutionRules } from "@fut/domain";
import { MatchSimulator, possessionPercent, type MatchConfig } from "@fut/engine";
import { MatchEngine } from "@fut/spatial";
import { buildTeam } from "./teamFactory.js";

/**
 * Balancing harness. Runs the SAME mirrored fixture — two identical rating-80
 * teams in a 4-4-2 (same athletes, formation and Balanced tactics) — through
 * both engines and prints per-team/match averages side by side. The zone engine
 * is the reference ("satisfactory stats"); we calibrate the spatial engine
 * toward it. Mirrored + equal so tactics/quality can't skew the numbers.
 *
 * Run: npx tsx packages/app-cli/src/balance.ts [N]
 */
const N = Number(process.argv[2] ?? 24);
const RATING = 80;
const mk = (id: string) => buildTeam({ id, name: id, shortName: id.toUpperCase().slice(0, 3), rating: RATING });

interface Acc {
  goals: number; shots: number; onTarget: number; passes: number; pc: number;
  fouls: number; offs: number; corners: number; poss: number;
}
const zero = (): Acc => ({ goals: 0, shots: 0, onTarget: 0, passes: 0, pc: 0, fouls: 0, offs: 0, corners: 0, poss: 0 });
const add = (a: Acc, s: { goals: number; shots: number; shotsOnTarget: number; passes: number; passesCompleted: number; fouls: number; offsides: number; corners: number }) => {
  a.goals += s.goals; a.shots += s.shots; a.onTarget += s.shotsOnTarget; a.passes += s.passes;
  a.pc += s.passesCompleted; a.fouls += s.fouls; a.offs += s.offsides; a.corners += s.corners;
};

const z = zero();
const sp = zero();
const sim = new MatchSimulator();
for (let seed = 1; seed <= N; seed++) {
  const cfg: MatchConfig = { home: mk("home"), away: mk("away"), seed, matchRules: MatchRules.league(), substitutionRules: SubstitutionRules.brasileirao() };
  const r = sim.simulate(cfg);
  add(z, r.stats.home); add(z, r.stats.away);
  z.poss += possessionPercent(r.stats.home, r.stats.away).home;
}
const shotBand = { close: 0, mid: 0, far: 0, header: 0, chip: 0, chipGkOut: 0, chipCount: 0, gkIn: 0, gkOut: 0, gkAdv: 0, goals: 0 };
for (let seed = 1; seed <= N; seed++) {
  const eng = new MatchEngine(mk("home"), mk("away"), seed);
  let t = 0;
  while (!eng.finished && t < 80000) { eng.tick(0.1); t++; }
  add(sp, eng.stats.home); add(sp, eng.stats.away);
  sp.poss += possessionPercent(eng.stats.home, eng.stats.away).home;
  const tl = eng.state.telemetry;
  shotBand.close += tl.shotClose; shotBand.mid += tl.shotMid; shotBand.far += tl.shotFar;
  shotBand.header += tl.headerShot; shotBand.chip += tl.chip;
  shotBand.chipGkOut += tl.chipGkOutSum; shotBand.chipCount += tl.chip;
  shotBand.gkIn += tl.goalKeeperInRange; shotBand.gkOut += tl.goalKeeperOut;
  shotBand.gkAdv += tl.goalKeeperAdvanceSum; shotBand.goals += eng.stats.home.goals + eng.stats.away.goals;
}

const pt = (x: number) => (x / (N * 2)).toFixed(1);
const conv = (a: Acc) => a.shots ? ((a.goals / a.shots) * 100).toFixed(0) + "%" : "-";
const accu = (a: Acc) => a.passes ? ((a.pc / a.passes) * 100).toFixed(0) + "%" : "-";
const row = (label: string, zv: string, sv: string) => console.log(label.padEnd(20) + zv.padStart(10) + sv.padStart(12));

console.log(`\nMirror 4-4-2, rating ${RATING}, ${N} matches — per team / match\n`);
row("", "ZONE(ref)", "SPATIAL");
row("goals", pt(z.goals), pt(sp.goals));
row("shots", pt(z.shots), pt(sp.shots));
row("shots on target", pt(z.onTarget), pt(sp.onTarget));
row("shot conversion", conv(z), conv(sp));
row("passes", pt(z.passes), pt(sp.passes));
row("pass completion", accu(z), accu(sp));
row("corners", pt(z.corners), pt(sp.corners));
row("fouls", pt(z.fouls), pt(sp.fouls));
row("offsides", pt(z.offs), pt(sp.offs));
row("possession home%", (z.poss / N).toFixed(0), (sp.poss / N).toFixed(0));
const b = (x: number) => (x / (N * 2)).toFixed(1);
const totalSp = shotBand.close + shotBand.mid + shotBand.far || 1;
console.log(`\nspatial shot mix / team / match: close<11m ${b(shotBand.close)} (${((shotBand.close / totalSp) * 100).toFixed(0)}%) | mid ${b(shotBand.mid)} | far>20m ${b(shotBand.far)}`);
console.log(`  of which headers ${b(shotBand.header)}, chips ${b(shotBand.chip)} (avg keeper-out ${shotBand.chipCount ? (shotBand.chipGkOut / shotBand.chipCount).toFixed(1) : "-"}m)`);
const gkTot = shotBand.gkIn + shotBand.gkOut || 1;
console.log(`goals by keeper state: OUT-of-range ${((shotBand.gkOut / gkTot) * 100).toFixed(0)}% | in-range-beaten ${((shotBand.gkIn / gkTot) * 100).toFixed(0)}% | avg keeper dist-off-line at goal ${shotBand.goals ? (shotBand.gkAdv / shotBand.goals).toFixed(1) : "-"}m`);
console.log("");
