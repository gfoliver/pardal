import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { AttrName } from "@fut/domain";
import { normalizeSnapshot } from "../src/normalize/Normalize.js";
import { inferPlayer } from "../src/infer/InferAttributes.js";
import { toAttributes } from "../src/pes/ratings.js";
import type { RawSnapshot } from "../src/raw/RawSnapshot.js";
import type { PesRatings } from "../src/pes/ratings.js";

/**
 * Does real match behaviour predict a player's attributes better than our guess does?
 *
 * The question this answers is narrow and load-bearing. 239 of our 670 players (36%) have
 * no rating source, so their whole 20-attribute vector is fanned out from TWO numbers — a
 * market-value percentile and an appearance percentile — over a position archetype. Measured
 * on the shipped dataset, that group's overall lands in a 7-point band (sd 1.83) against the
 * rated population's 23 (sd 3.59): a third of the league is functionally interchangeable.
 *
 * FBref publishes per-90 behaviour for the same league. If those counts track the attributes
 * a real rating source assigns, they can replace the archetype for the unrated third. If they
 * do not, we have learned that cheaply and can stop.
 *
 * The test uses the players who have BOTH, so the PES ratings act as ground truth and every
 * candidate metric is scored against a number it did not help produce.
 *
 * ---------------------------------------------------------------------------------------
 * RESULT (617 FBref rows → 495 joined → 366 with ground truth): the answer is NO, and the
 * reason is worth keeping.
 *
 * Raw per-90 counts beat the current two-number inference on only 4 of 13 attributes, and on
 * attribute SHAPE (each player's own mean removed, so quality is out of both sides) on just
 * ONE: crossing, r 0.46 against 0.24. Everywhere else the archetype wins, sometimes hugely —
 * tackling 0.61 vs -0.05, finishing 0.70 vs 0.23, stamina 0.54 vs -0.01.
 *
 * Two things explain it. First, the position archetype is not the dead weight the sd figures
 * suggest: PES attribute shape is ALSO largely position-determined, so both sides encode the
 * same prior and agree. Second, and decisively, FBref's free tier no longer carries the
 * StatsBomb advanced tables — checked on a completed Premier League season, not just this
 * league, and there is no passing, defense, possession or xG page for any competition. What
 * is left is COUNTS without their denominators: `tackles_won` with no tackles attempted,
 * crosses with no completion, shots with no xG. A count cannot separate a good tackler from a
 * busy one, which is exactly why tackling lands at zero.
 *
 * So: do not build an event-derived attribute layer on this source. The two things FBref does
 * buy are real MINUTES — replacing `minutes = appearances * 80` in scrapeBrasileirao, an
 * invented figure currently underpinning every per-90 rate in the pipeline — and crossing.
 * Closing the 36% coverage gap wants a second RATING source, not more event data.
 * ---------------------------------------------------------------------------------------
 *
 * Input is a hand-saved extract of fbref.com (Sports Reference), kept under probe/ purely as
 * the evidence for the numbers above. Not a pipeline dependency, and not redistributed.
 *
 * Run: npx tsx packages/dataset/data/attributeProbe.ts
 */

const HERE = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const raw: RawSnapshot = JSON.parse(readFileSync(HERE("./brasileirao-serie-a/raw.json"), "utf8"));
const pes: { players: Record<string, { status: string; ratings?: PesRatings; overall?: number }> } = JSON.parse(
  readFileSync(HERE("./brasileirao-serie-a/pes.json"), "utf8"),
);

/** One FBref row, already per-90'd where that is the meaningful form. */
interface Fb {
  readonly name: string;
  readonly min: number;
  readonly per90: Record<string, number>;
}

function loadFbref(): Fb[] {
  const text = readFileSync(HERE("./brasileirao-serie-a/probe/fbref-2026.csv"), "utf8");
  const [head, ...rows] = text.trim().split("\n");
  const cols = head!.split(",");
  const out: Fb[] = [];
  for (const line of rows) {
    const cells = line.split(",");
    const get = (k: string) => {
      const v = cells[cols.indexOf(k)];
      const n = v === undefined || v === "" ? NaN : Number(v);
      return Number.isFinite(n) ? n : 0;
    };
    const min = get("min");
    if (min < 1) continue;
    const nineties = min / 90;
    // Counts become rates; percentages and ratios are already rates.
    const per90: Record<string, number> = {
      goals: get("g") / nineties,
      assists: get("a") / nineties,
      shots: get("sh") / nineties,
      sotPct: get("sotp"),
      goalsPerShot: get("gps"),
      fouls: get("fl") / nineties,
      fouled: get("fld") / nineties,
      crosses: get("crs") / nineties,
      interceptions: get("intc") / nineties,
      tacklesWon: get("tkw") / nineties,
      minutes: min,
    };
    out.push({ name: cells[0]!, min, per90 });
  }
  return out;
}

/** Accent-stripped, lowercased, punctuation-free — the join key for two different sources. */
const key = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();

/**
 * Match FBref names to ours.
 *
 * Exact normalised match first, then surname + first initial, which is what actually closes
 * the gap: Transfermarkt writes "Alexandro Bernabei" where FBref writes the same, but plenty
 * of Brazilians appear as a single token on one side and two on the other.
 */
function joinByName(fb: readonly Fb[]): Map<string, Fb> {
  const byExact = new Map<string, Fb>();
  const bySurname = new Map<string, Fb[]>();
  for (const f of fb) {
    const k = key(f.name);
    byExact.set(k, f);
    const parts = k.split(" ");
    const surname = parts[parts.length - 1]!;
    (bySurname.get(surname) ?? bySurname.set(surname, []).get(surname)!).push(f);
  }
  const out = new Map<string, Fb>();
  for (const p of raw.players) {
    const k = key(p.name);
    const exact = byExact.get(k);
    if (exact) { out.set(p.id, exact); continue; }
    const parts = k.split(" ");
    const cands = bySurname.get(parts[parts.length - 1]!) ?? [];
    // Only accept a surname match when the first initial agrees AND it is unambiguous.
    const narrowed = cands.filter((c) => key(c.name)[0] === k[0]);
    if (narrowed.length === 1) out.set(p.id, narrowed[0]!);
  }
  return out;
}

/** Pearson r. Returns NaN when either side has no variance to correlate. */
function pearson(xs: readonly number[], ys: readonly number[]): number {
  const n = xs.length;
  if (n < 8) return NaN;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx, dy = ys[i]! - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  return sxx === 0 || syy === 0 ? NaN : sxy / Math.sqrt(sxx * syy);
}

const sd = (xs: readonly number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
};

/**
 * The candidate mapping: which FBref metric we propose to read each attribute from.
 *
 * Deliberately one metric per attribute, not a blend. A blend can only be tuned once the
 * individual signals are known to carry anything, and this run is what establishes that.
 * The attributes with no entry are the honest gap — event counts contain nothing about
 * whether a player is quick, brave or hard-working.
 */
const CANDIDATE: Partial<Record<AttrName, string>> = {
  finishing: "goalsPerShot",
  shotPower: "shots",
  crossing: "crosses",
  tackling: "tacklesWon",
  marking: "interceptions",
  anticipation: "interceptions",
  positioning: "interceptions",
  aggression: "fouls",
  dribbling: "fouled",
  vision: "assists",
  passing: "assists",
  composure: "goals",
  stamina: "minutes",
};

// --- assemble the comparison population ------------------------------------
const fb = loadFbref();
const matched = joinByName(fb);
const normalized = normalizeSnapshot(raw);
const inferredById = new Map(normalized.map((np) => [np.id, inferPlayer(np)]));

interface Row {
  readonly id: string;
  readonly fb: Fb;
  /** Ground truth: what the rating source says. */
  readonly truth: Partial<Record<AttrName, number>>;
  /** What our current two-number inference says. */
  readonly guess: Partial<Record<AttrName, number>>;
}

const rows: Row[] = [];
for (const [id, f] of matched) {
  const rec = pes.players[id];
  if (!rec || rec.status !== "matched" || !rec.ratings) continue;
  const inf = inferredById.get(id);
  if (!inf) continue;
  const mapped = toAttributes(rec.ratings);
  const flat = (o: Record<string, number>) => o as Partial<Record<AttrName, number>>;
  rows.push({
    id,
    fb: f,
    truth: { ...flat(mapped.physical), ...flat(mapped.mental), ...flat(mapped.technical) },
    guess: Object.fromEntries(
      [...Object.entries(inf.physical), ...Object.entries(inf.mental), ...Object.entries(inf.technical)].map(
        ([k, a]) => [k, a.value],
      ),
    ) as Partial<Record<AttrName, number>>,
  });
}

console.log(`\nFBref rows: ${fb.length}   joined to our squad: ${matched.size}   with PES ground truth: ${rows.length}\n`);

console.log("attribute      metric            r(fbref)   r(current)    sd(truth)  sd(current)");
const gains: { attr: string; fbref: number; current: number }[] = [];
for (const [attr, metric] of Object.entries(CANDIDATE) as [AttrName, string][]) {
  const usable = rows.filter((r) => r.truth[attr] !== undefined && r.guess[attr] !== undefined);
  const truth = usable.map((r) => r.truth[attr]!);
  const guess = usable.map((r) => r.guess[attr]!);
  const metricVals = usable.map((r) => r.fb.per90[metric]!);
  const rFb = pearson(metricVals, truth);
  const rCur = pearson(guess, truth);
  gains.push({ attr, fbref: rFb, current: rCur });
  const f = (x: number) => (Number.isFinite(x) ? x.toFixed(3).padStart(8) : "     n/a");
  console.log(
    `${attr.padEnd(14)} ${metric.padEnd(17)} ${f(rFb)}   ${f(rCur)}   ${sd(truth).toFixed(2).padStart(9)}  ${sd(guess).toFixed(2).padStart(10)}`,
  );
}

// The headline: does behaviour beat the archetype, attribute by attribute?
const better = gains.filter((g) => Number.isFinite(g.fbref) && Number.isFinite(g.current) && Math.abs(g.fbref) > Math.abs(g.current));
console.log(
  `\nFBref metric correlates more strongly than the current inference on ${better.length}/${gains.length} attributes` +
    (better.length ? `: ${better.map((g) => g.attr).join(", ")}` : ""),
);

/*
 * Why the raw comparison above flatters our guess, and what to measure instead.
 *
 * A PES attribute is mostly ONE factor: a good player rates well on everything (the mapping
 * aliases `response` into five of our attributes and `mentality` into four, so the vector
 * cannot help but be dominated by overall quality). Market value predicts quality, so
 * "predict quality" beats "predict behaviour" at reproducing PES — even for attributes where
 * event data plainly holds the better information.
 *
 * The question that actually matters for the unrated third is not "what LEVEL is this player"
 * — market value already answers that — but "which of his attributes stand out ABOVE that
 * level", which is exactly what the position archetype currently invents. So subtract each
 * player's own mean and correlate against the residual: the SHAPE, with quality removed from
 * both sides.
 */
const shapeOf = (truth: Partial<Record<AttrName, number>>) => {
  const vals = Object.values(truth).filter((v): v is number => v !== undefined);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return (attr: AttrName) => (truth[attr] === undefined ? undefined : truth[attr]! - mean);
};

console.log("\nsame test against attribute SHAPE (each player's own mean removed)\n");
console.log("attribute      metric            r(fbref)   r(current)");
let shapeWins = 0;
for (const [attr, metric] of Object.entries(CANDIDATE) as [AttrName, string][]) {
  const usable = rows.filter((r) => r.truth[attr] !== undefined && r.guess[attr] !== undefined);
  const truthShape = usable.map((r) => shapeOf(r.truth)(attr)!);
  const guessShape = usable.map((r) => shapeOf(r.guess)(attr)!);
  const metricVals = usable.map((r) => r.fb.per90[metric]!);
  const rFb = pearson(metricVals, truthShape);
  const rCur = pearson(guessShape, truthShape);
  if (Number.isFinite(rFb) && Number.isFinite(rCur) && Math.abs(rFb) > Math.abs(rCur)) shapeWins++;
  const f = (x: number) => (Number.isFinite(x) ? x.toFixed(3).padStart(8) : "     n/a");
  console.log(`${attr.padEnd(14)} ${metric.padEnd(17)} ${f(rFb)}   ${f(rCur)}`);
}
console.log(`\nFBref wins on SHAPE for ${shapeWins}/${Object.keys(CANDIDATE).length} attributes.`);

// And the attributes nothing here can reach, stated rather than quietly defaulted.
const ALL: AttrName[] = [
  "pace", "stamina", "strength", "agility",
  "decisions", "composure", "workRate", "teamwork", "aggression", "anticipation", "positioning", "vision",
  "passing", "technique", "dribbling", "finishing", "shotPower", "tackling", "marking", "crossing",
];
const uncovered = ALL.filter((a) => !(a in CANDIDATE));
console.log(`\nNo event-data proxy at all (${uncovered.length}/20): ${uncovered.join(", ")}`);
