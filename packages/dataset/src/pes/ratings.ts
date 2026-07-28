import type { GoalkeepingAttributes, MentalAttributes, PhysicalAttributes, TechnicalAttributes } from "@fut/domain";

/**
 * PES-style ratings as a source of ATTRIBUTES, mapped onto our own model.
 *
 * We keep the source's SCALE — it judges quality better than the market-value
 * inference it replaces — and map its ~30 individual stats rather than lifting
 * its single `overall`, because the detail is where the differentiation lives
 * (measured: defence spans 20–90, attack 30–83, while the summary rating spans
 * only 62–85). Our own position weights then decide WHERE a player is good, and
 * `alignToStatedOverall` gives the source the last word on HOW good he is.
 *
 * Consequence worth knowing: the resulting overalls have a standard deviation of
 * ~3.7 against the ~7.2 of the ratings they replace, so the match engine has to
 * be more sensitive to a rating gap or the league flattens out.
 */

/** The subset of a PES row we actually read. All 1–99 on the source's scale. */
export interface PesRatings {
  readonly attack?: number;
  readonly defense?: number;
  readonly balance?: number;
  readonly stamina?: number;
  readonly topSpeed?: number;
  readonly acceleration?: number;
  readonly response?: number;
  readonly agility?: number;
  readonly dribbleAccuracy?: number;
  readonly dribbleSpeed?: number;
  readonly shortPassAccuracy?: number;
  readonly shortPassSpeed?: number;
  readonly longPassAccuracy?: number;
  readonly longPassSpeed?: number;
  readonly shotAccuracy?: number;
  readonly shotPower?: number;
  readonly shotTechnique?: number;
  readonly freeKickAccuracy?: number;
  readonly swerve?: number;
  readonly heading?: number;
  readonly jump?: number;
  readonly technique?: number;
  readonly aggression?: number;
  readonly mentality?: number;
  readonly goalKeeping?: number;
  readonly teamWork?: number;
  /** The source's own summary rating — kept for traceability, never used as-is. */
  readonly overall?: number;
}

export interface MappedAttributes {
  readonly physical: PhysicalAttributes;
  readonly mental: MentalAttributes;
  readonly technical: TechnicalAttributes;
  readonly goalkeeping: GoalkeepingAttributes;
}

/** Weighted blend of source stats; ignores the ones the row is missing. */
function blend(parts: readonly (readonly [number | undefined, number])[], fallback: number): number {
  let sum = 0;
  let weight = 0;
  for (const [v, w] of parts) {
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    sum += v * w;
    weight += w;
  }
  return weight > 0 ? sum / weight : fallback;
}

/**
 * PES stats → our attributes, still on the SOURCE's scale.
 *
 * Every blend below is a judgement about what the two models mean by a word, and
 * the notes say which. Rescaling happens afterwards (`calibration`), separately,
 * so the mapping stays a statement about meaning and not about numbers.
 */
export function toAttributes(p: PesRatings, fallback = 60): MappedAttributes {
  const b = (parts: readonly (readonly [number | undefined, number])[]) => Math.round(blend(parts, fallback));
  return {
    physical: {
      // Sprint speed and how fast he reaches it are one attribute for us.
      pace: b([[p.topSpeed, 1], [p.acceleration, 1]]),
      stamina: b([[p.stamina, 1]]),
      // PES "balance" is body strength holding off a challenge; jumping is part
      // of how physical a player is for us.
      strength: b([[p.balance, 0.7], [p.jump, 0.3]]),
      agility: b([[p.agility, 1]]),
    },
    mental: {
      // "Response" is reactions, "mentality" is composure under pressure — a
      // decision is both seeing it and being calm enough to take it.
      decisions: b([[p.mentality, 0.6], [p.response, 0.4]]),
      composure: b([[p.mentality, 1]]),
      // Nothing in PES is work rate, so it is built from what it looks like:
      // engine plus willingness to get stuck in.
      workRate: b([[p.stamina, 0.6], [p.aggression, 0.4]]),
      teamwork: b([[p.teamWork, 1]]),
      aggression: b([[p.aggression, 1]]),
      anticipation: b([[p.response, 1]]),
      // Off-ball positioning: reading the game (response) plus the discipline to
      // be where the side needs you (teamWork).
      positioning: b([[p.response, 0.5], [p.teamWork, 0.5]]),
      // Seeing the pass before playing it shows up in PES as long-passing range.
      vision: b([[p.longPassAccuracy, 0.7], [p.mentality, 0.3]]),
    },
    technical: {
      passing: b([[p.shortPassAccuracy, 0.6], [p.longPassAccuracy, 0.4]]),
      technique: b([[p.technique, 1]]),
      dribbling: b([[p.dribbleAccuracy, 0.65], [p.dribbleSpeed, 0.35]]),
      // Finishing is placement and the technique to strike it, not raw power.
      finishing: b([[p.shotAccuracy, 0.6], [p.shotTechnique, 0.4]]),
      shotPower: b([[p.shotPower, 1]]),
      // PES has ONE defensive number, so tackling and marking both come from it.
      // Splitting them with invented noise would fake information we don't have;
      // instead aggression tilts it towards the tackle and reading the game
      // towards the mark, which is a real difference between the two skills.
      tackling: b([[p.defense, 0.8], [p.aggression, 0.2]]),
      marking: b([[p.defense, 0.8], [p.response, 0.2]]),
      // Whipping a ball in is swerve plus the range to reach the far post.
      crossing: b([[p.swerve, 0.4], [p.longPassAccuracy, 0.4], [p.freeKickAccuracy, 0.2]]),
    },
    goalkeeping: {
      reflexes: b([[p.goalKeeping, 1]]),
      handling: b([[p.goalKeeping, 0.8], [p.technique, 0.2]]),
      positioning: b([[p.goalKeeping, 0.7], [p.response, 0.3]]),
      oneOnOnes: b([[p.goalKeeping, 0.7], [p.mentality, 0.3]]),
    },
  };
}

/** Every attribute of a mapped player, flat — for distribution measurement. */
export function attributeValues(a: MappedAttributes, includeGk: boolean): number[] {
  const out = [...Object.values(a.physical), ...Object.values(a.mental), ...Object.values(a.technical)];
  if (includeGk) out.push(...Object.values(a.goalkeeping));
  return out;
}

const bump = (v: number, by: number): number => Math.max(1, Math.min(99, Math.round(v + by)));

/**
 * Make our own overall agree with the source's.
 *
 * The blends above are opinions about which stats mean "pace" or "marking", and
 * opinions carry bias: measured across 464 players, running them through our
 * position weights reproduced the source's best players almost exactly (their 85
 * came out 84) but lifted the weakest by around seven points (their 62 came out
 * 69). That compresses the league — precisely backwards, since the whole reason
 * to import this source is that it judges quality better than our market-value
 * inference did.
 *
 * So the source gets the final word on HOW GOOD a player is, and our weights keep
 * the final word on WHERE he is good. `positionOverall` is a weighted mean, so
 * adding the same delta to every attribute moves the overall by exactly that
 * delta — one pass, no iteration, and the player's internal shape (quick, can't
 * pass) is untouched because every attribute moves together.
 */
export function alignToStatedOverall(
  a: MappedAttributes,
  statedOverall: number | undefined,
  computedOverall: number,
): MappedAttributes {
  if (!statedOverall || !Number.isFinite(computedOverall)) return a;
  const delta = statedOverall - computedOverall;
  if (Math.abs(delta) < 0.5) return a;
  const d = (v: number) => bump(v, delta);
  return {
    physical: {
      pace: d(a.physical.pace),
      stamina: d(a.physical.stamina),
      strength: d(a.physical.strength),
      agility: d(a.physical.agility),
    },
    mental: {
      decisions: d(a.mental.decisions),
      composure: d(a.mental.composure),
      workRate: d(a.mental.workRate),
      teamwork: d(a.mental.teamwork),
      aggression: d(a.mental.aggression),
      anticipation: d(a.mental.anticipation),
      positioning: d(a.mental.positioning),
      vision: d(a.mental.vision),
    },
    technical: {
      passing: d(a.technical.passing),
      technique: d(a.technical.technique),
      dribbling: d(a.technical.dribbling),
      finishing: d(a.technical.finishing),
      shotPower: d(a.technical.shotPower),
      tackling: d(a.technical.tackling),
      marking: d(a.technical.marking),
      crossing: d(a.technical.crossing),
    },
    goalkeeping: {
      reflexes: d(a.goalkeeping.reflexes),
      handling: d(a.goalkeeping.handling),
      positioning: d(a.goalkeeping.positioning),
      oneOnOnes: d(a.goalkeeping.oneOnOnes),
    },
  };
}
