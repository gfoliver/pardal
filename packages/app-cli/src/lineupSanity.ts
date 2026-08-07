import { readFileSync } from "node:fs";
import {
  type AssignablePlayer,
  assignToFormation,
  fitPenalty,
  Formation,
  getFormationTemplate,
  Position,
  PositionGroup,
  positionGroup,
} from "@fut/domain";
import type { DatedFixture, LeagueData, PlayerData } from "@fut/competition";
import {
  buildPlayer,
  Career,
  effectiveOverall,
  indexPlayers,
  isAvailable,
  OUT_OF_POSITION_FIT_THRESHOLD,
  type PlayerDev,
} from "@fut/career";

/**
 * How stupid is the eleven a career fixture actually fields?
 *
 * `buildMatchTeam` is the only code that picks an XI for a fixture, and it sorts its pool on
 * `effectiveOverall` — the rating at the player's OWN position — with one positional test in it: is
 * this slot the goalkeeper's. So an unavailable starter is replaced by the best-rated body left,
 * whatever the slot wants, and the second fallback drops even the keeper guard.
 *
 * `assignToFormation` already solves exactly that problem exactly (Hungarian over `best - rating +
 * fitPenalty`), and the career runs it once per club at creation and then never again. The gap between
 * the two, over the SAME available pool and the SAME formation, is the size of the bug. This harness
 * measures it and nothing else: it fixes nothing and writes nothing.
 *
 * Measurement seam: `advanceDay()` moves the clock, heals injuries and then STOPS without playing when
 * the managed club is on that day — and in a 20-club double round-robin the managed club plays every
 * round, so every league match day is a stop. At that stop the state is exactly matchday state, so
 * `buildTeams(fixture)` returns the eleven the engine is about to be handed, for every club in both
 * divisions.
 *
 *   npx tsx packages/app-cli/src/lineupSanity.ts [seasons] [seed] [examples]
 */

const league = JSON.parse(readFileSync("packages/web/src/lib/career/datasets/brasileirao/league.json", "utf8")) as LeagueData;
const world = JSON.parse(readFileSync("packages/web/src/lib/career/datasets/brasileirao/world.json", "utf8")) as never;

const seasons = Number(process.argv[2] ?? 5);
const seed = Number(process.argv[3] ?? 4242);
const exampleCount = Number(process.argv[4] ?? 12);
const mine = league.teams.find((t) => t.name.includes("Flamengo"))?.id ?? league.teams[0]!.id;
const byId: ReadonlyMap<string, PlayerData> = indexPlayers(league);

/** `assign.ts`'s own line ladder — not exported, so it is restated here to stay in step with it. */
const LINE: Record<PositionGroup, number> = {
  [PositionGroup.Goalkeeper]: 0,
  [PositionGroup.Defence]: 1,
  [PositionGroup.Midfield]: 2,
  [PositionGroup.Attack]: 3,
};
const lineDistance = (a: Position, b: Position): number => Math.abs(LINE[positionGroup(a)] - LINE[positionGroup(b)]);

/**
 * Exactly `StoredTactics.buildPool`'s entry, because the whole point is to score the actual XI with
 * the same cost function the solver uses. `ovr` is the rating at his own position; `ratingAt` carries
 * the familiarity debuff, which is what makes `fitPenalty` the real modelled drop rather than an
 * estimate.
 */
interface Entry extends AssignablePlayer {
  readonly ovr: number;
  readonly natural: Position;
  readonly ratingAt: (p: Position) => number;
}

function entryOf(id: string, dev: PlayerDev | undefined): Entry | undefined {
  const data = byId.get(id);
  if (!data) return undefined;
  const player = buildPlayer(data, dev);
  const natural = data.position as Position;
  return {
    id,
    position: natural,
    natural,
    isGoalkeeper: natural === Position.Goalkeeper,
    rating: effectiveOverall(data, dev),
    ovr: effectiveOverall(data, dev),
    ratingAt: (p: Position) => player.overall(p),
  };
}

/** Σ(rating − positional penalty): what the solver maximises, in rating points. */
function valueOf(picks: readonly { entry: Entry; at: Position }[]): { value: number; penalty: number; rating: number } {
  let penalty = 0;
  let rating = 0;
  for (const p of picks) {
    penalty += fitPenalty(p.entry, p.at);
    rating += p.entry.ovr;
  }
  return { value: rating - penalty, penalty, rating };
}

type Cause = "stored" | "replacement" | "slotFielded";

interface Starter {
  readonly slot: number;
  readonly id: string;
  readonly natural: Position;
  readonly fielded: Position;
  readonly templatePos: Position;
  /** The engine's own binary test: `Player.familiarity(fielded) < 1`. */
  readonly oop: boolean;
  /** `Career.fitAt` — a different number on a different scale (own position is the denominator). */
  readonly fit: number;
  readonly lineDist: number;
  readonly drop: number;
  readonly cause: Cause;
}

interface Side {
  readonly season: number;
  readonly day: number;
  readonly clubId: string;
  readonly managed: boolean;
  readonly formation: Formation;
  readonly poolSize: number;
  readonly starters: readonly Starter[];
  /** Solver over the same available pool and formation. */
  readonly solverValue: number;
  readonly solverPenalty: number;
  readonly actualValueTemplate: number;
  readonly actualPenaltyTemplate: number;
  readonly actualValueFielded: number;
  readonly actualPenaltyFielded: number;
  readonly replacements: number;
}

const sides: Side[] = [];
const forfeitsPerSeason: number[] = [];
const voidsPerSeason: number[] = [];

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

const c = Career.create(league, { leagueId: "BRA1", managedClubId: mine, seed, world });
const divisions = c.snapshot().structure.divisions.map((d) => `${d.name} (${d.teamIds.length})`);
console.log(`lineup sanity · seed ${seed} · ${seasons} season(s) · managing ${c.clubName(mine)}`);
console.log(`divisions: ${divisions.join(" | ")}\n`);

/** Every fixture still unplayed on `day`, across every competition. */
function fixturesOn(day: number): DatedFixture[] {
  const out: DatedFixture[] = [];
  for (const comp of c.snapshot().competitions) {
    const played = new Set(comp.playedFixtureIndexes);
    for (const f of comp.fixtures) if (f.day === day && !played.has(f.fixtureIndex)) out.push(f);
  }
  return out;
}

const devOf = (id: string): PlayerDev | undefined => c.snapshot().playerDev[id];
/** `buildMatchTeam`'s own availability test, so the pool this harness solves over is its pool. */
const fieldable = (clubId: string): string[] =>
  (c.snapshot().clubs[clubId]?.squad.playerIds ?? []).filter((id) => byId.has(id) && isAvailable(devOf(id) ?? FALLBACK_DEV));
const FALLBACK_DEV: PlayerDev = { playerId: "", currentAbility: 100, potentialAbility: 100, attributeDeltas: {}, fitness: 100, yellowAccumulation: {}, ageAtSeasonStart: 25 };

function measureSide(season: number, day: number, clubId: string, team: import("@fut/domain").Team): void {
  const club = c.snapshot().clubs[clubId]!;
  const tactic = club.tacticSlots.find((t) => t.id === club.activeTacticId) ?? club.tacticSlots[0]!;
  const template = getFormationTemplate(tactic.formation);
  const xi = team.startingXi;
  if (xi.length !== template.length) return; // short side — the runner awards these, it never builds them

  const pool = fieldable(clubId)
    .map((id) => entryOf(id, devOf(id)))
    .filter((e): e is Entry => e !== undefined);

  const starters: Starter[] = [];
  const actualTemplate: { entry: Entry; at: Position }[] = [];
  const actualFielded: { entry: Entry; at: Position }[] = [];
  let replacements = 0;

  xi.forEach((p, i) => {
    const entry = entryOf(p.id, devOf(p.id));
    if (!entry) return;
    const templatePos = template[i]!.position;
    const fielded = team.tactics.positionFor(p.id) ?? templatePos;
    const stored = tactic.lineup[i];
    const chose = tactic.slotFielded?.[i] !== undefined;
    const replaced = stored !== p.id;
    if (replaced) replacements++;
    /*
     * Three causes, and they are three different defects:
     *  - `replacement`: the stored starter was unavailable and the pool handed the slot to the
     *    best-rated body left, position ignored.
     *  - `slotFielded`: the manager (or a slot he set, inherited by whoever replaced him — the index
     *    is the SLOT, not the player) asked for a position other than the template's.
     *  - `stored`: the stored lineup itself puts him there. At creation that is the solver's own
     *    considered compromise; every season after, it is drift.
     */
    const cause: Cause = replaced ? "replacement" : chose ? "slotFielded" : "stored";
    const natural = entry.natural;
    const player = buildPlayer(byId.get(p.id)!, devOf(p.id));
    const oop = player.familiarity(fielded) < 1;
    const fit = c.fitAt(p.id, fielded) ?? 1;
    starters.push({
      slot: i,
      id: p.id,
      natural,
      fielded,
      templatePos,
      oop,
      fit,
      lineDist: lineDistance(natural, fielded),
      drop: entry.ratingAt(natural) - entry.ratingAt(fielded),
      cause,
    });
    actualTemplate.push({ entry, at: templatePos });
    actualFielded.push({ entry, at: fielded });
  });

  const { slots } = assignToFormation(pool, tactic.formation);
  const ovrById = new Map(pool.map((p) => [p.id, p]));
  const solverPicks: { entry: Entry; at: Position }[] = [];
  for (const [i, a] of slots.entries()) {
    const e = a ? ovrById.get(a.playerId) : undefined;
    if (e) solverPicks.push({ entry: e, at: template[i]!.position });
  }

  const solver = valueOf(solverPicks);
  const atTemplate = valueOf(actualTemplate);
  const atFielded = valueOf(actualFielded);

  sides.push({
    season,
    day,
    clubId,
    managed: clubId === mine,
    formation: tactic.formation,
    poolSize: pool.length,
    starters,
    solverValue: solver.value,
    solverPenalty: solver.penalty,
    actualValueTemplate: atTemplate.value,
    actualPenaltyTemplate: atTemplate.penalty,
    actualValueFielded: atFielded.value,
    actualPenaltyFielded: atFielded.penalty,
    replacements,
  });
}

/** Stored XI vs the best XI over the WHOLE squad — the frozen-tactic distance, availability aside. */
function storedDrift(clubId: string): { drift: number; oop: number; shutOut: number } | undefined {
  const club = c.snapshot().clubs[clubId];
  if (!club || club.tacticSlots.length === 0) return undefined;
  const tactic = club.tacticSlots.find((t) => t.id === club.activeTacticId) ?? club.tacticSlots[0]!;
  const template = getFormationTemplate(tactic.formation);
  const squad = club.squad.playerIds.map((id) => entryOf(id, devOf(id))).filter((e): e is Entry => e !== undefined);
  const byPid = new Map(squad.map((e) => [e.id, e]));

  const storedPicks: { entry: Entry; at: Position }[] = [];
  let oop = 0;
  template.forEach((slot, i) => {
    const id = tactic.lineup[i];
    const e = id ? byPid.get(id) : undefined;
    if (!e) return;
    const at = tactic.slotFielded?.[i] ?? slot.position;
    storedPicks.push({ entry: e, at });
    if (buildPlayer(byId.get(e.id)!, devOf(e.id)).familiarity(at) < 1) oop++;
  });
  if (storedPicks.length !== template.length) return undefined;

  const { slots } = assignToFormation(squad, tactic.formation);
  const solverPicks: { entry: Entry; at: Position }[] = [];
  for (const [i, a] of slots.entries()) {
    const e = a ? byPid.get(a.playerId) : undefined;
    if (e) solverPicks.push({ entry: e, at: template[i]!.position });
  }
  const chosen = new Set(storedPicks.map((p) => p.entry.id));
  const weakest = Math.min(...storedPicks.map((p) => p.entry.ovr));
  const shutOut = squad.filter((e) => !chosen.has(e.id) && e.ovr >= weakest + 3).length;
  return { drift: valueOf(solverPicks).value - valueOf(storedPicks).value, oop, shutOut };
}

interface Drift {
  readonly season: number;
  readonly aiMean: number;
  readonly aiMax: number;
  readonly aiOop: number;
  readonly aiShutOut: number;
  /** `undefined` when the managed club can no longer name eleven — NOT zero. */
  readonly mineDrift: number | undefined;
  readonly mineOop: number | undefined;
}
const drifts: Drift[] = [];

function recordDrift(season: number): void {
  const rows = Object.keys(c.snapshot().clubs)
    .map((id) => ({ id, d: storedDrift(id) }))
    .filter((r): r is { id: string; d: NonNullable<ReturnType<typeof storedDrift>> } => r.d !== undefined);
  const ai = rows.filter((r) => r.id !== mine);
  const me = rows.find((r) => r.id === mine);
  drifts.push({
    season,
    aiMean: ai.reduce((a, r) => a + r.d.drift, 0) / Math.max(1, ai.length),
    aiMax: Math.max(...ai.map((r) => r.d.drift)),
    aiOop: ai.reduce((a, r) => a + r.d.oop, 0) / Math.max(1, ai.length),
    aiShutOut: ai.reduce((a, r) => a + r.d.shutOut, 0) / Math.max(1, ai.length),
    mineDrift: me?.d.drift,
    mineOop: me?.d.oop,
  });
}

/** Every club's XI on every match day, rolled into one hash — the determinism check compares two. */
let lineHash = "";
let firstSeasonHash = "";
const stamp = (s: string): void => {
  // FNV-1a over the whole run: order-sensitive and cheap, which is all a "same or not" needs.
  let h = 0x811c9dc5;
  for (const ch of `${lineHash}|${s}`) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  lineHash = h.toString(16);
};
/** Fixtures actually played, per season — the denominator the measured-sides count is checked against. */
const playedPerSeason: number[] = [];

recordDrift(0);

for (let season = 0; season < seasons; season++) {
  let guard = 0;
  while (!c.seasonComplete && guard++ < 4_000) {
    const stop = c.advanceDay();
    if (stop.blocked === "seasonEnd") break;
    if (stop.blocked !== "userMatch") continue;
    // Clock moved, injuries healed, nothing on this day played yet: matchday state exactly.
    for (const f of fixturesOn(stop.day)) {
      if (fieldable(f.homeTeamId).length < 11 || fieldable(f.awayTeamId).length < 11) continue;
      const { home, away } = c.buildTeams(f);
      measureSide(season, stop.day, f.homeTeamId, home);
      measureSide(season, stop.day, f.awayTeamId, away);
      stamp(`${f.homeTeamId}:${home.startingXi.map((p) => `${p.id}@${home.tactics.positionFor(p.id)}`).join(",")}`);
      stamp(`${f.awayTeamId}:${away.startingXi.map((p) => `${p.id}@${away.tactics.positionFor(p.id)}`).join(",")}`);
    }
    c.advance(); // play the day we just measured
  }
  const results = c.snapshot().competitions.flatMap((comp) => comp.results);
  forfeitsPerSeason.push(results.filter((r) => r.status === "forfeit").length);
  voidsPerSeason.push(results.filter((r) => r.status === "void").length);
  playedPerSeason.push(results.filter((r) => !r.status).length);
  if (season === 0) firstSeasonHash = lineHash;
  if (season === seasons - 1) finalTables();
  c.rolloverSeason();
  recordDrift(season + 1);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const pct = (n: number, d: number) => `${((100 * n) / Math.max(1, d)).toFixed(1)}%`;
const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const quantile = (xs: readonly number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * s.length)))] ?? 0;
};

const ai = sides.filter((s) => !s.managed);
const ours = sides.filter((s) => s.managed);
const allStarters = sides.flatMap((s) => s.starters);

console.log(`\n== 1. out-of-position starters (the engine's own binary test: familiarity < 1) ==`);
console.log(`sides measured ${sides.length}  (${ai.length} AI, ${ours.length} ours) · starters ${allStarters.length}`);
for (const [label, set] of [["all", sides], ["AI", ai], ["ours", ours]] as const) {
  const counts = set.map((s) => s.starters.filter((x) => x.oop).length);
  console.log(`  ${label.padEnd(4)} mean ${mean(counts).toFixed(2)} / 11   median ${quantile(counts, 0.5)}   p90 ${quantile(counts, 0.9)}   max ${Math.max(0, ...counts)}`);
}
const hist = new Array(12).fill(0) as number[];
for (const s of sides) hist[s.starters.filter((x) => x.oop).length]!++;
console.log(`  distribution (OOP starters → sides): ${hist.map((n, i) => (n ? `${i}:${n}` : "")).filter(Boolean).join("  ")}`);

const fits = allStarters.map((x) => x.fit);
const fitBuckets: [string, number][] = [
  ["1.00 (natural)", allStarters.filter((x) => x.fit >= 0.9999).length],
  ["0.95–1.00", allStarters.filter((x) => x.fit >= 0.95 && x.fit < 0.9999).length],
  ["0.90–0.95", allStarters.filter((x) => x.fit >= 0.9 && x.fit < 0.95).length],
  ["0.85–0.90", allStarters.filter((x) => x.fit >= OUT_OF_POSITION_FIT_THRESHOLD && x.fit < 0.9).length],
  ["0.80–0.85", allStarters.filter((x) => x.fit >= 0.8 && x.fit < OUT_OF_POSITION_FIT_THRESHOLD).length],
  ["< 0.80", allStarters.filter((x) => x.fit < 0.8).length],
];
console.log(`  fitAt: mean ${mean(fits).toFixed(3)}  p10 ${quantile(fits, 0.1).toFixed(3)}  min ${Math.min(...fits).toFixed(3)}`);
for (const [label, n] of fitBuckets) console.log(`    ${label.padEnd(15)} ${String(n).padStart(6)}  ${pct(n, allStarters.length)}`);

console.log(`\n== 2. rating points left on the table (solver over the SAME available pool) ==`);
for (const [label, set] of [["all", sides], ["AI", ai], ["ours", ours]] as const) {
  const gapT = set.map((s) => s.solverValue - s.actualValueTemplate);
  const gapF = set.map((s) => s.solverValue - s.actualValueFielded);
  const penGap = set.map((s) => s.actualPenaltyFielded - s.solverPenalty);
  console.log(
    `  ${label.padEnd(4)} Σ(ovr−penalty) gap  mean ${mean(gapT).toFixed(2)}  median ${quantile(gapT, 0.5).toFixed(2)}` +
      `  p90 ${quantile(gapT, 0.9).toFixed(2)}  max ${Math.max(...gapT).toFixed(1)}   [at fielded pos: mean ${mean(gapF).toFixed(2)}]`,
  );
  console.log(
    `       Σpenalty  actual ${mean(set.map((s) => s.actualPenaltyFielded)).toFixed(2)}` +
      `  solver ${mean(set.map((s) => s.solverPenalty)).toFixed(2)}  → +${mean(penGap).toFixed(2)} pts of positional cost per side`,
  );
  console.log(
    `       Σrating   actual ${mean(set.map((s) => s.actualValueFielded + s.actualPenaltyFielded)).toFixed(1)}` +
      `  solver ${mean(set.map((s) => s.solverValue + s.solverPenalty)).toFixed(1)}` +
      `  → ${(mean(set.map((s) => s.solverValue + s.solverPenalty)) - mean(set.map((s) => s.actualValueFielded + s.actualPenaltyFielded))).toFixed(2)} pts of quality per side`,
  );
}
const zero = sides.filter((s) => s.solverValue - s.actualValueTemplate < 0.01).length;
console.log(`  sides where the actual XI already equals the solver's: ${zero} (${pct(zero, sides.length)})`);
console.log(`  per season:`);
for (let s = 0; s < seasons; s++) {
  const set = sides.filter((x) => x.season === s);
  if (set.length === 0) continue;
  console.log(
    `    s${s}  sides ${String(set.length).padStart(5)}  OOP/XI ${mean(set.map((x) => x.starters.filter((y) => y.oop).length)).toFixed(2)}` +
      `  gap mean ${mean(set.map((x) => x.solverValue - x.actualValueTemplate)).toFixed(2)}` +
      `  Σpenalty actual ${mean(set.map((x) => x.actualPenaltyFielded)).toFixed(2)} / solver ${mean(set.map((x) => x.solverPenalty)).toFixed(2)}` +
      `  replacements/side ${mean(set.map((x) => x.replacements)).toFixed(2)}`,
  );
}

console.log(`\n== 2b. the structural floor: what NO selector could avoid ==`);
console.log(`  The solver's own Σpenalty is the floor — the shape simply asks for a job nobody in the squad`);
console.log(`  holds. Anything above it is the selector's doing. Formation → sides, solver floor, actual:`);
const byFormation = new Map<Formation, Side[]>();
for (const s of sides) byFormation.set(s.formation, [...(byFormation.get(s.formation) ?? []), s]);
for (const [f, set] of [...byFormation.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(
    `    ${f.padEnd(14)} ${String(set.length).padStart(5)} sides   floor ${mean(set.map((s) => s.solverPenalty)).toFixed(2).padStart(6)}` +
      `   actual ${mean(set.map((s) => s.actualPenaltyFielded)).toFixed(2).padStart(6)}`,
  );
}
const inDataset = new Set([...byId.values()].map((p) => p.position as Position));
const unstaffed = Object.values(Formation)
  .map((f) => ({ f, missing: getFormationTemplate(f).filter((s) => !inDataset.has(s.position)).length }))
  .filter((e) => e.missing > 0);
console.log(`  positions the dataset has NO player for: ${Object.values(Position).filter((p) => !inDataset.has(p)).join(", ") || "none"}`);
console.log(`  formations that therefore cannot be staffed exactly: ${unstaffed.map((e) => `${e.f} (${e.missing} slots)`).join(", ") || "none"}`);

console.log(`\n== 3. how often it happens at all ==`);
const anyOop = sides.filter((s) => s.starters.some((x) => x.oop)).length;
const anyLowFit = sides.filter((s) => s.starters.some((x) => x.fit < OUT_OF_POSITION_FIT_THRESHOLD)).length;
const anyGap = sides.filter((s) => s.solverValue - s.actualValueTemplate >= 1).length;
console.log(`  sides with ≥1 out-of-position starter        ${anyOop} / ${sides.length}  ${pct(anyOop, sides.length)}`);
console.log(`  sides with ≥1 starter at fitAt < ${OUT_OF_POSITION_FIT_THRESHOLD}        ${anyLowFit} / ${sides.length}  ${pct(anyLowFit, sides.length)}`);
console.log(`  sides ≥1 rating point behind the solver      ${anyGap} / ${sides.length}  ${pct(anyGap, sides.length)}`);
const fixturesTouched = new Set(sides.map((s) => `${s.season}:${s.day}:${s.clubId}`)).size;
const playedTotal = playedPerSeason.reduce((a, b) => a + b, 0);
console.log(`  (unit is a SIDE = one club in one fixture; ${fixturesTouched} distinct club-fixtures)`);
console.log(`  coverage: ${sides.length} sides measured vs ${2 * playedTotal} sides actually played — ${sides.length === 2 * playedTotal ? "every fixture covered" : `${2 * playedTotal - sides.length} MISSED`}`);

console.log(`\n== 4. the absurd cases ==`);
const gkOutfield = allStarters.filter((x) => x.natural === Position.Goalkeeper && x.fielded !== Position.Goalkeeper);
const outfieldInGoal = allStarters.filter((x) => x.natural !== Position.Goalkeeper && x.fielded === Position.Goalkeeper);
const twoLines = allStarters.filter((x) => x.lineDist >= 2);
console.log(`  goalkeeper fielded outfield      ${gkOutfield.length}  (${pct(gkOutfield.length, allStarters.length)} of starters)`);
console.log(`  outfielder in goal               ${outfieldInGoal.length}  (${pct(outfieldInGoal.length, allStarters.length)})`);
console.log(`  ≥2 LINES from his own            ${twoLines.length}  (${pct(twoLines.length, allStarters.length)})  · 1 line ${allStarters.filter((x) => x.lineDist === 1).length}`);
console.log(`  sides containing at least one of the three: ${
  sides.filter((s) => s.starters.some((x) => x.lineDist >= 2 || (x.natural === Position.Goalkeeper) !== (x.fielded === Position.Goalkeeper))).length
} (${pct(sides.filter((s) => s.starters.some((x) => x.lineDist >= 2 || (x.natural === Position.Goalkeeper) !== (x.fielded === Position.Goalkeeper))).length, sides.length)})`);

const worst = [...sides.flatMap((s) => s.starters.map((x) => ({ s, x })))]
  .filter((e) => e.x.lineDist >= 2 || (e.x.natural === Position.Goalkeeper) !== (e.x.fielded === Position.Goalkeeper))
  .sort((a, b) => b.x.drop - a.x.drop)
  .slice(0, exampleCount);
console.log(`\n  worst ${worst.length} by rating drop:`);
for (const { s, x } of worst) {
  console.log(
    `    s${s.season} d${String(s.day).padStart(3)}  ${c.clubShort(s.clubId).padEnd(14)} ${c.playerName(x.id).slice(0, 22).padEnd(22)}` +
      ` ${x.natural.padEnd(20)} → ${x.fielded.padEnd(20)} slot ${String(x.slot).padStart(2)} of ${s.formation.padEnd(13)}` +
      ` drop ${x.drop.toFixed(1).padStart(5)}  fit ${x.fit.toFixed(2)}  ${x.cause}`,
  );
}
const commonest = new Map<string, number>();
for (const x of allStarters) if (x.oop) commonest.set(`${x.natural} → ${x.fielded}`, (commonest.get(`${x.natural} → ${x.fielded}`) ?? 0) + 1);
console.log(`\n  commonest mismatches:`);
for (const [k, n] of [...commonest.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`    ${k.padEnd(46)} ${String(n).padStart(6)}  ${pct(n, allStarters.length)}`);

console.log(`\n== 5. split by cause ==`);
const oopStarters = allStarters.filter((x) => x.oop);
for (const cause of ["stored", "replacement", "slotFielded"] as const) {
  const set = oopStarters.filter((x) => x.cause === cause);
  const absurd = set.filter((x) => x.lineDist >= 2 || (x.natural === Position.Goalkeeper) !== (x.fielded === Position.Goalkeeper)).length;
  console.log(
    `  ${cause.padEnd(12)} ${String(set.length).padStart(6)} OOP starters  ${pct(set.length, oopStarters.length)} of all OOP` +
      `   mean drop ${mean(set.map((x) => x.drop)).toFixed(2)}   absurd ${absurd}`,
  );
}
const repl = allStarters.filter((x) => x.cause === "replacement");
console.log(`  replacements total ${repl.length} (${pct(repl.length, allStarters.length)} of starters); of those ${repl.filter((x) => x.oop).length} are out of position (${pct(repl.filter((x) => x.oop).length, repl.length)})`);
const storedAll = allStarters.filter((x) => x.cause === "stored");
console.log(`  stored starters    ${storedAll.length}; of those ${storedAll.filter((x) => x.oop).length} out of position (${pct(storedAll.filter((x) => x.oop).length, storedAll.length)})`);
console.log(`  sides per replacement count: ${(() => {
  const h = new Map<number, number>();
  for (const s of sides) h.set(s.replacements, (h.get(s.replacements) ?? 0) + 1);
  return [...h.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join("  ");
})()}`);

/*
 * Two defects a statistic over a headless career cannot reach, so they are provoked directly.
 *
 * Neither writes production code: both set up a career state the game itself produces (a chosen
 * position, an injury) and then ask `buildTeams` what it does with it.
 */
console.log(`\n== 5b. probe: does a replacement INHERIT the departed man's chosen position? ==`);
{
  const p = Career.create(league, { leagueId: "BRA1", managedClubId: mine, seed, world });
  const club = p.snapshot().clubs[mine]!;
  const tactic = club.tacticSlots[0]!;
  const template = getFormationTemplate(tactic.formation);
  // A slot the manager re-labels: pick an outfield slot and ask for a different position there.
  const slot = template.findIndex((s, i) => i > 0 && s.position !== Position.Striker);
  const incumbent = tactic.lineup[slot]!;
  p.setSlotFielded(slot, Position.Striker);
  // …then the incumbent picks up an injury, which is the ONLY way a career makes anyone unavailable.
  p.snapshot().playerDev[incumbent]!.injury = { type: "match", outUntil: { season: 5, dayOfSeason: 0 } };
  let stop = p.advanceDay();
  let guard = 0;
  while (stop.blocked !== "userMatch" && guard++ < 60) stop = p.advanceDay();
  const fx = (() => {
    for (const comp of p.snapshot().competitions) {
      const played = new Set(comp.playedFixtureIndexes);
      const f = comp.fixtures.find((x) => x.day === stop.day && !played.has(x.fixtureIndex) && (x.homeTeamId === mine || x.awayTeamId === mine));
      if (f) return f;
    }
    return undefined;
  })();
  if (fx) {
    const teams = p.buildTeams(fx);
    const team = fx.homeTeamId === mine ? teams.home : teams.away;
    const now = team.startingXi[slot]!;
    const at = team.tactics.positionFor(now.id);
    console.log(`  slot ${slot} of ${tactic.formation}: template wants ${template[slot]!.position}, manager asked for ${Position.Striker}`);
    console.log(`  incumbent ${p.playerName(incumbent)} (${byId.get(incumbent)!.position}) injured out`);
    console.log(`  replacement ${p.playerName(now.id)} (${byId.get(now.id)!.position}) is fielded at ${at}` +
      ` → inherited: ${at === Position.Striker ? "YES — he was never asked" : "no"}   fit ${(p.fitAt(now.id, at!) ?? 1).toFixed(2)}`);
  }
}

console.log(`\n== 5c. probe: can the keeper guard actually be dropped? (TeamBuilder.ts:62) ==`);
{
  const p = Career.create(league, { leagueId: "BRA1", managedClubId: mine, seed, world });
  const squad = p.snapshot().clubs[mine]!.squad.playerIds;
  const outfield = squad.filter((id) => byId.get(id)!.position !== Position.Goalkeeper);
  const keepers = squad.filter((id) => byId.get(id)!.position === Position.Goalkeeper);
  // Injure outfielders until there are fewer than the ten outfield slots, but keep the squad at ≥11
  // available so the fixture is not simply awarded. Exactly the state a bad injury run produces.
  const keep = Math.max(0, 11 - keepers.length);
  for (const id of outfield.slice(keep)) p.snapshot().playerDev[id]!.injury = { type: "match", outUntil: { season: 5, dayOfSeason: 0 } };
  let stop = p.advanceDay();
  let guard = 0;
  while (stop.blocked !== "userMatch" && guard++ < 60) stop = p.advanceDay();
  const fx = (() => {
    for (const comp of p.snapshot().competitions) {
      const played = new Set(comp.playedFixtureIndexes);
      const f = comp.fixtures.find((x) => x.day === stop.day && !played.has(x.fixtureIndex) && (x.homeTeamId === mine || x.awayTeamId === mine));
      if (f) return f;
    }
    return undefined;
  })();
  if (fx) {
    const teams = p.buildTeams(fx);
    const team = fx.homeTeamId === mine ? teams.home : teams.away;
    const misfielded = team.startingXi.filter((x) => byId.get(x.id)!.position === Position.Goalkeeper && team.tactics.positionFor(x.id) !== Position.Goalkeeper);
    console.log(`  ${keepers.length} keepers, ${keep} fit outfielders, ${team.startingXi.length} fielded`);
    console.log(`  goalkeepers fielded outfield: ${misfielded.length}${misfielded.length ? ` → ${misfielded.map((x) => `${p.playerName(x.id)} at ${team.tactics.positionFor(x.id)} (fit ${(p.fitAt(x.id, team.tactics.positionFor(x.id)!) ?? 1).toFixed(2)})`).join(", ")}` : ""}`);
    console.log(`  so the case is REACHABLE: ${misfielded.length > 0}. It needs the fit outfielders to fall below ten,`);
    console.log(`  which ${gkOutfield.length === 0 ? "never happened" : `happened ${gkOutfield.length} times`} in ${seasons} unforced season(s).`);
  }
}

console.log(`\n== 6. the frozen-tactic effect (stored XI vs best XI over the WHOLE squad) ==`);
console.log(`  season   AI drift mean    AI max   AI OOP/XI   AI outranked-but-benched   ours drift   ours OOP/XI`);
for (const d of drifts) {
  console.log(
    `  ${String(d.season).padStart(6)}   ${d.aiMean.toFixed(2).padStart(13)}   ${d.aiMax.toFixed(1).padStart(6)}` +
      `   ${d.aiOop.toFixed(2).padStart(9)}   ${d.aiShutOut.toFixed(2).padStart(24)}` +
      `   ${(d.mineDrift?.toFixed(2) ?? "n/a").padStart(10)}   ${(d.mineOop?.toFixed(2) ?? "n/a").padStart(11)}`,
  );
}
console.log(`  n/a = the club can no longer name an eleven from its own squad (squad attrition, not selection).`);
console.log(`  (season 0 is career creation — it MUST be 0.00, since the stored XI is the solver's own output.`);
console.log(`   A non-zero there would mean this harness's cost function has drifted from the production one.)`);

console.log(`\n== 7. is it only an AI problem? ==`);
for (const [label, set] of [["AI", ai], ["ours", ours]] as const) {
  const counts = set.map((s) => s.starters.filter((x) => x.oop).length);
  const gap = set.map((s) => s.solverValue - s.actualValueTemplate);
  console.log(`  ${label.padEnd(4)} sides ${String(set.length).padStart(5)}  OOP/XI ${mean(counts).toFixed(2)}  ≥1 OOP ${pct(set.filter((s) => s.starters.some((x) => x.oop)).length, set.length)}  gap mean ${mean(gap).toFixed(2)}  replacements/side ${mean(set.map((s) => s.replacements)).toFixed(2)}`);
}
console.log(`  per season, AI vs ours:`);
for (let s = 0; s < seasons; s++) {
  const a = ai.filter((x) => x.season === s);
  const o = ours.filter((x) => x.season === s);
  if (a.length === 0 && o.length === 0) continue;
  const cell = (set: readonly Side[]) =>
    set.length === 0
      ? "     — (no side fielded)"
      : `${String(set.length).padStart(4)} sides  OOP/XI ${mean(set.map((x) => x.starters.filter((y) => y.oop).length)).toFixed(2)}  gap ${mean(set.map((x) => x.solverValue - x.actualValueTemplate)).toFixed(2).padStart(6)}`;
  console.log(`    s${s}  AI  ${cell(a)}   |   ours ${cell(o)}`);
}

console.log(`\n== baseline the fix must not break ==`);
console.log(`  forfeits per season: ${forfeitsPerSeason.join(", ")}   voids: ${voidsPerSeason.join(", ")}`);
/*
 * The forfeit column is a CONFOUND, not a footnote.
 *
 * A forfeit means a club could not name eleven available players, which is squad attrition — free
 * agents have no signing path back in and the manager is not floored at all (see `career:depth`).
 * Once that bites, the pool `buildMatchTeam` selects from is a remnant, and the out-of-position
 * numbers above stop being a statement about the selector. Read the per-season rows, and treat any
 * season with forfeits as contaminated.
 */
const short = Object.entries(c.snapshot().clubs).filter(([, club]) => club.squad.playerIds.length < 16).length;
console.log(`  clubs below 16 registered players at the end: ${short} / ${Object.keys(c.snapshot().clubs).length}`);
console.log(`  → seasons with forfeits are squad-attrition contaminated; the clean window is ${forfeitsPerSeason.findIndex((n) => n > 0) < 0 ? "all of them" : `s0–s${forfeitsPerSeason.findIndex((n) => n > 0) - 1}`}`);
console.log(`  suspensions: NOT measurable — nothing in the repo ever writes \`dev.suspension\`, so`);
console.log(`  availability today is injury only. That axis opens up when discipline is wired.`);
function finalTables(): void {
  for (const comp of c.snapshot().competitions) {
    const table = c.table(comp.id);
    if (table.length === 0) continue;
    const pts = table.map((r) => r.points);
    console.log(
      `  final ${comp.id.padEnd(11)} champion ${c.clubShort(table[0]!.teamId).padEnd(14)} ${table[0]!.points} pts` +
        `  |  last ${c.clubShort(table[table.length - 1]!.teamId).padEnd(14)} ${table[table.length - 1]!.points} pts` +
        `  |  spread ${Math.max(...pts) - Math.min(...pts)}  Σgoals ${table.reduce((a, r) => a + r.goalsFor, 0)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Determinism — the claim is that `buildMatchTeam` uses no RNG. Verify it.
// ---------------------------------------------------------------------------

console.log(`\n== determinism ==`);
const runAHash = lineHash;

// (a) Math.random tripwire around a live build.
{
  const d = Career.create(league, { leagueId: "BRA1", managedClubId: mine, seed, world });
  let guard = 0;
  let stop = d.advanceDay();
  while (stop.blocked !== "userMatch" && guard++ < 100) stop = d.advanceDay();
  const fx = (() => {
    for (const comp of d.snapshot().competitions) {
      const played = new Set(comp.playedFixtureIndexes);
      const f = comp.fixtures.find((x) => x.day === stop.day && !played.has(x.fixtureIndex));
      if (f) return f;
    }
    return undefined;
  })();
  if (fx) {
    const real = Math.random;
    let calls = 0;
    Math.random = () => {
      calls++;
      return real();
    };
    const a = d.buildTeams(fx);
    Math.random = real;
    const b = d.buildTeams(fx);
    const same = ["home", "away"].every((k) => {
      const t1 = a[k as "home"];
      const t2 = b[k as "home"];
      return t1.startingXi.map((p) => p.id).join(",") === t2.startingXi.map((p) => p.id).join(",");
    });
    console.log(`  Math.random calls inside buildTeams: ${calls}  (0 = no global RNG)`);
    console.log(`  two builds of the same fixture, same state, identical XI: ${same}`);
  }
}

// (b) A second, independent career on the same seed, over one season, hashed the same way.
{
  const runBSeasons = Math.min(seasons, 1);
  lineHash = "";
  const e = Career.create(league, { leagueId: "BRA1", managedClubId: mine, seed, world });
  for (let season = 0; season < runBSeasons; season++) {
    let guard = 0;
    while (!e.seasonComplete && guard++ < 4_000) {
      const stop = e.advanceDay();
      if (stop.blocked === "seasonEnd") break;
      if (stop.blocked !== "userMatch") continue;
      for (const comp of e.snapshot().competitions) {
        const played = new Set(comp.playedFixtureIndexes);
        for (const f of comp.fixtures) {
          if (f.day !== stop.day || played.has(f.fixtureIndex)) continue;
          const short = [f.homeTeamId, f.awayTeamId].some(
            (id) => (e.snapshot().clubs[id]?.squad.playerIds ?? []).filter((p) => byId.has(p) && isAvailable(e.snapshot().playerDev[p] ?? FALLBACK_DEV)).length < 11,
          );
          if (short) continue;
          const { home, away } = e.buildTeams(f);
          stamp(`${f.homeTeamId}:${home.startingXi.map((p) => `${p.id}@${home.tactics.positionFor(p.id)}`).join(",")}`);
          stamp(`${f.awayTeamId}:${away.startingXi.map((p) => `${p.id}@${away.tactics.positionFor(p.id)}`).join(",")}`);
        }
      }
      e.advance();
    }
  }
  console.log(`  season-1 XI fingerprint, two independent careers on seed ${seed}: ${lineHash === firstSeasonHash ? "IDENTICAL" : `DIFFER (${lineHash} vs ${firstSeasonHash})`}`);
  console.log(`  full-run fingerprint (${seasons} season(s)): ${runAHash}`);
}
