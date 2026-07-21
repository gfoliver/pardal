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
    passing: player.technical.passing,
    technique: player.technical.technique,
    dribbling: player.technical.dribbling,
    finishing: player.technical.finishing,
    shotPower: player.technical.shotPower,
    tackling: player.technical.tackling,
    marking: player.technical.marking,
    crossing: player.technical.crossing,
    reflexes: gk?.reflexes ?? 1,
    handling: gk?.handling ?? 1,
    gkPositioning: gk?.positioning ?? 1,
    oneOnOnes: gk?.oneOnOnes ?? 1,
  };
}

type AttrName =
  | "pace" | "stamina" | "strength" | "agility"
  | "decisions" | "composure" | "workRate" | "teamwork" | "aggression"
  | "anticipation" | "positioning" | "vision"
  | "passing" | "technique" | "dribbling" | "finishing" | "shotPower"
  | "tackling" | "marking" | "crossing"
  | "reflexes" | "handling" | "gkPositioning" | "oneOnOnes";

const WEIGHTS: Record<Position, Partial<Record<AttrName, number>>> = {
  [Position.Goalkeeper]: {
    reflexes: 3, handling: 2, gkPositioning: 2, oneOnOnes: 2, composure: 1, positioning: 1,
  },
  [Position.CentreBack]: {
    marking: 3, tackling: 3, strength: 2, positioning: 2, anticipation: 2, decisions: 1, pace: 1, composure: 1,
  },
  [Position.FullBack]: {
    pace: 2, tackling: 2, marking: 2, stamina: 2, crossing: 1, positioning: 1, workRate: 1,
  },
  [Position.WingBack]: {
    pace: 2, crossing: 2, stamina: 2, dribbling: 1, tackling: 1, workRate: 1, technique: 1,
  },
  [Position.DefensiveMidfielder]: {
    tackling: 3, marking: 2, positioning: 2, anticipation: 2, stamina: 2, passing: 1, strength: 1, decisions: 1,
  },
  [Position.CentralMidfielder]: {
    passing: 3, vision: 2, decisions: 2, stamina: 2, technique: 2, workRate: 1, tackling: 1,
  },
  [Position.AttackingMidfielder]: {
    vision: 3, technique: 3, passing: 2, dribbling: 2, finishing: 1, composure: 1, decisions: 1,
  },
  [Position.Winger]: {
    pace: 3, dribbling: 3, crossing: 2, technique: 2, agility: 1, finishing: 1,
  },
  [Position.Striker]: {
    finishing: 3, composure: 2, shotPower: 2, pace: 2, dribbling: 1, technique: 1, anticipation: 1, strength: 1,
  },
};
