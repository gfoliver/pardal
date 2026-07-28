import { SeededRandom, takePenalty, type PenaltyKick } from "@fut/engine";

/**
 * Is the recorded penalty picture actually consistent with its outcome?
 *
 * `takePenalty` draws the outcome from the calibrated goal probability and THEN
 * places the ball and the keeper's dive to match it, so the two can only ever
 * disagree through a bug in the placement rules. This probe is the check on
 * that: every consistency counter below must read zero, and the outcome mix must
 * reproduce the goal probability it was handed — if conversion drifts here, the
 * picture has started changing the result, which it must not.
 *
 * Run: npx tsx packages/app-cli/src/penaltyProbe.ts [N] [goalProbability]
 */
const N = Number(process.argv[2] ?? 200_000);
const P = Number(process.argv[3] ?? 0.78); // where the engines' formula sits for an average taker vs an average keeper
const rng = new SeededRandom(12345);

const count: Record<string, number> = { goal: 0, saved: 0, post: 0, wide: 0 };
let diveStay = 0;
let savedWrongSide = 0;
let savedOutOfReach = 0;
let goalInReach = 0;
let offInsideFrame = 0;
let onTargetOutsideFrame = 0;
const sample: PenaltyKick[] = [];

const inFrame = (k: PenaltyKick) => Math.abs(k.x) <= 1 && k.y <= 1;
/** The arc a dive to that side plausibly covers — used only to audit the draw. */
const withinReach = (k: PenaltyKick) =>
  k.dive !== 0 && Math.sign(k.x) === k.dive && Math.abs(k.x) < 0.7 && Math.abs(k.y - k.diveHeight) < 0.25;

for (let i = 0; i < N; i++) {
  const k = takePenalty(rng, P);
  count[k.outcome]!++;
  if (k.dive === 0) diveStay++;
  if (i < 12) sample.push(k);

  if (k.outcome === "saved") {
    if (k.dive !== 0 && Math.sign(k.x) !== k.dive) savedWrongSide++;
    // The height test only applies to a DIVE. A keeper who stays on his feet
    // blocks with legs, body and hands over the whole height of himself, so
    // "near the height he dived to" says nothing about whether he could reach it.
    const reachable = Math.abs(k.x) <= 0.75 && (k.dive === 0 || Math.abs(k.y - k.diveHeight) <= 0.25);
    if (!reachable) savedOutOfReach++;
  }
  if (k.outcome === "goal" && withinReach(k)) goalInReach++;
  if (k.outcome === "goal" || k.outcome === "saved") {
    if (!inFrame(k)) onTargetOutsideFrame++;
  } else if (Math.abs(k.x) < 0.97 && k.y < 0.98) {
    offInsideFrame++;
  }
}

const pct = (n: number) => `${((n / N) * 100).toFixed(2)}%`;
console.log(`n=${N}, goalProbability=${P}`);
console.log("outcome mix");
for (const [k, v] of Object.entries(count)) console.log(`  ${k.padEnd(6)} ${pct(v)}`);
console.log(`  ${"on target".padEnd(6)} ${pct(count.goal! + count.saved!)}`);
console.log(`  keeper stood up ${pct(diveStay)}`);
console.log("\nconsistency (every line must be 0)");
console.log(`  saved, ball on the other side      ${savedWrongSide}`);
console.log(`  saved, ball out of his reach       ${savedOutOfReach}`);
console.log(`  scored, ball inside his reach      ${goalInReach}`);
console.log(`  off target, ball inside the frame  ${offInsideFrame}`);
console.log(`  on target, ball outside the frame  ${onTargetOutsideFrame}`);
console.log("\nsample");
for (const k of sample) {
  console.log(`  ${k.outcome.padEnd(6)} x=${k.x.toFixed(2).padStart(5)} y=${k.y.toFixed(2)} dive=${String(k.dive).padStart(2)} @${k.diveHeight.toFixed(2)}`);
}
