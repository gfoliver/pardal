import { ATTRIBUTE_MAX, ATTRIBUTE_MIN, type GoalkeepingAttributes, type MentalAttributes, type PhysicalAttributes, type TechnicalAttributes } from "@fut/domain";

/**
 * A real rating source as the origin of ATTRIBUTES, mapped onto our own model.
 *
 * The source is Football Manager's attribute set (via FMInside), which matters because the
 * mapping is one-to-one: 19 of our 20 outfield attributes and 3 of our 4 goalkeeping ones have
 * a counterpart that means the same thing, so this file is a rename table, not a set of
 * judgement calls.
 *
 * That is the reason it replaced the previous source. PES gave ~22 usable numbers for our 24
 * attributes and had to ALIAS: one `response` figure drove five of ours, `mentality` drove four,
 * and a single `goalKeeping` number became all four goalkeeping attributes.
 *
 * Be precise about what that cost, because it is less than it sounds. PES blended its aliases
 * with different weights, so the attributes sharing a source figure did not come out identical —
 * measured on player shape, mean pairwise |r| is 0.292 under PES against 0.271 here, which is a
 * marginal difference. The one place aliasing was outright visible: `tackling` and `marking` both
 * came off PES's single defensive number and correlated at 0.96, i.e. one attribute wearing two
 * names. FM publishes them separately and no pair here correlates above 0.90.
 *
 * The measured wins that did decide it: coverage (431 → 545 of 670 players carry real ratings),
 * that split defensive pair, and better football out of the engine. Measured on 375 players
 * holding both sources, the two agree strongly where PES had independent information (tackling
 * 0.86, marking 0.86, technique 0.79, finishing 0.71, pace 0.65) and weakly where it aliased
 * (decisions 0.18, workRate 0.24, composure 0.25).
 *
 * One outright disagreement, not a scale artefact: `aggression` correlates at −0.16, because the
 * two mean different things — PES's is attacking intent, FM's is how readily a player goes in hard
 * and gives away fouls. Our engine reads `aggression` in `foulChance` with FM's meaning, so taking
 * FM's number is the correct one. Expected that to move the foul rate; measured over a full season
 * it did not (8.18 → 8.12 per team per match), because the change is a reshuffle of WHICH players
 * foul rather than a shift in how many do.
 *
 * DERIVING these from match events was tried and does not work, so it is not worth trying again.
 * FBref's free tier has dropped the StatsBomb advanced tables for every competition — verified on a
 * completed Premier League season, which now offers only stats/keepers/shooting/playingtime/misc
 * and no xG columns at all. What is left is counts without denominators: `tackles_won` with no
 * tackles attempted, which is why it correlated with a rated `tackling` at approximately zero. A
 * scouted attribute database is the only viable source for this.
 *
 * There is NO `alignToStatedOverall` step here, unlike the source this replaced. That correction
 * existed to undo the bias of blending several source stats into one attribute; with a direct
 * mapping there is no blend and so no bias to undo. Our position weights over these attributes
 * ARE the player's quality.
 */

/** The source's attribute labels, exactly as published. All on FM's native 1–20. */
export type SourceAttributes = Readonly<Record<string, number>>;

/**
 * Every group is PARTIAL, and that is load-bearing.
 *
 * The source does not publish outfield technicals for a goalkeeper — a keeper's page has no
 * Crossing, Finishing, Tackling or Marking at all, because FM shows him goalkeeping technicals
 * instead. An absent label therefore has to stay absent so the caller keeps its inferred value;
 * filling it with a neutral number would hand every keeper a fabricated `finishing` of 50 and
 * call it sourced data.
 */
export interface MappedAttributes {
  readonly physical: Partial<PhysicalAttributes>;
  readonly mental: Partial<MentalAttributes>;
  readonly technical: Partial<TechnicalAttributes>;
  readonly goalkeeping: Partial<GoalkeepingAttributes>;
}

/**
 * Source label → our attribute. One entry per attribute we model; no label is used twice.
 *
 * The three that need a word:
 *  - `shotPower` ← **Long Shots**. FM does not model striking power separately; how well a
 *    player hits it from distance is the nearest thing it has.
 *  - `positioning` (goalkeeping) ← **Command of Area**. FM gives keepers the same outfield
 *    mental `Positioning`, which our mental `positioning` already takes, so the keeper-specific
 *    one has to be the box-commanding attribute or the two would be the same number.
 *  - `strength` ← **Strength** alone. Jumping Reach is available and deliberately NOT blended
 *    in: our engine reads `strength` for holding the ball up and for physical duels, and a tall
 *    poor-jumping target man is a different player from a springy small one.
 */
const LABEL: Readonly<Record<keyof PhysicalAttributes | keyof MentalAttributes | keyof TechnicalAttributes | `gk_${keyof GoalkeepingAttributes}`, string>> = {
  // physical
  pace: "Pace",
  stamina: "Stamina",
  strength: "Strength",
  agility: "Agility",
  // mental
  decisions: "Decisions",
  composure: "Composure",
  workRate: "Work Rate",
  teamwork: "Teamwork",
  aggression: "Aggression",
  anticipation: "Anticipation",
  positioning: "Positioning",
  vision: "Vision",
  offTheBall: "Off the Ball",
  // technical
  passing: "Passing",
  technique: "Technique",
  dribbling: "Dribbling",
  finishing: "Finishing",
  shotPower: "Long Shots",
  tackling: "Tackling",
  marking: "Marking",
  crossing: "Crossing",
  firstTouch: "First Touch",
  heading: "Heading",
  // goalkeeping
  gk_reflexes: "Reflexes",
  gk_handling: "Handling",
  gk_positioning: "Command of Area",
  gk_oneOnOnes: "One on Ones",
};

/**
 * Where the source's 1–20 sits on our 1–99, as three anchors.
 *
 * The source's scale is GLOBAL — its 20 is the best player in the world, not the best player in
 * whichever league we loaded — and that is the fact the whole mapping turns on. A straight stretch
 * of 1–20 across 1–99 therefore puts a mid-tier league near 54 and reads it as a league of
 * reserves; measured, adopting that cost 12% of the goals (1.03 → 0.91 per team per match against
 * ~1.25 real), because the engine is calibrated for a population centred at 65.
 *
 * Anchoring on a FIXED curve rather than fitting each league's own mean is deliberate, and it is
 * the more important half of the decision: fitting would force every competition to the same
 * centre, so the Brasileirão and the Premier League would come out equally strong and a move
 * between them would mean nothing. A global source scale needs a global map.
 *
 * Why it bends. One straight line cannot serve both ends at once — measured on the real data, the
 * slope that puts this league's best striker at 82 also puts its one former-world-best at 96, and
 * the slope that holds him to 83 drops that striker to 76. Two slopes do: generous through the
 * body of the distribution where almost every player lives, shallow above `leagueStar` where the
 * handful of outliers are, so a domestic league reaches the low 80s and the top of the scale stays
 * unspent.
 */
export const SCALE_ANCHORS = {
  /** A dependable top-flight squad player — and the population the engine is calibrated on. */
  squadPlayer: { source: 11, ours: 65 },
  /** As good as a mid-tier league gets. Above here the curve flattens. */
  leagueStar: { source: 15, ours: 85 },
  /** The best in the world. Short of 99 on purpose, so the scale never saturates. */
  worldBest: { source: 20, ours: 95 },
} as const;

/**
 * What the source's own 1–20 means FOR ONE ATTRIBUTE, measured over the 1044 matched rows.
 *
 * The scale is not used the same way twice. Agility averages 12.44 and Finishing 9.58 — 2.9 points
 * apart, which the shared curve below turns into 14.5 of ours. That is not a claim that footballers are
 * worse finishers than they are agile; the two numbers are incommensurable, because each is a separate
 * scale FM's researchers apply separately. Every professional is agile enough to be professional, and
 * few are elite finishers, so the same raw 12 means different things.
 *
 * Left alone, one curve over all of them decides the balance between POSITIONS, which is how the defect
 * showed up: the striker weights finishing 3 + shotPower 1 + heading 2, six of his fifteen units on
 * attributes sitting 4 to 7 of our points low, while the attacking midfielder weights vision,
 * technique, passing, dribbling and first touch, all at or above the general level. Measured, the
 * #5 attacking midfielder rated 4 points above the #5 of every other position and it survived to #20.
 * No weight set can fix that, because the weights were never wrong — `weightAudit.ts` puts the whole
 * spread between the nine lenses at 5.5 points on an average player and 1.2 at the 99th percentile.
 *
 * Two centres, and that is deliberate. A goalkeeping label is measured over 115 keepers and an outfield
 * one over 929 outfielders; forcing both onto one centre would silently decide how good keepers are
 * against outfielders, a different question with no evidence here. Each group is centred within itself,
 * so the keeper population keeps the level the engine was calibrated against.
 *
 * MEASURED OVER BRAZILIAN CLUBS ONLY, which is the honest limit of this table. It is fixed rather than
 * fitted per build — refitting per league is the trap `SCALE_ANCHORS` already documents, where a weak
 * league's finishers get stretched until they look elite. A weaker league is weaker at everything, so
 * the RELATIVE offsets between attributes largely survive; the absolute level does not, and this table
 * does not claim to be FM's global distribution. Regenerate it if a league outside Brazil is scraped,
 * and expect the offsets to move a little.
 *
 * Each mean excludes the players the label does not really measure — a keeper's Finishing and an
 * outfielder's Reflexes are "not applicable" written as a number, the same phenomenon `apply.ts`
 * documents. A first pass that averaged every row gave the goalkeeping labels a mean of 3.3 over 1044
 * players, which is not a fact about goalkeeping.
 *
 * ONE RULE, NO EXCEPTIONS, and the table was re-fitted because it had one. `Dribbling` had been averaged
 * over everybody at 10.35 while the outfielders it describes sit at 11.25 — keepers, who barely dribble,
 * were 11% of the pool and pulled it a full FM point down. The consequence was a +3.1 shift where the
 * evidence says −0.7, so every dribbler in the game was carrying four of our points he had not earned,
 * and the positions that weight dribbling most (winger 3 of 13, attacking midfielder 2 of 14) carried it
 * furthest. Found by `weightAudit.ts` reporting this distribution beside the shift it produces, which is
 * the check the first fit did not have.
 *
 * A label a KEEPER's row also carries (his Passing, his Composure) still counts keepers, because FM
 * really does rate those for him and he really is a footballer. The distinction is whether the attribute
 * describes the player at all, not whether he plays outfield.
 */
export const SOURCE_MEAN: Readonly<Record<string, number>> = {
  // outfield — centre 11.10
  "Pace": 12.41,
  "Stamina": 12.05,
  "Strength": 10.47,
  "Agility": 12.44,
  "Decisions": 11.24,
  "Composure": 11.02,
  "Work Rate": 12.22,
  "Teamwork": 11.83,
  "Aggression": 11.32,
  "Anticipation": 11.69,
  "Positioning": 10.23,
  "Vision": 10.99,
  "Off the Ball": 11.50,
  "Passing": 11.72,
  "Technique": 11.97,
  "Dribbling": 11.25,
  "Finishing": 9.58,
  "Long Shots": 9.63,
  "Tackling": 10.23,
  "Marking": 9.81,
  "Crossing": 9.85,
  "First Touch": 11.86,
  "Heading": 10.07,
  // goalkeeping — centre 11.98
  "Reflexes": 13.16,
  "Handling": 12.27,
  "Command of Area": 10.68,
  "One on Ones": 11.83,
};

const OUTFIELD_CENTRE = 11.10;
const GK_CENTRE = 11.98;
/**
 * The four labels that measure GOALKEEPING, and nothing else.
 *
 * Exported because every measurement of this table has to make the same split it does, and each place
 * that re-declared the four was a place the split could drift — `weightAudit.ts` had its own copy while
 * reporting on these very constants.
 */
export const GK_SOURCE_LABELS: ReadonlySet<string> = new Set(["Reflexes", "Handling", "Command of Area", "One on Ones"]);

/**
 * A source value for a NAMED attribute, on our scale.
 *
 * Shifts the attribute onto its group's centre, then applies the shared curve. A shift and not a
 * rescale: `Finishing` has sd 2.64 against `Passing`'s 1.97, and normalising that too would compress
 * finishers and stretch passers — a second, separate claim about the data, which is that every
 * attribute ought to discriminate players equally. There is no measurement here supporting it, and
 * spread between players is plausibly a real property of a skill.
 */
export function sourceToOurs(label: string, v: number): number {
  const mean = SOURCE_MEAN[label];
  if (mean === undefined) return toOurScale(v);
  return toOurScale(v + (GK_SOURCE_LABELS.has(label) ? GK_CENTRE : OUTFIELD_CENTRE) - mean);
}

/** The source's native 1–20 onto our 1–99, through `SCALE_ANCHORS`. Monotonic everywhere. */
export function toOurScale(v: number): number {
  const { squadPlayer: a, leagueStar: b, worldBest: c } = SCALE_ANCHORS;
  const body = (b.ours - a.ours) / (b.source - a.source);
  const tail = (c.ours - b.ours) / (c.source - b.source);
  // Extended below `squadPlayer` on the body slope: a weak attribute should read as weak, and the
  // clamp catches anything the source rates near its own floor.
  const y = v <= b.source ? a.ours + (v - a.source) * body : b.ours + (v - b.source) * tail;
  return Math.max(ATTRIBUTE_MIN, Math.min(ATTRIBUTE_MAX, Math.round(y)));
}

/**
 * Source attributes → ours, on our scale. A label the row does not carry is simply absent from
 * the result; nothing is defaulted. `missing` names those labels so a caller can decide whether
 * the row is usable.
 */
export function toAttributes(src: SourceAttributes): { attributes: MappedAttributes; missing: string[] } {
  const missing: string[] = [];
  const read = (k: keyof typeof LABEL): number | undefined => {
    const raw = src[LABEL[k]];
    if (typeof raw !== "number" || !Number.isFinite(raw)) {
      missing.push(LABEL[k]);
      return undefined;
    }
    return sourceToOurs(LABEL[k], raw);
  };
  /** Drop the undefined entries so `Partial` means "absent", not "present and undefined". */
  const group = <K extends string>(entries: readonly (readonly [K, keyof typeof LABEL])[]): Partial<Record<K, number>> => {
    const out: Partial<Record<K, number>> = {};
    for (const [ours, theirs] of entries) {
      const v = read(theirs);
      if (v !== undefined) out[ours] = v;
    }
    return out;
  };
  return {
    missing,
    attributes: {
      physical: group([["pace", "pace"], ["stamina", "stamina"], ["strength", "strength"], ["agility", "agility"]]) as Partial<PhysicalAttributes>,
      mental: group([
        ["decisions", "decisions"], ["composure", "composure"], ["workRate", "workRate"], ["teamwork", "teamwork"],
        ["aggression", "aggression"], ["anticipation", "anticipation"], ["positioning", "positioning"], ["vision", "vision"],
        ["offTheBall", "offTheBall"],
      ]) as Partial<MentalAttributes>,
      technical: group([
        ["passing", "passing"], ["technique", "technique"], ["dribbling", "dribbling"], ["finishing", "finishing"],
        ["shotPower", "shotPower"], ["tackling", "tackling"], ["marking", "marking"], ["crossing", "crossing"],
        ["firstTouch", "firstTouch"], ["heading", "heading"],
      ]) as Partial<TechnicalAttributes>,
      goalkeeping: group([
        ["reflexes", "gk_reflexes"], ["handling", "gk_handling"],
        ["positioning", "gk_positioning"], ["oneOnOnes", "gk_oneOnOnes"],
      ]) as Partial<GoalkeepingAttributes>,
    },
  };
}

/**
 * The labels a usable row must carry, by whether the player keeps goal.
 *
 * They differ because the source's pages differ: an outfielder has no Reflexes or Command of
 * Area, and a keeper has no Crossing, Finishing, Tackling or Marking. Demanding the outfield set
 * from everyone rejected all 65 goalkeepers in the league on the first run.
 */
export const REQUIRED_LABELS = {
  outfield: Object.entries(LABEL).filter(([k]) => !k.startsWith("gk_")).map(([, l]) => l) as readonly string[],
  goalkeeper: Object.entries(LABEL)
    .filter(([k]) => k.startsWith("gk_") || ["pace", "stamina", "strength", "agility", "decisions", "composure", "workRate", "teamwork", "aggression", "anticipation", "positioning", "vision", "passing", "technique", "firstTouch"].includes(k))
    .map(([, l]) => l) as readonly string[],
} as const;

/** Every attribute of a mapped player, flat — for distribution measurement. */
export function attributeValues(a: MappedAttributes, includeGk: boolean): number[] {
  const out = [...Object.values(a.physical), ...Object.values(a.mental), ...Object.values(a.technical)];
  if (includeGk) out.push(...Object.values(a.goalkeeping));
  return out.filter((v): v is number => typeof v === "number");
}
