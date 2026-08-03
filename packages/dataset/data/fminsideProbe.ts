import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { AttrName } from "@fut/domain";
import { toAttributes, type PesRatings } from "../src/pes/ratings.js";
import type { RawSnapshot } from "../src/raw/RawSnapshot.js";

/**
 * Validate the FMInside → our-attributes mapping before scraping a whole league.
 *
 * The point of doing this on one squad first: if the mapping is wrong, 670 player pages of
 * scraping are wasted. So take Internacional, join to the players we already hold PES ratings
 * for, and check that FMInside's attribute agrees with PES's on the SAME attribute.
 *
 * This is a different question from the FBref probe (`attributeProbe.ts`, which returned a
 * clear no). There we asked "can match statistics PREDICT an attribute". Here both sides claim
 * to measure the same thing directly, so a strong correlation is the expected result and a weak
 * one means the mapping — not the source — is broken.
 *
 * FMInside publishes FM's native 1-20 in the cell's class (`value_12`) and the 0-99
 * normalisation as the text. We read the class: it is the unrounded figure.
 *
 * Run: npx tsx packages/dataset/data/fminsideProbe.ts
 */

const HERE = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const raw: RawSnapshot = JSON.parse(readFileSync(HERE("./brasileirao-serie-a/raw.json"), "utf8"));
const pes: { players: Record<string, { status: string; ratings?: PesRatings }> } = JSON.parse(
  readFileSync(HERE("./brasileirao-serie-a/pes.json"), "utf8"),
);
const fmi: { uid: string; name: string; attrs: Record<string, number> }[] = JSON.parse(
  readFileSync(HERE("./brasileirao-serie-a/probe/fminside-internacional.json"), "utf8"),
);

/**
 * FMInside label → our attribute name.
 *
 * 19 of our 20 outfield attributes have a direct counterpart. The exception is `shotPower`,
 * which FM does not model separately — Long Shots is the nearest thing and is what we use.
 * Our `positioning` is a defensive-awareness attribute, so it maps to FM's Positioning;
 * `anticipation` to Anticipation; both exist, so no aliasing is needed. Contrast that with the
 * PES mapping, which drives five of our attributes off one `response` figure.
 */
const MAP: Record<string, AttrName> = {
  // physical
  Pace: "pace", Stamina: "stamina", Strength: "strength", Agility: "agility",
  // mental
  Decisions: "decisions", Composure: "composure", "Work Rate": "workRate", Teamwork: "teamwork",
  Aggression: "aggression", Anticipation: "anticipation", Positioning: "positioning", Vision: "vision",
  // technical
  Passing: "passing", Technique: "technique", Dribbling: "dribbling", Finishing: "finishing",
  "Long Shots": "shotPower", Tackling: "tackling", Marking: "marking", Crossing: "crossing",
  // goalkeeping
  Reflexes: "reflexes", Handling: "handling", "One on Ones": "oneOnOnes",
};

/** FM's 1-20 onto our 1-99, the same linear stretch FMInside itself displays. */
const to99 = (v: number) => Math.round(((v - 1) / 19) * 98 + 1);

const key = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();

const fmiByName = new Map(fmi.map((p) => [key(p.name), p]));

interface Pair { readonly name: string; readonly fmi: Partial<Record<AttrName, number>>; readonly pes: Partial<Record<AttrName, number>>; }
const pairs: Pair[] = [];
for (const p of raw.players) {
  const hit = fmiByName.get(key(p.name));
  const rec = pes.players[p.id];
  if (!hit || !rec || rec.status !== "matched" || !rec.ratings) continue;
  const mapped = toAttributes(rec.ratings);
  const pesFlat = {
    ...(mapped.physical as Record<string, number>), ...(mapped.mental as Record<string, number>),
    ...(mapped.technical as Record<string, number>), ...(mapped.goalkeeping as Record<string, number>),
  } as Partial<Record<AttrName, number>>;
  const fmiFlat: Partial<Record<AttrName, number>> = {};
  for (const [label, attr] of Object.entries(MAP)) {
    const v = hit.attrs[label];
    if (v !== undefined) fmiFlat[attr] = to99(v);
  }
  pairs.push({ name: p.name, fmi: fmiFlat, pes: pesFlat });
}

function pearson(xs: readonly number[], ys: readonly number[]): number {
  const n = xs.length;
  if (n < 6) return NaN;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i]! - mx, dy = ys[i]! - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return sxx === 0 || syy === 0 ? NaN : sxy / Math.sqrt(sxx * syy);
}
const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: readonly number[]) => Math.sqrt(mean(xs.map((x) => (x - mean(xs)) ** 2)));

console.log(`\nFMInside squad: ${fmi.length}   joined to our players with PES: ${pairs.length}\n`);
console.log("attribute       n     r      bias   sd(FMI)  sd(PES)");
const OUTFIELD: AttrName[] = [
  "pace", "stamina", "strength", "agility",
  "decisions", "composure", "workRate", "teamwork", "aggression", "anticipation", "positioning", "vision",
  "passing", "technique", "dribbling", "finishing", "shotPower", "tackling", "marking", "crossing",
];
const rs: number[] = [];
for (const attr of OUTFIELD) {
  const usable = pairs.filter((p) => p.fmi[attr] !== undefined && p.pes[attr] !== undefined);
  const a = usable.map((p) => p.fmi[attr]!), b = usable.map((p) => p.pes[attr]!);
  if (a.length < 6) { console.log(`${attr.padEnd(14)} ${String(a.length).padStart(3)}   too few`); continue; }
  const r = pearson(a, b);
  rs.push(r);
  console.log(
    `${attr.padEnd(14)} ${String(a.length).padStart(3)}  ${r.toFixed(3).padStart(6)}  ${(mean(a) - mean(b)).toFixed(1).padStart(6)}  ${sd(a).toFixed(2).padStart(7)}  ${sd(b).toFixed(2).padStart(7)}`,
  );
}
console.log(`\nmean r across ${rs.length} attributes: ${mean(rs).toFixed(3)}`);
console.log(`attributes with r >= 0.5: ${rs.filter((r) => r >= 0.5).length}/${rs.length}`);

// The spread question. PES compresses everyone toward the middle; if FMInside does not, that
// alone is a reason to prefer it — a league of near-identical players is the complaint.
const allFmi = pairs.flatMap((p) => OUTFIELD.map((a) => p.fmi[a]).filter((v): v is number => v !== undefined));
const allPes = pairs.flatMap((p) => OUTFIELD.map((a) => p.pes[a]).filter((v): v is number => v !== undefined));
console.log(`\nattribute spread over the whole squad — FMInside sd ${sd(allFmi).toFixed(2)}, PES sd ${sd(allPes).toFixed(2)}`);
console.log(`range — FMInside ${Math.min(...allFmi)}..${Math.max(...allFmi)}, PES ${Math.min(...allPes)}..${Math.max(...allPes)}`);

/*
 * Whose fault is the weak agreement?
 *
 * Reading the table by eye, r seems to follow how much PES itself VARIES on that attribute:
 * marking (PES sd 10.3) agrees at 0.75, shotPower (PES sd 3.5) at 0.07. If that holds, the
 * ceiling on agreement is PES's own compression, not FMInside's quality — you cannot correlate
 * against a column that is nearly constant. The pipeline already suspects this of PES: see the
 * note at pes/ratings.ts:14 recording that its overall sd is ~3.7 against ~7.2 for what it
 * replaced, and the aliasing that drives five of our attributes off one `response` figure.
 *
 * So: correlate r against sd(PES). A strong positive relationship means PES is the limiting
 * factor and the disagreement is not evidence against FMInside.
 */
const perAttr = OUTFIELD.map((attr) => {
  const usable = pairs.filter((p) => p.fmi[attr] !== undefined && p.pes[attr] !== undefined);
  if (usable.length < 6) return null;
  const a = usable.map((p) => p.fmi[attr]!), b = usable.map((p) => p.pes[attr]!);
  return { attr, r: pearson(a, b), sdPes: sd(b), sdFmi: sd(a) };
}).filter((x): x is NonNullable<typeof x> => x !== null);

console.log(
  `\nr vs sd(PES) across attributes: ${pearson(perAttr.map((x) => x.sdPes), perAttr.map((x) => x.r)).toFixed(3)}` +
    `   (high = PES's own flatness is what caps agreement)`,
);
const wide = perAttr.filter((x) => x.sdPes >= 7);
const flat = perAttr.filter((x) => x.sdPes < 5);
console.log(`  where PES has real spread (sd >= 7, n=${wide.length}): mean r ${mean(wide.map((x) => x.r)).toFixed(3)}  [${wide.map((x) => x.attr).join(", ")}]`);
console.log(`  where PES is nearly flat  (sd < 5,  n=${flat.length}): mean r ${mean(flat.map((x) => x.r)).toFixed(3)}  [${flat.map((x) => x.attr).join(", ")}]`);
