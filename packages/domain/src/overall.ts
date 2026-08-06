import { type GoalkeepingAttributes } from "./attributes.js";
import { type Player } from "./Player.js";
import { Position } from "./types.js";

/**
 * Position-specific overall rating. Each position weights attributes by what it
 * actually needs (finishing matters more for a striker, marking for a centre
 * back, reflexes for a keeper). Returns a value on the 1–99 attribute scale.
 */
export function positionOverall(player: Player, position: Position): number {
  const flat = flatten(player);
  const weights = WEIGHTS[position];
  let sum = 0;
  let total = 0;
  for (const key of Object.keys(weights) as AttrName[]) {
    const weight = weights[key]!;
    sum += (flat[key] ?? 1) * weight;
    total += weight;
  }
  return total > 0 ? sum / total : 0;
}

/** Flattens a player's attributes into one keyed record (gk attrs prefixed). */
function flatten(player: Player): Record<AttrName, number> {
  const gk = (player as { goalkeeping?: GoalkeepingAttributes }).goalkeeping;
  return {
    pace: player.physical.pace,
    stamina: player.physical.stamina,
    strength: player.physical.strength,
    agility: player.physical.agility,
    decisions: player.mental.decisions,
    composure: player.mental.composure,
    workRate: player.mental.workRate,
    teamwork: player.mental.teamwork,
    aggression: player.mental.aggression,
    anticipation: player.mental.anticipation,
    positioning: player.mental.positioning,
    vision: player.mental.vision,
    offTheBall: player.mental.offTheBall,
    passing: player.technical.passing,
    technique: player.technical.technique,
    dribbling: player.technical.dribbling,
    finishing: player.technical.finishing,
    shotPower: player.technical.shotPower,
    tackling: player.technical.tackling,
    marking: player.technical.marking,
    crossing: player.technical.crossing,
    firstTouch: player.technical.firstTouch,
    heading: player.technical.heading,
    reflexes: gk?.reflexes ?? 1,
    handling: gk?.handling ?? 1,
    gkPositioning: gk?.positioning ?? 1,
    oneOnOnes: gk?.oneOnOnes ?? 1,
  };
}

export type AttrName =
  | "pace" | "stamina" | "strength" | "agility"
  | "decisions" | "composure" | "workRate" | "teamwork" | "aggression"
  | "anticipation" | "positioning" | "vision" | "offTheBall"
  | "passing" | "technique" | "dribbling" | "finishing" | "shotPower"
  | "tackling" | "marking" | "crossing" | "firstTouch" | "heading"
  | "reflexes" | "handling" | "gkPositioning" | "oneOnOnes";

/**
 * Per-position attribute weights used by `positionOverall`. Exported so the dataset pipeline can SHAPE
 * attributes to a target overall for a position.
 *
 * ## What the measurements said, and what they did not
 *
 * This was rewritten to answer one observation: the best attacking midfielder in the forty-club
 * Brazilian dataset rated 89.1 and the best striker 80.3. The obvious reading is that the weight sets
 * are unbalanced. `weightAudit.ts` says otherwise, and the number that settles it is the NEUTRAL
 * OVERALL — every position's weights applied to a single hypothetical player holding the population
 * mean of every attribute, so the players are held constant and any spread is the lens alone. That
 * spread was 5.0 points across nine positions, and attackingMidfielder sat FIFTH at 64.7, below
 * centralMidfielder, wingBack, winger and goalkeeper. Striker was 62.9. So the lens explained 1.8
 * points of an 8.8-point gap.
 *
 * The cross-position table explained the rest: the top attacking midfielder rates 89.1 there and 81.5
 * as a striker — which would itself be the best striker rating in the league — while the top striker
 * rates 80.3 as a striker and 81.7 as an attacking midfielder. The gap is which footballers this
 * league has, not how they are measured, and closing it with weights would have been falsifying the
 * data. It is still open after this change, on purpose.
 *
 * Two defects the audit did find, and these are what changed:
 *
 *  1. **Strikers and centre-backs were described in part.** The three attributes modelled in the
 *     previous commit carried no weight, and they are not spread evenly across positions: measured
 *     against each position's own players, `offTheBall` pulls the striker +8.1 and `heading` pulls the
 *     centre-back +5.5 and the striker +3.9, while both are 9 to 14 points NEGATIVE for midfielders
 *     and wingers. Getting into the space and winning the ball in the air are the two things this
 *     league's forwards are most exceptional at, and neither was being counted.
 *  2. **The defensive midfielder was a centre-back with less of it.** Six of its eight keys were also
 *     centre-back keys and they carried 12 of its 14 weight, so the lens could not tell the two apart:
 *     ELEVEN of the top twenty centre-backs rated higher as defensive midfielders than at their own
 *     position. A holding midfielder is distinguished by having to play football, so `passing` rises
 *     and `firstTouch` joins, while `marking` falls — he screens a space, he does not mark a man.
 *
 * ## The rule when adding an attribute to a set
 *
 * Adding a term without removing one dilutes the position's DEFINING attribute, because the weight
 * total is the denominator: adding four points of weight to the striker would have dropped finishing
 * from 23% of his rating to 16% and made a great finisher less distinguishable, which is the opposite
 * of the goal. So where a term went in, an overlapping one came down — `technique` gives ground to
 * `firstTouch` (both are control of the ball), the striker's `shotPower` falls because it maps from
 * FM's Long Shots and a striker scores from close range, and the centre-back's `tackling` falls
 * because his defending is now measured in two dimensions rather than doubling up on the ground one.
 * `weights.test.ts` holds the rule to a floor of a fifth, and caught this file breaking it on the
 * first attempt.
 *
 * The goalkeeper is untouched. FM rates his First Touch and it is a real number for him — see the note
 * in the ratings mapping — but what a keeper is worth is keeping goal, and there is no measurement
 * saying otherwise.
 *
 * ## The central midfielder, asked and answered — do not "fix" this set
 *
 * Once the source was calibrated per attribute, the central midfielder's top 20 fell to 76.0, last of the
 * eight labels anybody in the dataset holds, and only 2 of those 20 read best as central midfielders. It
 * looks exactly like a weight set that under-describes its position. It is not.
 *
 * `weightAudit.ts`'s LENS SWAP rates every position's own top 20 through every position's weights, and
 * every single set is its own players' best — the central midfielder's by 0.1 of a point over the
 * attacking midfielder's, so no other lens would lift these players at all. What the two pools differ in
 * is the players: the attacking midfielders are 4 to 8 points better at passing, vision, technique and
 * first touch, and the central midfielders are better at stamina, work rate and tackling, which is each
 * set measuring what it says it measures. In this league "Central Midfield" collects the runners and
 * "Attacking Midfield" the creators, and moving weight from the first set to the second would not be
 * balancing the lens — it would be overwriting a fact about Brazilian squads.
 *
 * One label, `wingBack`, is held by NOBODY in the dataset: Transfermarkt does not use it. That set is only
 * ever exercised as a tactical role, so its numbers should be read as a role's demands, not a population.
 */
export const WEIGHTS: Record<Position, Partial<Record<AttrName, number>>> = {
  [Position.Goalkeeper]: {
    reflexes: 3, handling: 2, gkPositioning: 2, oneOnOnes: 2, composure: 1, positioning: 1,
  },
  [Position.CentreBack]: {
    marking: 3, tackling: 2, heading: 2, strength: 2, positioning: 2, anticipation: 2, decisions: 1, pace: 1,
  },
  [Position.FullBack]: {
    pace: 2, tackling: 2, marking: 2, stamina: 2, crossing: 1, positioning: 1, workRate: 1, offTheBall: 1,
  },
  [Position.WingBack]: {
    pace: 2, crossing: 2, stamina: 2, dribbling: 1, tackling: 1, workRate: 1, technique: 1, offTheBall: 1,
  },
  [Position.DefensiveMidfielder]: {
    tackling: 3, positioning: 2, anticipation: 2, stamina: 2, passing: 2, marking: 1, strength: 1, decisions: 1, firstTouch: 1,
  },
  [Position.CentralMidfielder]: {
    passing: 3, vision: 2, decisions: 2, stamina: 2, technique: 2, workRate: 1, tackling: 1, firstTouch: 1,
  },
  [Position.AttackingMidfielder]: {
    vision: 3, technique: 2, passing: 2, dribbling: 2, firstTouch: 1, offTheBall: 1, finishing: 1, composure: 1, decisions: 1,
  },
  [Position.Winger]: {
    pace: 3, dribbling: 3, crossing: 2, technique: 1, firstTouch: 1, offTheBall: 1, agility: 1, finishing: 1,
  },
  [Position.Striker]: {
    finishing: 3, offTheBall: 2, composure: 2, pace: 2, heading: 2, shotPower: 1, anticipation: 1, strength: 1, dribbling: 1,
  },
};
