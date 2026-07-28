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
 * The score alone can't say WHY, so the harness also samples the ANATOMY of both
 * sides once per simulated second: which objective every outfielder is on, how
 * many men each side commits to the attacking third while it holds the ball, how
 * many passing options the carrier has, and how many bodies sit in the defensive
 * third out of possession. That is what shows whether a numerical advantage is
 * being USED — an eleven-man side that leaves its spare man on `holdShape` gains
 * nothing from him, and a ten-man side that commits as many bodies forward as
 * eleven did is not paying for the sending-off.
 *
 * Run: npx tsx packages/app-cli/src/tenMen.ts [N] [minute]
 */
const N = Number(process.argv[2] ?? 40);
const SEND_OFF_MIN = Number(process.argv[3] ?? 20);
const mk = (id: string) => buildTeam({ id, name: id, shortName: id.toUpperCase().slice(0, 3), rating: 80 });

/** Objective kinds an outfielder can be on, in attack→defence order. */
const KINDS = [
  "onBall",
  "support",
  "attackDepth",
  "provideWidth",
  "chaseLoose",
  "holdShape",
  "press",
  "cover",
  "markMan",
] as const;
type Kind = (typeof KINDS)[number];

/** Everything measured for ONE side of ONE condition. */
interface SideAcc {
  goals: number;
  shots: number;
  poss: number;
  onPitch: number;
  /** Sampling ticks (1 Hz of sim time) — the divisor for the anatomy sums. */
  ticks: number;
  /** Summed count of this side's outfielders on each objective. */
  obj: Record<Kind, number>;
  /** Ticks this side had the ball, and what it did with them. */
  atkTicks: number;
  inFinalThird: number;
  passOptions: number;
  /** Ticks this side was defending, and how deep it sat. */
  defTicks: number;
  inOwnThird: number;
}

interface Acc {
  matches: number;
  home: SideAcc;
  away: SideAcc;
}

const zeroObj = (): Record<Kind, number> => Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<Kind, number>;
const zeroSide = (): SideAcc => ({
  goals: 0, shots: 0, poss: 0, onPitch: 0,
  ticks: 0, obj: zeroObj(),
  atkTicks: 0, inFinalThird: 0, passOptions: 0,
  defTicks: 0, inOwnThird: 0,
});
const zero = (): Acc => ({ matches: 0, home: zeroSide(), away: zeroSide() });

const PITCH_LEN = 105;
/** Distance (m) within which a team-mate counts as an option for the carrier. */
const OPTION_RANGE = 22;

/** Run one match; if `sendOff`, remove a home OUTFIELDER at SEND_OFF_MIN. */
function run(seed: number, sendOff: boolean, position?: "defender" | "attacker"): Acc {
  const eng = new MatchEngine(mk("home"), mk("away"), seed);
  const a = zero();
  a.matches = 1;
  let done = false;
  let t = 0;
  while (!eng.finished && t < 80_000) {
    eng.tick(0.1);
    t++;
    if (t % 10 === 0) sample(eng, a); // once per simulated second
    if (sendOff && !done && eng.minute >= SEND_OFF_MIN) {
      const home = eng.state.teamAgents("home");
      // Pick by how advanced they are: a centre-back is deepest, a striker
      // highest. Losing each should hurt differently.
      const outfield = home.filter((ag) => ag.player.position !== "goalkeeper");
      const sorted = [...outfield].sort((x, y) => x.pos.x - y.pos.x);
      const victim = position === "attacker" ? sorted.at(-1) : sorted[0];
      // The referee's own path, so the side reorganises exactly as it would in a
      // real dismissal — deleting the body from the state would measure a
      // situation the game never actually produces.
      if (victim) eng.sendOffPlayer(victim.id);
      done = true;
    }
  }
  a.home.goals = eng.stats.home.goals;
  a.away.goals = eng.stats.away.goals;
  a.home.shots = eng.stats.home.shots;
  a.away.shots = eng.stats.away.shots;
  const poss = possessionPercent(eng.stats.home, eng.stats.away);
  a.home.poss = poss.home;
  a.away.poss = poss.away;
  a.home.onPitch = eng.state.teamAgents("home").length;
  a.away.onPitch = eng.state.teamAgents("away").length;
  return a;
}

/** Snapshot both sides' shape and commitment at this instant. */
function sample(eng: MatchEngine, a: Acc): void {
  const s = eng.state;
  const carrier = s.carrier;
  for (const [teamId, side] of [["home", a.home] as const, ["away", a.away] as const]) {
    const outfield = s.teamAgents(teamId).filter((ag) => !ag.isGK);
    if (outfield.length === 0) continue;
    side.ticks += 1;
    for (const ag of outfield) {
      const kind = ag.objective?.kind;
      if (kind && kind in side.obj) side.obj[kind as Kind] += 1;
    }
    const dir = s.dirOf(teamId);
    const advance = (x: number) => (dir === 1 ? x : PITCH_LEN - x);
    if (carrier && carrier.teamId === teamId) {
      side.atkTicks += 1;
      side.inFinalThird += outfield.filter((ag) => advance(ag.pos.x) > (PITCH_LEN * 2) / 3).length;
      // Options: a mate close enough to reach, not behind the carrier's own
      // position (a backward-only field of options is a stalled attack).
      side.passOptions += outfield.filter(
        (ag) =>
          ag !== carrier &&
          Math.hypot(ag.pos.x - carrier.pos.x, ag.pos.y - carrier.pos.y) < OPTION_RANGE &&
          advance(ag.pos.x) > advance(carrier.pos.x) - 3,
      ).length;
    } else if (carrier) {
      side.defTicks += 1;
      side.inOwnThird += outfield.filter((ag) => advance(ag.pos.x) < PITCH_LEN / 3).length;
    }
  }
}

const mergeSide = (into: SideAcc, one: SideAcc) => {
  into.goals += one.goals;
  into.shots += one.shots;
  into.poss += one.poss;
  into.onPitch += one.onPitch;
  into.ticks += one.ticks;
  for (const k of KINDS) into.obj[k] += one.obj[k];
  into.atkTicks += one.atkTicks;
  into.inFinalThird += one.inFinalThird;
  into.passOptions += one.passOptions;
  into.defTicks += one.defTicks;
  into.inOwnThird += one.inOwnThird;
};
const merge = (into: Acc, one: Acc) => {
  into.matches += one.matches;
  mergeSide(into.home, one.home);
  mergeSide(into.away, one.away);
};

function report(label: string, a: Acc): void {
  const n = Math.max(1, a.matches);
  console.log(
    label.padEnd(22),
    `GF ${(a.home.goals / n).toFixed(2)}`.padEnd(9),
    `GA ${(a.away.goals / n).toFixed(2)}`.padEnd(9),
    `GD ${((a.home.goals - a.away.goals) / n).toFixed(2)}`.padEnd(10),
    `shots ${(a.home.shots / n).toFixed(1)} v ${(a.away.shots / n).toFixed(1)}`.padEnd(20),
    `poss ${(a.home.poss / n).toFixed(1)}%`.padEnd(12),
    `on pitch ${(a.home.onPitch / n).toFixed(1)}`,
  );
}

/** Per-side anatomy: how the side used the bodies it had. */
function anatomy(label: string, side: SideAcc): void {
  const per = (v: number, d: number) => (v / Math.max(1, d)).toFixed(2);
  const mix = KINDS.map((k) => `${k} ${per(side.obj[k], side.ticks)}`).join("  ");
  console.log(
    `  ${label.padEnd(20)}`,
    `men in final 3rd (att) ${per(side.inFinalThird, side.atkTicks)}`.padEnd(30),
    `options ${per(side.passOptions, side.atkTicks)}`.padEnd(14),
    `men in own 3rd (def) ${per(side.inOwnThird, side.defTicks)}`,
  );
  console.log(`  ${" ".repeat(20)} ${mix}`);
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

const gd = (a: Acc) => (a.home.goals - a.away.goals) / Math.max(1, a.matches);
console.log(`\nGoal-difference swing from the sending-off:`);
console.log(`  losing a defender : ${(gd(shortDef) - gd(control)).toFixed(2)}`);
console.log(`  losing an attacker: ${(gd(shortAtt) - gd(control)).toFixed(2)}`);
console.log(`(both should be clearly negative — a man down is a real handicap)`);

console.log(`\nAnatomy — average outfielders per objective, and commitment:`);
for (const [label, a] of [["11 v 11", control], ["10 v 11 (lost DEF)", shortDef], ["10 v 11 (lost ATT)", shortAtt]] as const) {
  console.log(`\n${label}`);
  anatomy("short side (home)", a.home);
  anatomy("full side (away)", a.away);
}
