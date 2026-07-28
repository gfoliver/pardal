import { FIELD, MatchEngine } from "@fut/spatial";
import { buildTeam } from "./teamFactory.js";

/**
 * What does a free kick actually produce?
 *
 * A side has two ways to take one near the box — strike it at goal, or hang it up
 * for a header — and the question is whether either happens, and whether anything
 * comes of it. So watch every free kick from the moment it is struck: which of the
 * two it was, where it finished, and whether it became a shot or a goal.
 *
 * Real football, for the ones close enough to threaten: a direct attempt is scored
 * roughly 5-8% of the time from a good position, and set-piece deliveries into the
 * box account for a large part of the ~25-33% of all goals that come from dead
 * balls. Across a whole match a side takes ~13 free kicks, most of them harmless
 * ones deep in its own half — those matter here only as the denominator.
 *
 * Run: npx tsx packages/app-cli/src/freeKickProbe.ts [N]
 */
const N = Number(process.argv[2] ?? 20);
const mk = (id: string) => buildTeam({ id, name: id, shortName: id.toUpperCase().slice(0, 3), rating: 80 });

/** A free kick within this range of the goal it threatens is a scoring chance. */
const THREAT_RANGE = 34;

interface Tally {
  kicks: number;
  threatening: number;
  /** How the threatening ones were taken. */
  direct: number;
  intoBox: number;
  played: number;
  /** What came of them, within the watch window. */
  shots: number;
  headers: number;
  headersAtGoal: number;
  goals: number;
  keeperClaims: number;
  outOfPlay: number;
}
const t: Tally = {
  kicks: 0, threatening: 0, direct: 0, intoBox: 0, played: 0,
  shots: 0, headers: 0, headersAtGoal: 0, goals: 0, keeperClaims: 0, outOfPlay: 0,
};

const boxed = (x: number, y: number, goalX: number) => {
  const depth = goalX === 0 ? x : FIELD.LENGTH - x;
  return depth >= 0 && depth <= FIELD.PENALTY_DEPTH && y >= (FIELD.WIDTH - FIELD.PENALTY_WIDTH) / 2 && y <= (FIELD.WIDTH + FIELD.PENALTY_WIDTH) / 2;
};

type Mark = { shots: number; goals: number; headers: number; headersAtGoal: number; claims: number };

for (let seed = 1; seed <= N; seed++) {
  const eng = new MatchEngine(mk("home"), mk("away"), seed);
  let watching: { goalX: number; teamId: string; threat: boolean } | null = null;
  let mark: Mark | null = null;
  let ticks = 0;
  let classified = false;
  for (let k = 0; k < 80_000 && !eng.finished; k++) {
    const dead = eng.state.deadBall;
    const wasKick = dead?.type === "freeKick";
    const takerTeam = dead?.teamId;
    const spot = dead ? { ...dead.spot } : null;
    const goalX = dead?.goalX ?? 0;
    eng.tick(0.1);
    const nowKick = eng.state.deadBall?.type === "freeKick";

    if (wasKick && !nowKick && takerTeam && spot) {
      t.kicks++;
      // Only the ones near enough to threaten are interesting, and that means near
      // the goal the TAKING side attacks. `deadBall.goalX` is the goal nearest the
      // spot, which for an offside flag is the taker's OWN goal — counting those as
      // threatening made 80% of the sample deep defensive restarts.
      const attackDir = eng.state.dirOf(takerTeam);
      const attackedGoalX = attackDir === 1 ? FIELD.LENGTH : 0;
      const threat = Math.hypot(spot.x - attackedGoalX, spot.y - FIELD.WIDTH / 2) < THREAT_RANGE;
      if (threat) t.threatening++;
      watching = { goalX: attackedGoalX, teamId: takerTeam, threat };
      ticks = 0;
      classified = false;
      mark = {
        shots: eng.stats.home.shots + eng.stats.away.shots,
        goals: eng.stats.home.goals + eng.stats.away.goals,
        headers: eng.state.telemetry.header,
        headersAtGoal: eng.state.telemetry.headerShot,
        claims: eng.state.telemetry.keeperClaim,
      };
      continue;
    }
    if (!watching) continue;
    ticks++;
    const b = eng.state.ball;

    // Classify the delivery on the first tick after the strike: a live shot means
    // it was struck AT goal; a high ball dropping into the box is a delivery for a
    // header; anything else was simply played to a team-mate.
    if (!classified && watching.threat) {
      classified = true;
      if (b.isShot) t.direct++;
      else if (b.vz > 2) t.intoBox++;
      else t.played++;
    }

    const out = b.pos.x < 0 || b.pos.x > FIELD.LENGTH || b.pos.y < 0 || b.pos.y > FIELD.WIDTH;
    const settled = !b.loose;
    if (out || settled || ticks > 70) {
      if (watching.threat && mark) {
        const tl = eng.state.telemetry;
        t.shots += eng.stats.home.shots + eng.stats.away.shots - mark.shots;
        t.goals += eng.stats.home.goals + eng.stats.away.goals - mark.goals;
        t.headers += tl.header - mark.headers;
        t.headersAtGoal += tl.headerShot - mark.headersAtGoal;
        t.keeperClaims += tl.keeperClaim - mark.claims;
        if (out && !boxed(b.pos.x, b.pos.y, watching.goalX)) t.outOfPlay++;
      }
      watching = null;
      mark = null;
    }
  }
}

const per = (n: number) => (n / N).toFixed(2);
const pct = (n: number) => `${((n / Math.max(1, t.threatening)) * 100).toFixed(0)}%`;
console.log(`${N} matches — ${t.kicks} free kicks, ${t.threatening} of them within ${THREAT_RANGE} m of goal\n`);
console.log(`  free kicks per match (both sides): ${per(t.kicks)}   threatening: ${per(t.threatening)}`);
console.log(`\n  how the threatening ones were taken:`);
console.log(`    struck AT goal        ${String(t.direct).padStart(4)}  ${pct(t.direct)}`);
console.log(`    hung up into the box  ${String(t.intoBox).padStart(4)}  ${pct(t.intoBox)}`);
console.log(`    just played onward    ${String(t.played).padStart(4)}  ${pct(t.played)}`);
console.log(`\n  what they produced:`);
console.log(`    shots ${t.shots} (${pct(t.shots)} of threatening kicks)`);
console.log(`    headers won ${t.headers}, of them at goal ${t.headersAtGoal}`);
console.log(`    keeper claimed the delivery ${t.keeperClaims}`);
console.log(`    straight out of play ${t.outOfPlay}`);
console.log(`    GOALS ${t.goals} (${pct(t.goals)} of threatening kicks, ${per(t.goals)} per match)`);
console.log(`\n  real football: a dead ball near the box is struck directly about half the time,`);
console.log(`  a direct attempt from a good position is scored ~5-8%, and set pieces as a whole`);
console.log(`  supply roughly a quarter to a third of all goals.`);
