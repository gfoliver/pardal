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
  // technical
  passing: "Passing",
  technique: "Technique",
  dribbling: "Dribbling",
  finishing: "Finishing",
  shotPower: "Long Shots",
  tackling: "Tackling",
  marking: "Marking",
  crossing: "Crossing",
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
    return toOurScale(raw);
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
      ]) as Partial<MentalAttributes>,
      technical: group([
        ["passing", "passing"], ["technique", "technique"], ["dribbling", "dribbling"], ["finishing", "finishing"],
        ["shotPower", "shotPower"], ["tackling", "tackling"], ["marking", "marking"], ["crossing", "crossing"],
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
    .filter(([k]) => k.startsWith("gk_") || ["pace", "stamina", "strength", "agility", "decisions", "composure", "workRate", "teamwork", "aggression", "anticipation", "positioning", "vision", "passing", "technique"].includes(k))
    .map(([, l]) => l) as readonly string[],
} as const;

/** Every attribute of a mapped player, flat — for distribution measurement. */
export function attributeValues(a: MappedAttributes, includeGk: boolean): number[] {
  const out = [...Object.values(a.physical), ...Object.values(a.mental), ...Object.values(a.technical)];
  if (includeGk) out.push(...Object.values(a.goalkeeping));
  return out.filter((v): v is number => typeof v === "number");
}
