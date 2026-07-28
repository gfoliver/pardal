import { possessionPercent } from "@fut/engine";
import { MatchEngine } from "@fut/spatial";
import { buildTeam } from "./teamFactory.js";

/**
 * WHO PLAYS THE FOOTBALL, AND HOW HARD IS A CHANCE TO COME BY?
 *
 * Three claims about the spatial engine, each of which is a number:
 *
 *  1. Only a handful of players are involved in an attack, when it should be the
 *     whole side. → touch and pass share per band of the shape. In real football
 *     a centre-back touches the ball FAR more often than a striker (roughly two
 *     to three times as often), because possession is worked through the back and
 *     midfield and the forwards are the end of the move, not the middle of it. A
 *     forward-heavy share means the ball is being played THROUGH the attackers.
 *
 *  2. Attackers glide through the marking and reach clear sights of goal too
 *     easily. → shots per match, and how many are BIG CHANCES (inside 16 m,
 *     nobody within 4 m, a clear lane). Real sides manage on the order of two of
 *     those per match, not a stream of them.
 *
 *  3. The goals-per-game figure is being held down by an unbeatable keeper rather
 *     than by defending. → save rate: what share of on-target shots the keeper
 *     keeps out. Real football sits near 70%. Much above that and the scoreline is
 *     realistic for the wrong reason — the defence is not stopping the chance, the
 *     keeper is.
 *
 * Reference values are printed beside every measurement, per team per match. Note
 * the engine plays a COMPRESSED match (~1800 simulated seconds, see CLOCK), so
 * volume counts run below a real 90 minutes; the SHARES and RATIOS are the honest
 * comparison, and they are what these claims are about.
 *
 * Run: npx tsx packages/app-cli/src/involvement.ts [N]
 */
const N = Number(process.argv[2] ?? 12);
const RATING = 80;
const mk = (id: string) => buildTeam({ id, name: id, shortName: id.toUpperCase().slice(0, 3), rating: RATING });

const acc = {
  matches: 0,
  goals: 0, shots: 0, onTarget: 0, passes: 0, passesCompleted: 0, poss: 0,
  touchGk: 0, touchDef: 0, touchMid: 0, touchFwd: 0,
  passDef: 0, passMid: 0, passFwd: 0,
  shotDef: 0, shotMid: 0, shotFwd: 0,
  bigChance: 0, unpressured: 0, footShots: 0, pressSum: 0, laneSum: 0,
  saves: 0, caught: 0,
  fwdPass: 0, sqPass: 0, backPass: 0, spells: 0,
  tackles: 0, tackleTries: 0, intercepts: 0,
  passThird: [0, 0, 0], compThird: [0, 0, 0],
  /** Outfielders per band, to turn band totals into PER-PLAYER touches. */
  defMen: 0, midMen: 0, fwdMen: 0,
};

/** Touches and head-count per FIELDED position, summed over sides and matches. */
const byPos = new Map<string, { touches: number; men: number }>();
const posBucket = (position: string) => {
  let b = byPos.get(position);
  if (!b) byPos.set(position, (b = { touches: 0, men: 0 }));
  return b;
};

for (let seed = 1; seed <= N; seed++) {
  const eng = new MatchEngine(mk("home"), mk("away"), seed);
  let t = 0;
  // Count possession CHANGES by watching the flag every tick. The engine's own
  // counter only sees open-play turnovers — every restart moves the ball to the
  // other side without one, so counting spells engine-side overstated how long a
  // side keeps the ball by a factor of three.
  let holder = eng.state.possessionTeamId;
  while (!eng.finished && t < 80_000) {
    eng.tick(0.1);
    t++;
    if (eng.state.possessionTeamId !== holder) {
      holder = eng.state.possessionTeamId;
      acc.spells += 1;
    }
  }
  const tl = eng.state.telemetry;
  acc.matches += 1;
  for (const st of [eng.stats.home, eng.stats.away]) {
    acc.goals += st.goals;
    acc.shots += st.shots;
    acc.onTarget += st.shotsOnTarget;
    acc.passes += st.passes;
    acc.passesCompleted += st.passesCompleted;
  }
  acc.poss += possessionPercent(eng.stats.home, eng.stats.away).home;
  acc.touchGk += tl.touches.gk; acc.touchDef += tl.touches.def; acc.touchMid += tl.touches.mid; acc.touchFwd += tl.touches.fwd;
  acc.passDef += tl.passesBy.def; acc.passMid += tl.passesBy.mid; acc.passFwd += tl.passesBy.fwd;
  acc.shotDef += tl.shotsBy.def; acc.shotMid += tl.shotsBy.mid; acc.shotFwd += tl.shotsBy.fwd;
  acc.bigChance += tl.shotBigChance;
  acc.unpressured += tl.shotUnpressured;
  acc.footShots += tl.shoot;
  acc.pressSum += tl.shotPressureSum;
  acc.laneSum += tl.shotLaneOpenSum;
  acc.saves += tl.keeperSave;
  acc.caught += tl.keeperSaveCaught;
  acc.fwdPass += tl.passForward;
  acc.sqPass += tl.passSquare;
  acc.backPass += tl.passBack;
  acc.tackleTries += tl.tackleAttempt;
  for (let i = 0; i < 3; i++) {
    acc.passThird[i] += tl.passByThird[i]!;
    acc.compThird[i] += tl.passCompleteByThird[i]!;
  }
  acc.intercepts += tl.passIntercept;
  for (const st of [eng.stats.home, eng.stats.away]) acc.tackles += st.tackles;
  // Both sides' shapes, so per-player figures divide by the right head-count.
  for (const teamId of [eng.state.homeId, eng.state.awayId]) {
    for (const a of eng.state.teamAgents(teamId)) {
      if (a.line === "def") acc.defMen += 1;
      else if (a.line === "mid") acc.midMen += 1;
      else if (a.line === "fwd") acc.fwdMen += 1;
      posBucket(a.fielded).men += 1;
    }
  }
  for (const [position, touches] of Object.entries(tl.touchesByPos)) posBucket(position).touches += touches;
}

const sides = acc.matches * 2; // per team per match
const per = (v: number) => v / Math.max(1, sides);
const pct = (v: number, of: number) => (of > 0 ? `${((v / of) * 100).toFixed(0)}%` : "-");
const row = (label: string, measured: string, reference: string) =>
  console.log(label.padEnd(30) + measured.padStart(12) + "   " + `real ≈ ${reference}`);

console.log(`\nMirror 4-4-2, rating ${RATING}, ${acc.matches} matches — per team / match\n`);
console.log("── the scoreline it produces ──");
row("goals", per(acc.goals).toFixed(2), "1.4");
row("shots", per(acc.shots).toFixed(1), "12–13");
row("shots on target", per(acc.onTarget).toFixed(1), "4–5");
row("shot conversion", pct(acc.goals, acc.shots), "10–11%");
row("possession (home)", (acc.poss / Math.max(1, acc.matches)).toFixed(0) + "%", "50%");

console.log("\n── 3. is the keeper carrying the defence? ──");
// On-target shots either beat the keeper (a goal) or are kept out (a save).
const faced = acc.onTarget;
row("save rate (of on-target)", pct(acc.saves, faced), "~70%");
row("…held cleanly", pct(acc.caught, acc.saves), "most");
row("on-target shots scored", pct(acc.goals, faced), "~30%");

console.log("\n── 2. how hard is a clear sight of goal to come by? ──");
row("BIG chances (<16m, free, open)", per(acc.bigChance).toFixed(2), "~2");
row("unpressured shots (>4m free)", per(acc.unpressured).toFixed(1), "a minority");
row("…as a share of foot shots", pct(acc.unpressured, acc.footShots), "~35%");
row("avg pressure at the shot", (acc.pressSum / Math.max(1, acc.footShots)).toFixed(1) + "m", "2–3m");
row("avg lane openness (0..1)", (acc.laneSum / Math.max(1, acc.footShots)).toFixed(2), "contested");

console.log("\n── 1. who is actually involved? ──");
const touchTotal = acc.touchDef + acc.touchMid + acc.touchFwd || 1;
const passTotal = acc.passDef + acc.passMid + acc.passFwd || 1;
console.log("  band       touches/match   share    per player   passes    share    shots");
// Band totals and head-counts are both sums over the same (team, match) units, so
// their quotient is already touches per player per match.
const perPlayer = (touches: number, men: number) => (men > 0 ? touches / men : 0);
const band = (label: string, touches: number, passes: number, shots: number, men: number) => {
  console.log(
    `  ${label.padEnd(10)} ${per(touches).toFixed(1).padStart(12)}   ${pct(touches, touchTotal).padStart(5)}` +
      `   ${perPlayer(touches, men).toFixed(1).padStart(10)}   ${per(passes).toFixed(1).padStart(6)}   ${pct(passes, passTotal).padStart(5)}   ${per(shots).toFixed(1).padStart(5)}`,
  );
};
band("defence", acc.touchDef, acc.passDef, acc.shotDef, acc.defMen);
band("midfield", acc.touchMid, acc.passMid, acc.shotMid, acc.midMen);
band("attack", acc.touchFwd, acc.passFwd, acc.shotFwd, acc.fwdMen);
console.log(`  keeper     ${per(acc.touchGk).toFixed(1).padStart(12)}`);
// Per fielded position — the comparison that means something, since a winger is
// not a centre-forward however much the "attack" band lumps them together.
console.log("\n  touches per player, by the position he is FIELDED at:");
const perPos = [...byPos.entries()]
  .map(([position, b]) => ({ position, each: b.men > 0 ? b.touches / b.men : 0 }))
  .sort((a, b) => b.each - a.each);
for (const p of perPos) console.log(`    ${p.position.padEnd(22)} ${p.each.toFixed(1).padStart(6)}`);
const each = (position: string) => perPos.find((p) => p.position === position)?.each ?? 0;
const cb = each("centreBack");
const st = each("striker");
console.log(`\n  centre-back : striker touch ratio: ${(st > 0 ? cb / st : 0).toFixed(2)}×   real ≈ 2–3×`);
console.log(`  pass completion: ${pct(acc.passesCompleted, acc.passes)}   real ≈ 80%`);

const dirTotal = acc.fwdPass + acc.sqPass + acc.backPass || 1;
console.log("\n── which way does the ball go, and for how long? ──");
row("passes forward", pct(acc.fwdPass, dirTotal), "~65%");
row("passes square", pct(acc.sqPass, dirTotal), "~20%");
row("passes backward", pct(acc.backPass, dirTotal), "~15%");
// A spell ends when the other side takes the ball; passes per spell is how long a
// side strings possession together before losing it.
row("passes per possession", (acc.passes / Math.max(1, acc.spells / 2)).toFixed(1), "3–5");
row("passes", per(acc.passes).toFixed(0), "350–450");

console.log("\n── is the ball ever contested? ──");
row("tackles won", per(acc.tackles).toFixed(1), "15–20");
row("challenges committed", per(acc.tackleTries).toFixed(1), "—");
row("…won", pct(acc.tackles, acc.tackleTries), "~35%");
row("passes intercepted", per(acc.intercepts).toFixed(1), "~10");
console.log("\n  pass completion by the third it was played FROM:");
const thirdName = ["own third", "middle third", "final third"];
const realThird = ["~92%", "~85%", "<70%"];
for (let i = 0; i < 3; i++) {
  console.log(
    `    ${thirdName[i]!.padEnd(14)} ${pct(acc.compThird[i]!, acc.passThird[i]!).padStart(5)}   real ≈ ${realThird[i]}` +
      `   (${per(acc.passThird[i]!).toFixed(0)} passes)`,
  );
}
