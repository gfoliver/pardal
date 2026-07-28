import { FIELD, MatchEngine } from "@fut/spatial";
import { buildTeam } from "./teamFactory.js";

/**
 * Where does a corner actually end up?
 *
 * The complaint is that corners sail over everyone and go out on the far side.
 * That is a claim about a landing point, so measure the landing point: watch the
 * ball from the moment a corner is struck until it is next touched or leaves the
 * pitch, and bucket where it finished.
 *
 * Run: npx tsx packages/app-cli/src/cornerProbe.ts [N]
 */
const N = Number(process.argv[2] ?? 30);
const mk = (id: string) => buildTeam({ id, name: id, shortName: id.toUpperCase().slice(0, 3), rating: 80 });

interface Tally {
  corners: number;
  intoBox: number;
  outOfPlay: number;
  shortOfBox: number;
  overshotWide: number;
  /** Straight-line distance from the aim-ish danger zone. */
  distSum: number;
  firstTouchOwn: number;
  firstTouchOpp: number;
}
const t: Tally = { corners: 0, intoBox: 0, outOfPlay: 0, shortOfBox: 0, overshotWide: 0, distSum: 0, firstTouchOwn: 0, firstTouchOpp: 0 };

const inBox = (x: number, y: number, goalX: number) => {
  const depth = goalX === 0 ? x : FIELD.LENGTH - x;
  return depth >= 0 && depth <= FIELD.PENALTY_DEPTH && y >= (FIELD.WIDTH - FIELD.PENALTY_WIDTH) / 2 && y <= (FIELD.WIDTH + FIELD.PENALTY_WIDTH) / 2;
};

for (let seed = 1; seed <= N; seed++) {
  const eng = new MatchEngine(mk("home"), mk("away"), seed);
  let watching: { goalX: number; teamId: string } | null = null;
  let ticks = 0;
  for (let k = 0; k < 80_000 && !eng.finished; k++) {
    const wasDead = eng.state.deadBall?.type === "corner";
    const takerTeam = eng.state.deadBall?.teamId;
    const goalX = eng.state.deadBall?.goalX ?? 0;
    eng.tick(0.1);
    const nowDead = eng.state.deadBall?.type === "corner";
    // The corner has just been struck: it was a dead-ball corner, now it isn't.
    if (wasDead && !nowDead && takerTeam) {
      watching = { goalX, teamId: takerTeam };
      ticks = 0;
      t.corners++;
      continue;
    }
    if (!watching) continue;
    ticks++;
    const b = eng.state.ball;
    const attackedGoal = watching.goalX;
    const settled = b.ownerId !== null || !b.loose;
    const out = b.pos.x < 0 || b.pos.x > FIELD.LENGTH || b.pos.y < 0 || b.pos.y > FIELD.WIDTH;

    if (out) {
      t.outOfPlay++;
      // Went off the byline/far touchline without being played.
      if (b.pos.y < 0 || b.pos.y > FIELD.WIDTH) t.overshotWide++;
      watching = null;
      continue;
    }
    if (settled || ticks > 60) {
      if (inBox(b.pos.x, b.pos.y, attackedGoal)) t.intoBox++;
      else t.shortOfBox++;
      const owner = b.ownerId ? eng.state.agent(b.ownerId) : undefined;
      if (owner) (owner.teamId === watching.teamId ? t.firstTouchOwn++ : t.firstTouchOpp++);
      const danger = { x: attackedGoal === 0 ? 11 : FIELD.LENGTH - 11, y: FIELD.WIDTH / 2 };
      t.distSum += Math.hypot(b.pos.x - danger.x, b.pos.y - danger.y);
      watching = null;
    }
  }
}

const pct = (n: number) => `${((n / Math.max(1, t.corners)) * 100).toFixed(0)}%`;
console.log(`${N} matches — ${t.corners} corners tracked\n`);
console.log(`  reached the penalty box   ${String(t.intoBox).padStart(4)}  ${pct(t.intoBox)}`);
console.log(`  landed short / elsewhere  ${String(t.shortOfBox).padStart(4)}  ${pct(t.shortOfBox)}`);
console.log(`  straight out of play      ${String(t.outOfPlay).padStart(4)}  ${pct(t.outOfPlay)}`);
console.log(`    …of which over the far touchline ${t.overshotWide}`);
console.log(`\n  first touch: attacker ${t.firstTouchOwn} / defender ${t.firstTouchOpp}`);
console.log(`  mean distance from the danger spot: ${(t.distSum / Math.max(1, t.intoBox + t.shortOfBox)).toFixed(1)} m`);
