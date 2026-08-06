import { existsSync, readFileSync } from "node:fs";
import { Position, WEIGHTS, positionOverall, type AttrName, type Player, type Team } from "@fut/domain";
import { loadLeagueTeams, type LeagueData } from "@fut/competition";
import { readRatingsFile, sourceToOurs, toOurScale, GK_SOURCE_LABELS, REQUIRED_LABELS } from "@fut/dataset";

/**
 * Why one position rates higher than another, decomposed.
 *
 * The observation to explain: the best attacking midfielder in the dataset rates 89.1 and the best
 * striker 80.3. Two explanations fit that number and they call for opposite fixes.
 *
 *  - The PLAYERS differ. Brazilian football produces better attacking midfielders than strikers, the
 *    ratings are telling the truth, and changing weights would be falsifying it.
 *  - The LENS differs. Each position's overall is a weighted mean over a different subset of
 *    attributes, and some subsets are simply easier to score well on — because the source rates those
 *    attributes higher across everybody, or because a short weight set concentrated on a specialist's
 *    strengths reads higher than a long one that includes his weaknesses.
 *
 * Three measurements separate them:
 *
 *  1. NEUTRAL OVERALL — every position's weights applied to one hypothetical player holding the
 *     population mean of every attribute. Players are held constant, so any spread here is the lens
 *     alone. This is the number that decides the task.
 *  2. CROSS-POSITION — every player's overall at every position. If the top attacking midfielder also
 *     rates near the top as a striker, he is just a better footballer; if he collapses, the lens did
 *     the work.
 *  3. CONTRIBUTION — for the top player at each position, how much each weighted attribute added,
 *     so a fix can name the attribute rather than nudging a constant.
 *
 * ## Two measurements added after this instrument was wrong
 *
 * It reported the lens innocent while the lens WAS the problem, and both additions come from that.
 *
 *  0. THE SOURCE'S OWN SCALE, before our mapping. Everything else here is measured on attributes that
 *     have already been through the mapping, so a mapping that pays one attribute more than another was
 *     baked into the inputs and invisible to every number below — the neutral overall looked flat while
 *     the source's Finishing sat 3.7 FM points under its Work Rate. A lens measured against a skewed
 *     population cannot see the skew, so the skew has to be measured upstream, in FM's own 1–20.
 *  4. THE LENS SWAP. The neutral overall answers "is this set generous to an AVERAGE player", which is
 *     not the question a top-20 table asks. Rating each position's own top 20 through every other
 *     position's weights answers it directly: if the lens is the problem, another lens lifts the same
 *     players; if the players are the problem, they rate the same whichever set is used. This is what
 *     settled the central midfielder — its top 20 read 76.0 through its own weights and 76.1 through
 *     the attacking midfielder's, so there was nothing in the lens to fix.
 *
 *   npx tsx packages/app-cli/src/weightAudit.ts [league.json]
 */

const PATH = process.argv[2] ?? "packages/web/src/lib/career/datasets/brasileirao/league.json";
const teams = loadLeagueTeams(JSON.parse(readFileSync(PATH, "utf8")) as LeagueData) as Team[];
const players: { p: Player; club: string }[] = teams.flatMap((t) =>
  [...t.startingXi, ...t.bench].map((p) => ({ p, club: t.shortName })),
);

const POSITIONS = Object.keys(WEIGHTS) as Position[];
const f = (x: number) => x.toFixed(1);
const pad = (s: string, n: number) => s.padEnd(n);

/** Every attribute in the flat WEIGHTS space, read off a player the same way `positionOverall` does. */
const ALL: readonly AttrName[] = [...new Set(POSITIONS.flatMap((pos) => Object.keys(WEIGHTS[pos]) as AttrName[]))];
const GK_KEYS = new Set<AttrName>(["reflexes", "handling", "gkPositioning", "oneOnOnes"]);

function valueOf(p: Player, key: AttrName): number {
  const gk = (p as { goalkeeping?: Record<string, number> }).goalkeeping;
  if (key === "gkPositioning") return gk?.positioning ?? 1;
  if (GK_KEYS.has(key)) return gk?.[key] ?? 1;
  const groups = p as unknown as Record<string, Record<string, number>>;
  for (const g of ["physical", "mental", "technical"]) {
    const v = groups[g]?.[key];
    if (typeof v === "number") return v;
  }
  throw new Error(`no such attribute: ${key}`);
}

const stat = (xs: readonly number[]) => {
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  return { mean, sd: Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length) };
};

/*
 * --- 0. THE SOURCE'S OWN 1–20, which every other number here is downstream of ---
 *
 * Read from the ratings layer rather than the artifact, because the artifact only holds attributes that
 * have already been mapped. Two clubs' worth of the same distortion is still one distortion, so both
 * divisions are pooled.
 *
 * `shift` is what the per-attribute calibration moves this label by, in OUR points, measured at the
 * middle of the scale: `sourceToOurs` against the shared curve. A label the source is generous with gets
 * a negative shift and one it is stingy with a positive one, and the column is only readable next to the
 * FM mean it is derived from — a big shift on a label with a mean far from the general level is the
 * calibration working, not a red flag.
 */
const RATINGS = ["packages/dataset/data/brasileirao-serie-a", "packages/dataset/data/brasileirao-serie-b"]
  .filter((d) => existsSync(`${d}/ratings.json`));
if (RATINGS.length === 0) {
  console.log("SOURCE SCALE — skipped: no ratings.json beside the raw snapshots\n");
} else {
  // Only the labels our model reads. The source publishes 47 and we map 27; including Eccentricity or
  // Long Throws would move the "general level" everything here is measured against without moving a
  // single rating.
  const GK_ONLY = GK_SOURCE_LABELS;
  const mapped = new Set<string>([...REQUIRED_LABELS.outfield, ...REQUIRED_LABELS.goalkeeper]);

  /*
   * Each label measured over the players it actually measures, which is the same split `SOURCE_MEAN`
   * makes and the reason this table can be read against it. A keeper's Finishing and an outfielder's
   * Reflexes are "not applicable" written as a number: pooling every row gave the goalkeeping labels a
   * mean of 3.3 — a statement about how many outfielders were in the pool, not about goalkeeping — and
   * dragged every outfield label a full point below its real level.
   *
   * Which kind of row it is comes from the row itself, by the rule the resolver uses: FM rates an
   * outfielder's goalkeeping 1–3 and a keeper's 10 and up.
   */
  const byLabel = new Map<string, number[]>();
  for (const dir of RATINGS) {
    for (const rec of Object.values(readRatingsFile(`${dir}/ratings.json`)?.players ?? {})) {
      if (rec.status !== "matched" || !rec.attributes) continue;
      const gkValues = [...GK_ONLY].map((l: string) => rec.attributes![l]).filter((v): v is number => typeof v === "number");
      const keeperRow = gkValues.length === GK_ONLY.size && [...gkValues].sort((a, b) => a - b)[Math.floor(gkValues.length / 2)]! >= 7;
      for (const [label, v] of Object.entries(rec.attributes)) {
        if (typeof v !== "number" || !mapped.has(label)) continue;
        if (GK_ONLY.has(label) !== keeperRow) continue;
        byLabel.set(label, [...(byLabel.get(label) ?? []), v]);
      }
    }
  }
  const outfieldPool = [...byLabel.entries()].filter(([l]) => !GK_ONLY.has(l)).flatMap(([, xs]) => xs);
  console.log(`SOURCE SCALE — FM's own 1–20 over ${byLabel.get("Passing")?.length ?? 0} matched rows, both divisions`);
  console.log(`  general level ${f(stat(outfieldPool).mean)}; a label far from it was being paid the same as one at it\n`);
  console.log(`  ${pad("label", 18)} ${"mean".padStart(5)} ${"sd".padStart(5)} ${"≥15".padStart(6)} ${"shift".padStart(6)}`);
  const bySource = [...byLabel.entries()]
    .map(([label, xs]) => ({ label, ...stat(xs), elite: xs.filter((x) => x >= 15).length / xs.length, shift: sourceToOurs(label, 11) - toOurScale(11) }))
    .sort((a, b) => a.mean - b.mean);
  for (const r of bySource) {
    console.log(
      `  ${pad(`${r.label}${GK_ONLY.has(r.label) ? " (gk)" : ""}`, 18)} ${f(r.mean).padStart(5)} ${f(r.sd).padStart(5)} ` +
        `${`${(r.elite * 100).toFixed(1)}%`.padStart(6)} ${(r.shift >= 0 ? "+" : "") + f(r.shift)}`.padStart(7),
    );
  }
  const outfieldLabels = bySource.filter((r) => !GK_ONLY.has(r.label));
  console.log(
    `  spread of the MEANS: ${f(Math.max(...outfieldLabels.map((r) => r.mean)) - Math.min(...outfieldLabels.map((r) => r.mean)))} FM points ` +
      `across ${outfieldLabels.length} outfield labels — this is what the calibration is levelling.\n`,
  );
}

// --- 1. attribute population, outfield only (a keeper's outfield numbers are largely inferred) ---
const outfield = players.filter(({ p }) => p.position !== Position.Goalkeeper).map(({ p }) => p);
const keepers = players.filter(({ p }) => p.position === Position.Goalkeeper).map(({ p }) => p);

console.log(`${players.length} players from ${teams.length} clubs — ${PATH.split(/[\\/]/).pop()}\n`);
console.log("ATTRIBUTE POPULATION (outfield)");
console.log(`  ${pad("attribute", 16)} ${"mean".padStart(6)} ${"sd".padStart(5)} ${"p90".padStart(6)}  weighted by`);
const meanOf = new Map<AttrName, number>();
for (const key of ALL) {
  const pool = GK_KEYS.has(key) ? keepers : outfield;
  const xs = pool.map((p) => valueOf(p, key)).sort((a, b) => a - b);
  const { mean, sd } = stat(xs);
  meanOf.set(key, mean);
  const users = POSITIONS.filter((pos) => WEIGHTS[pos][key] !== undefined).length;
  console.log(`  ${pad(key, 16)} ${f(mean).padStart(6)} ${f(sd).padStart(5)} ${f(xs[Math.floor(xs.length * 0.9)]!).padStart(6)}  ${users} position(s)`);
}

// --- 2. the lens, with players held constant ---
console.log("\nNEUTRAL OVERALL — one average player, seen through each position's weights");
console.log("  (players held constant, so every difference here is the weight set)");
const neutral = POSITIONS.map((pos) => {
  const w = WEIGHTS[pos];
  const keys = Object.keys(w) as AttrName[];
  const total = keys.reduce((s, k) => s + w[k]!, 0);
  const value = keys.reduce((s, k) => s + meanOf.get(k)! * w[k]!, 0) / total;
  return { pos, value, keys: keys.length, total };
}).sort((a, b) => b.value - a.value);
for (const n of neutral) {
  console.log(`  ${pad(n.pos, 22)} ${f(n.value).padStart(5)}   ${String(n.keys).padStart(2)} attrs, weight total ${String(n.total).padStart(2)}`);
}
const lensSpread = neutral[0]!.value - neutral[neutral.length - 1]!.value;
console.log(`  lens spread: ${f(lensSpread)} points, ${neutral[0]!.pos} over ${neutral[neutral.length - 1]!.pos}`);

/*
 * --- 2b. the lens CEILING, which is a different question from the lens average ---
 *
 * The neutral overall above holds a player at the population MEAN of every attribute, and answers "is
 * this weight set generous to an average footballer". That is not the question a top-20 table asks. An
 * elite player sits in the tail of each of his attributes, and the tails are not the same shape:
 * `finishing` and `vision` reach 75 at the 90th percentile while `technique`, `dribbling`, `passing`
 * and `pace` reach 80. A lens weighted on the second group STRETCHES further at the top than at the
 * middle, even when its average is identical.
 *
 * So the same calculation at the 90th and 99th percentile of every attribute. The gap between a
 * position's mean-lens and its p99-lens is how much headroom the weight set gives its best players —
 * and a position with more headroom will top the table whether or not its players are better.
 */
const quantile = (key: AttrName, q: number): number => {
  const pool = GK_KEYS.has(key) ? keepers : outfield;
  const xs = pool.map((p) => valueOf(p, key)).sort((a, b) => a - b);
  return xs[Math.min(xs.length - 1, Math.floor(xs.length * q))]!;
};
const lensAt = (pos: Position, q: number | null): number => {
  const w = WEIGHTS[pos];
  const keys = Object.keys(w) as AttrName[];
  const total = keys.reduce((s, k) => s + w[k]!, 0);
  return keys.reduce((s, k) => s + (q === null ? meanOf.get(k)! : quantile(k, q)) * w[k]!, 0) / total;
};
console.log("\nLENS CEILING — the same weights applied at the population's 90th and 99th percentile");
console.log(`  ${pad("position", 22)} ${"mean".padStart(5)} ${"p90".padStart(6)} ${"p99".padStart(6)} ${"headroom".padStart(9)}`);
const ceiling = POSITIONS.map((pos) => ({ pos, mean: lensAt(pos, null), p90: lensAt(pos, 0.9), p99: lensAt(pos, 0.99) }))
  .sort((a, b) => b.p99 - a.p99);
for (const c of ceiling) {
  console.log(`  ${pad(c.pos, 22)} ${f(c.mean).padStart(5)} ${f(c.p90).padStart(6)} ${f(c.p99).padStart(6)} ${f(c.p99 - c.mean).padStart(9)}`);
}
console.log(`  p99 spread: ${f(ceiling[0]!.p99 - ceiling[ceiling.length - 1]!.p99)} points, ${ceiling[0]!.pos} over ${ceiling[ceiling.length - 1]!.pos}`);

// --- 3. cross-position: is the top man at each position position-specific, or just good? ---
console.log("\nCROSS-POSITION — the top player at each position, rated at every position");
console.log(`  ${pad("", 22)} ${POSITIONS.map((p) => pad(p.slice(0, 6), 7)).join("")}`);
for (const pos of POSITIONS) {
  const at = players.filter(({ p }) => p.position === pos).sort((a, b) => positionOverall(b.p, pos) - positionOverall(a.p, pos));
  const top = at[0];
  if (!top) continue;
  const row = POSITIONS.map((other) => pad(f(positionOverall(top.p, other)), 7)).join("");
  console.log(`  ${pad(`${top.p.name} (${top.club})`.slice(0, 21), 22)} ${row}`);
}

/*
 * --- 3b. the lens premium, measured on the ELITE rather than on an average player ---
 *
 * The neutral overall above uses one average player, which answers "is this weight set generous" but
 * not "is it generous TO THE PLAYERS WHO ACTUALLY PLAY THERE". A specialist's rating depends on how
 * exceptional he is at the specific attributes his position weights, and that can differ from the
 * population picture: an attribute everyone is mediocre at may still have a very high ceiling.
 *
 * So: take the top 20 at each position and compare their overall THERE against their mean overall
 * across all nine lenses. A high premium means the position's weights single these players out; a low
 * one means they would rate about the same anywhere, i.e. they are simply good footballers.
 */
console.log("\nLENS PREMIUM — top 20 at each position: own rating vs their mean across all nine lenses");
const premium = POSITIONS.map((pos) => {
  const at = players
    .filter(({ p }) => p.position === pos)
    .sort((a, b) => positionOverall(b.p, pos) - positionOverall(a.p, pos))
    .slice(0, 20);
  const own = stat(at.map(({ p }) => positionOverall(p, pos))).mean;
  const anywhere = stat(at.flatMap(({ p }) => POSITIONS.map((o) => positionOverall(p, o)))).mean;
  // Their best position, whatever it is — catches a position whose players belong somewhere else.
  const best = stat(at.map(({ p }) => Math.max(...POSITIONS.map((o) => positionOverall(p, o))))).mean;
  return { pos, own, anywhere, best, n: at.length };
}).sort((a, b) => b.own - a.own);
console.log(`  ${pad("position", 22)} ${"own".padStart(5)} ${"any".padStart(6)} ${"prem".padStart(6)} ${"best".padStart(6)}  reads best as`);
for (const r of premium) {
  const at = players.filter(({ p }) => p.position === r.pos).sort((a, b) => positionOverall(b.p, r.pos) - positionOverall(a.p, r.pos)).slice(0, 20);
  // Where the position's own players rate highest, counted — a majority elsewhere is a mislabel, not a weight problem.
  const tally = new Map<Position, number>();
  for (const { p } of at) {
    const bestPos = POSITIONS.reduce((a, b) => (positionOverall(p, b) > positionOverall(p, a) ? b : a));
    tally.set(bestPos, (tally.get(bestPos) ?? 0) + 1);
  }
  const where = [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([p, n]) => `${p.slice(0, 6)} ${n}`).join(", ");
  console.log(`  ${pad(r.pos, 22)} ${f(r.own).padStart(5)} ${f(r.anywhere).padStart(6)} ${f(r.own - r.anywhere).padStart(6)} ${f(r.best).padStart(6)}  ${where}`);
}

/*
 * --- 3c. THE LENS SWAP, which is the measurement that actually settles lens-versus-players ---
 *
 * Each position's own top 20, rated through every position's weights. Read a row: if some other lens
 * lifts these players well above their own, their own lens is stingy TO THEM and the weights are worth
 * changing. If no lens does, the rating is about the footballers and a weight change would be
 * falsifying it.
 *
 * This is what closed the central midfielder question. Its top 20 read 76.0 under its own weights and
 * 76.1 under the attacking midfielder's — a wash — while the attacking midfielder's own top 20 read
 * 81.9 and fell to 75.5 under the central midfielder's. Neither set is generous; the AM pool is simply
 * 4 to 8 points better at passing, vision, technique and first touch, and the CM pool is better at
 * stamina, work rate and tackling, which is what the two sets each say they measure.
 *
 * The label count comes first because a label nobody holds makes every number about it meaningless:
 * Transfermarkt has no wing-back, so that weight set is only ever exercised as a tactical ROLE.
 */
console.log("\nWHO CARRIES EACH LABEL — a set with no players is only exercised as a tactical role");
for (const pos of POSITIONS) {
  const n = players.filter(({ p }) => p.position === pos).length;
  console.log(`  ${pad(pos, 22)} ${String(n).padStart(4)}${n === 0 ? "   <- no player in the dataset holds this label" : ""}`);
}

const pools = POSITIONS.map((pos) => ({
  pos,
  top: players
    .filter(({ p }) => p.position === pos)
    .sort((a, b) => positionOverall(b.p, pos) - positionOverall(a.p, pos))
    .slice(0, 20)
    .map(({ p }) => p),
})).filter((r) => r.top.length > 0);
console.log("\nLENS SWAP — each position's top 20 (rows) rated through every position's weights (columns)");
console.log(`  ${pad("", 22)} ${pools.map((c) => pad(c.pos.slice(0, 6), 7)).join("")}  own    best other`);
for (const row of pools) {
  const cells = pools.map((c) => stat(row.top.map((p) => positionOverall(p, c.pos))).mean);
  const own = stat(row.top.map((p) => positionOverall(p, row.pos))).mean;
  const others = pools.filter((c) => c.pos !== row.pos).map((c) => ({ pos: c.pos, v: stat(row.top.map((p) => positionOverall(p, c.pos))).mean }));
  const best = others.reduce((a, b) => (b.v > a.v ? b : a));
  console.log(
    `  ${pad(row.pos, 22)} ${cells.map((v) => pad(f(v), 7)).join("")}  ${f(own).padStart(5)}  ${best.pos.slice(0, 6)} ${f(best.v)} (${best.v > own ? "+" : ""}${f(best.v - own)})`,
  );
}

// --- 4. where the top man's rating comes from ---
console.log("\nCONTRIBUTION — what the top player at each position is actually rated on");
for (const pos of POSITIONS) {
  const at = players.filter(({ p }) => p.position === pos).sort((a, b) => positionOverall(b.p, pos) - positionOverall(a.p, pos));
  const top = at[0];
  if (!top) continue;
  const w = WEIGHTS[pos];
  const keys = (Object.keys(w) as AttrName[]).sort((a, b) => w[b]! - w[a]! || (a < b ? -1 : 1));
  const total = keys.reduce((s, k) => s + w[k]!, 0);
  const parts = keys.map((k) => `${k} ${valueOf(top.p, k)}×${w[k]}`);
  console.log(`  ${pad(pos, 22)} ${f(positionOverall(top.p, pos)).padStart(5)}  ${top.p.name}`);
  console.log(`    ${parts.join("  ")}  /${total}`);
}

// --- 5. the three new attributes, and what weighting them would do ---
console.log("\nTHE UNWEIGHTED THREE — population, and the pull each would exert per position");
for (const key of ["offTheBall", "firstTouch", "heading"] as const) {
  const xs = outfield.map((p) => valueOf(p, key));
  const { mean, sd } = stat(xs);
  console.log(`  ${pad(key, 12)} outfield mean ${f(mean)} sd ${f(sd)}`);
}
console.log("\n  For each position: the mean of its OWN players' three values, against its current neutral");
console.log("  overall — a positive pull means weighting them RAISES that position.");
for (const pos of POSITIONS) {
  const at = players.filter(({ p }) => p.position === pos).map(({ p }) => p);
  if (at.length === 0) continue;
  const base = neutral.find((n) => n.pos === pos)!.value;
  const cells = (["offTheBall", "firstTouch", "heading"] as const).map((k) => {
    const m = stat(at.map((p) => valueOf(p, k))).mean;
    return `${k.slice(0, 10)} ${f(m).padStart(5)} (${m > base ? "+" : ""}${f(m - base)})`;
  });
  console.log(`  ${pad(pos, 22)} ${cells.join("  ")}`);
}
