import { possessionPercent } from "@fut/engine";
import { MatchEngine } from "@fut/spatial";
import { buildTeam } from "./teamFactory.js";

/**
 * What does playing a man down actually cost?
 *
 * A report that a ten-man side plays BETTER than it should is a claim about a
 * number, so measure the number before touching a constant. Two identical
 * rating-80 sides, same seeds, same everything — then send one player off at a
 * fixed minute and diff the outcome against the untouched control.
 *
 * Expected direction: the short side concedes more, shoots less, and holds less
 * of the ball. Anything else (or a suspiciously small effect) is the bug.
 *
 * Run: npx tsx packages/app-cli/src/tenMen.ts [N] [minute]
 */
const N = Number(process.argv[2] ?? 40);
const SEND_OFF_MIN = Number(process.argv[3] ?? 20);
const mk = (id: string) => buildTeam({ id, name: id, shortName: id.toUpperCase().slice(0, 3), rating: 80 });

interface Acc {
  matches: number;
  homeGoals: number; awayGoals: number;
  homeShots: number; awayShots: number;
  homePoss: number;
  /** How many outfielders the short side still had at the whistle. */
  homeOnPitch: number;
}
const zero = (): Acc => ({ matches: 0, homeGoals: 0, awayGoals: 0, homeShots: 0, awayShots: 0, homePoss: 0, homeOnPitch: 0 });

/** Run one match; if `sendOff`, remove a home OUTFIELDER at SEND_OFF_MIN. */
function run(seed: number, sendOff: boolean, position?: "defender" | "attacker"): Acc {
  const eng = new MatchEngine(mk("home"), mk("away"), seed);
  let done = false;
  let t = 0;
  while (!eng.finished && t < 80_000) {
    eng.tick(0.1);
    t++;
    if (sendOff && !done && eng.minute >= SEND_OFF_MIN) {
      const home = eng.state.teamAgents("home");
      // Pick by how advanced they are: a centre-back is deepest, a striker
      // highest. Losing each should hurt differently.
      const outfield = home.filter((a) => a.player.position !== "goalkeeper");
      const sorted = [...outfield].sort((a, b) => a.pos.x - b.pos.x);
      const victim = position === "attacker" ? sorted.at(-1) : sorted[0];
      if (victim) eng.state.removeAgent(victim.id);
      done = true;
    }
  }
  const a = zero();
  a.matches = 1;
  a.homeGoals = eng.stats.home.goals;
  a.awayGoals = eng.stats.away.goals;
  a.homeShots = eng.stats.home.shots;
  a.awayShots = eng.stats.away.shots;
  a.homePoss = possessionPercent(eng.stats.home, eng.stats.away).home;
  a.homeOnPitch = eng.state.teamAgents("home").length;
  return a;
}

const merge = (into: Acc, one: Acc) => {
  into.matches += one.matches;
  into.homeGoals += one.homeGoals;
  into.awayGoals += one.awayGoals;
  into.homeShots += one.homeShots;
  into.awayShots += one.awayShots;
  into.homePoss += one.homePoss;
  into.homeOnPitch += one.homeOnPitch;
};

function report(label: string, a: Acc): void {
  const n = Math.max(1, a.matches);
  console.log(
    label.padEnd(22),
    `GF ${(a.homeGoals / n).toFixed(2)}`.padEnd(9),
    `GA ${(a.awayGoals / n).toFixed(2)}`.padEnd(9),
    `GD ${((a.homeGoals - a.awayGoals) / n).toFixed(2)}`.padEnd(10),
    `shots ${(a.homeShots / n).toFixed(1)} v ${(a.awayShots / n).toFixed(1)}`.padEnd(20),
    `poss ${(a.homePoss / n).toFixed(1)}%`.padEnd(12),
    `on pitch ${(a.homeOnPitch / n).toFixed(1)}`,
  );
}

const control = zero();
const shortDef = zero();
const shortAtt = zero();
for (let seed = 1; seed <= N; seed++) {
  merge(control, run(seed, false));
  merge(shortDef, run(seed, true, "defender"));
  merge(shortAtt, run(seed, true, "attacker"));
}

console.log(`${N} mirrored matches, rating 80 both sides, sending-off at ${SEND_OFF_MIN}'\n`);
report("11 v 11 (control)", control);
report("10 v 11 (lost a DEF)", shortDef);
report("10 v 11 (lost an ATT)", shortAtt);

const gd = (a: Acc) => (a.homeGoals - a.awayGoals) / Math.max(1, a.matches);
console.log(`\nGoal-difference swing from the sending-off:`);
console.log(`  losing a defender : ${(gd(shortDef) - gd(control)).toFixed(2)}`);
console.log(`  losing an attacker: ${(gd(shortAtt) - gd(control)).toFixed(2)}`);
console.log(`(both should be clearly negative — a man down is a real handicap)`);
