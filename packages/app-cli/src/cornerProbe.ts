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
  /** …and how often that defender is the KEEPER simply catching it. */
  firstTouchKeeper: number;
  /** Aerial duels, headers and keeper claims across the corners watched. */
  duels: number;
  headers: number;
  headerShots: number;
  claims: number;
  /** Shots and goals that came out of the corner within the watch window. */
  shots: number;
  goals: number;
  /** Where the DELIVERY itself first comes down, and how high it is over the spot. */
  landed: number;
  landDistSum: number;
  landedInBox: number;
  heightOverSpotSum: number;
  heightSamples: number;
}
const t: Tally = {
  corners: 0, intoBox: 0, outOfPlay: 0, shortOfBox: 0, overshotWide: 0, distSum: 0,
  firstTouchOwn: 0, firstTouchOpp: 0, firstTouchKeeper: 0,
  duels: 0, headers: 0, headerShots: 0, claims: 0, shots: 0, goals: 0,
  landed: 0, landDistSum: 0, landedInBox: 0, heightOverSpotSum: 0, heightSamples: 0,
};

const inBox = (x: number, y: number, goalX: number) => {
  const depth = goalX === 0 ? x : FIELD.LENGTH - x;
  return depth >= 0 && depth <= FIELD.PENALTY_DEPTH && y >= (FIELD.WIDTH - FIELD.PENALTY_WIDTH) / 2 && y <= (FIELD.WIDTH + FIELD.PENALTY_WIDTH) / 2;
};

/** Counter values at the moment the corner was struck, to diff against. */
type Mark = { duels: number; headers: number; headerShots: number; claims: number; shots: number; goals: number };

for (let seed = 1; seed <= N; seed++) {
  const eng = new MatchEngine(mk("home"), mk("away"), seed);
  let watching: { goalX: number; teamId: string } | null = null;
  let mark: Mark | null = null;
  let ticks = 0;
  let landedYet = false;
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
      landedYet = false;
      t.corners++;
      mark = {
        duels: eng.state.telemetry.aerialDuel,
        headers: eng.state.telemetry.header,
        headerShots: eng.state.telemetry.headerShot,
        claims: eng.state.telemetry.keeperClaim,
        shots: eng.stats.home.shots + eng.stats.away.shots,
        goals: eng.stats.home.goals + eng.stats.away.goals,
      };
      continue;
    }
    if (!watching) continue;
    ticks++;
    const b = eng.state.ball;
    const attackedGoal = watching.goalX;
    const dangerSpot = { x: attackedGoal === 0 ? 11 : FIELD.LENGTH - 11, y: FIELD.WIDTH / 2 };
    // The delivery's own trajectory: how high it is as it passes over the danger
    // spot, and where it first comes back down. A ball that arrives above heading
    // height has not been delivered into the box, whatever its landing point.
    if (!landedYet) {
      if (Math.hypot(b.pos.x - dangerSpot.x, b.pos.y - dangerSpot.y) < 6) {
        t.heightOverSpotSum += b.z;
        t.heightSamples++;
      }
      if (b.z <= 0.05 && ticks > 2) {
        landedYet = true;
        t.landed++;
        t.landDistSum += Math.hypot(b.pos.x - dangerSpot.x, b.pos.y - dangerSpot.y);
        if (inBox(b.pos.x, b.pos.y, attackedGoal)) t.landedInBox++;
      }
    }
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
      if (owner) {
        if (owner.teamId === watching.teamId) t.firstTouchOwn++;
        else {
          t.firstTouchOpp++;
          if (owner.isGK) t.firstTouchKeeper++;
        }
      }
      if (mark) {
        const tl = eng.state.telemetry;
        t.duels += tl.aerialDuel - mark.duels;
        t.headers += tl.header - mark.headers;
        t.headerShots += tl.headerShot - mark.headerShots;
        t.claims += tl.keeperClaim - mark.claims;
        t.shots += eng.stats.home.shots + eng.stats.away.shots - mark.shots;
        t.goals += eng.stats.home.goals + eng.stats.away.goals - mark.goals;
        mark = null;
      }
      t.distSum += Math.hypot(b.pos.x - dangerSpot.x, b.pos.y - dangerSpot.y);
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
console.log(`\n  first touch: attacker ${t.firstTouchOwn} (${pct(t.firstTouchOwn)}) / defender ${t.firstTouchOpp}`);
console.log(`    …of which the KEEPER simply claiming it: ${t.firstTouchKeeper} (${pct(t.firstTouchKeeper)})`);
console.log(`  real football: the attacking side wins roughly half of first contacts,`);
console.log(`  and a keeper claims something like one corner in six.`);
console.log(`  mean distance from the danger spot: ${(t.distSum / Math.max(1, t.intoBox + t.shortOfBox)).toFixed(1)} m`);
console.log(`\n  what the corner produced (within the watch window):`);
console.log(`    aerial duels ${t.duels}   headers won ${t.headers}   headers at goal ${t.headerShots}   keeper claims ${t.claims}`);
console.log(`    shots ${t.shots} (${pct(t.shots)} of corners)   goals ${t.goals} (${pct(t.goals)})`);
console.log(`    real football: ~2-3% of corners are scored from directly.`);
console.log(`\n  the DELIVERY itself:`);
console.log(`    first came down ${t.landed} times, ${t.landedInBox} of them inside the box (${pct(t.landedInBox)})`);
console.log(`    mean landing distance from the danger spot: ${(t.landDistSum / Math.max(1, t.landed)).toFixed(1)} m`);
console.log(`    mean height as it crossed within 6 m of the spot: ${(t.heightOverSpotSum / Math.max(1, t.heightSamples)).toFixed(1)} m`);
console.log(`    (a header needs it under ~2.65 m — above that it sails over everyone)`);
