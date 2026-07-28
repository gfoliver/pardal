import { readFileSync } from "node:fs";
import { type Position, positionOverall } from "@fut/domain";
import { loadPlayer } from "@fut/competition";
import {
  alignToStatedOverall,
  attributeValues,
  distributionOf,
  toAttributes,
  type MappedAttributes,
  type PesRatings,
} from "@fut/dataset";

/**
 * Does our rating of a PES player agree with PES's own?
 *
 * The mapping from their ~30 stats to our attributes is a set of judgements about
 * what words mean, and judgements carry bias. This measures that bias before and
 * after the alignment step, so "respect the source" is a number rather than an
 * intention.
 *
 * Run: npx tsx packages/app-cli/src/pesCalibrate.ts <pes.json> <league.json>
 */
const rows = JSON.parse(readFileSync(process.argv[2]!, "utf8")) as Record<string, unknown>[];
const league = JSON.parse(readFileSync(process.argv[3]!, "utf8")) as {
  teams: { players: Record<string, Record<string, number>>[] }[];
};

const n = (v: unknown) => (typeof v === "number" ? v : undefined);
const toRatings = (r: Record<string, unknown>): PesRatings => ({
  attack: n(r.attack), defense: n(r.defense), balance: n(r.balance), stamina: n(r.stamina),
  topSpeed: n(r.top_speed), acceleration: n(r.acceleration), response: n(r.response), agility: n(r.agility),
  dribbleAccuracy: n(r.dribble_accuracy), dribbleSpeed: n(r.dribble_speed),
  shortPassAccuracy: n(r.short_pass_accuracy), shortPassSpeed: n(r.short_pass_speed),
  longPassAccuracy: n(r.long_pass_accuracy), longPassSpeed: n(r.long_pass_speed),
  shotAccuracy: n(r.shot_accuracy), shotPower: n(r.shot_power), shotTechnique: n(r.shot_technique),
  freeKickAccuracy: n(r.free_kick_accuracy), swerve: n(r.swerve), heading: n(r.heading), jump: n(r.jump),
  technique: n(r.technique), aggression: n(r.aggression), mentality: n(r.mentality),
  goalKeeping: n(r.goal_keeping), teamWork: n(r.team_work), overall: n(r.overall),
});

/** PES position codes → our domain positions. */
const POS: Record<string, string> = {
  GK: "goalkeeper", CB: "centreBack", CWP: "centreBack",
  LB: "fullBack", RB: "fullBack", LWB: "wingBack", RWB: "wingBack",
  DMF: "defensiveMidfielder", CMF: "centralMidfielder",
  LMF: "winger", RMF: "winger", AMF: "attackingMidfielder",
  LWF: "winger", RWF: "winger", SS: "striker", CF: "striker",
};

const flat = (o: unknown) => ({ ...(o as Record<string, number>) });

/** Rate one row: the raw mapping, then the same row with the source's overall respected. */
function rate(r: Record<string, unknown>) {
  const pos = POS[String(r.position ?? "CMF").toUpperCase()] ?? "centralMidfielder";
  const build = (a: MappedAttributes) =>
    loadPlayer({
      id: String(r.id), name: String(r.name), age: 26, nationality: "Brazil", position: pos,
      physical: flat(a.physical), mental: flat(a.mental), technical: flat(a.technical),
      ...(pos === "goalkeeper" ? { goalkeeping: flat(a.goalkeeping) } : {}),
    } as never);

  const raw = toAttributes(toRatings(r));
  const before = positionOverall(build(raw), pos as Position);
  const aligned = alignToStatedOverall(raw, n(r.overall), before);
  return { pos, before, after: positionOverall(build(aligned), pos as Position), stated: n(r.overall) ?? 0 };
}

// What the game currently ships, for reference.
const ourAttrs: number[] = [];
for (const t of league.teams) {
  for (const p of t.players) for (const g of ["physical", "mental", "technical"]) for (const k in p[g]!) ourAttrs.push(p[g]![k]!);
}
const mappedAttrs: number[] = [];
for (const r of rows) mappedAttrs.push(...attributeValues(toAttributes(toRatings(r)), String(r.position).toUpperCase() === "GK"));

const fmt = (d: { mean: number; sd: number }) => `mean ${d.mean.toFixed(1)}  sd ${d.sd.toFixed(2)}`;
console.log(`our current attributes  ${fmt(distributionOf(ourAttrs))}   (n=${ourAttrs.length})`);
console.log(`PES mapped attributes   ${fmt(distributionOf(mappedAttrs))}   (n=${mappedAttrs.length})`);

const errBefore: number[] = [];
const errAfter: number[] = [];
const finals: number[] = [];
for (const r of rows) {
  const x = rate(r);
  if (!x.stated) continue;
  errBefore.push(x.before - x.stated);
  errAfter.push(x.after - x.stated);
  finals.push(x.after);
}
console.log(`\nour overall MINUS the source's:`);
console.log(`  raw mapping   ${fmt(distributionOf(errBefore))}`);
console.log(`  aligned       ${fmt(distributionOf(errAfter))}`);
console.log(`\nshipped overall spread  ${fmt(distributionOf(finals))}`);

const shown = [...rows].sort((a, b) => (n(b.overall) ?? 0) - (n(a.overall) ?? 0));
console.log("\nsample players (stated -> raw -> aligned):");
for (const r of [...shown.slice(0, 6), ...shown.slice(-5)]) {
  const x = rate(r);
  console.log(
    `  ${String(r.name).padEnd(24)} ${String(x.stated).padStart(2)} -> ${x.before.toFixed(0).padStart(2)} -> ${x.after.toFixed(0).padStart(2)}   (${x.pos})`,
  );
}
