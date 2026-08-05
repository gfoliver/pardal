import { clampAttribute, type Player, Position, positionOverall } from "@fut/domain";
import { loadPlayer, type PlayerData } from "@fut/competition";
import type { AttrName, PlayerDev } from "../development/PlayerDev.js";

/** Apply a career PlayerDev's attribute deltas onto base data (clamped 1–99). */
function withDeltas(base: PlayerData, deltas: Partial<Record<AttrName, number>>): PlayerData {
  const d = (k: AttrName): number => deltas[k] ?? 0;
  const phys = base.physical;
  const men = base.mental;
  const tec = base.technical;
  const gk = base.goalkeeping;
  const c = clampAttribute;
  return {
    ...base,
    physical: {
      pace: c(phys.pace + d("pace")),
      stamina: c(phys.stamina + d("stamina")),
      strength: c(phys.strength + d("strength")),
      agility: c(phys.agility + d("agility")),
    },
    mental: {
      decisions: c(men.decisions + d("decisions")),
      composure: c(men.composure + d("composure")),
      workRate: c(men.workRate + d("workRate")),
      teamwork: c(men.teamwork + d("teamwork")),
      aggression: c(men.aggression + d("aggression")),
      anticipation: c(men.anticipation + d("anticipation")),
      positioning: c(men.positioning + d("positioning")),
      vision: c(men.vision + d("vision")),
      offTheBall: c(men.offTheBall + d("offTheBall")),
    },
    technical: {
      passing: c(tec.passing + d("passing")),
      technique: c(tec.technique + d("technique")),
      dribbling: c(tec.dribbling + d("dribbling")),
      finishing: c(tec.finishing + d("finishing")),
      shotPower: c(tec.shotPower + d("shotPower")),
      tackling: c(tec.tackling + d("tackling")),
      marking: c(tec.marking + d("marking")),
      crossing: c(tec.crossing + d("crossing")),
      firstTouch: c(tec.firstTouch + d("firstTouch")),
      heading: c(tec.heading + d("heading")),
    },
    goalkeeping: gk
      ? {
          reflexes: c(gk.reflexes + d("reflexes")),
          handling: c(gk.handling + d("handling")),
          positioning: c(gk.positioning + d("gkPositioning")),
          oneOnOnes: c(gk.oneOnOnes + d("oneOnOnes")),
        }
      : undefined,
  };
}

/**
 * Build a match-ready domain Player from base data + optional dev deltas.
 *
 * `shirtNumber` overrides whatever the dataset registered — the manager may have
 * renumbered his squad, and that decision has to reach the pitch.
 */
export function buildPlayer(base: PlayerData, dev?: PlayerDev, shirtNumber?: number): Player {
  const withDev = dev ? withDeltas(base, dev.attributeDeltas) : base;
  return loadPlayer(shirtNumber === undefined ? withDev : { ...withDev, shirtNumber });
}

/** Effective overall at the player's own position, with dev applied. */
export function effectiveOverall(base: PlayerData, dev?: PlayerDev): number {
  const p = buildPlayer(base, dev);
  return positionOverall(p, p.position);
}

export const isGkData = (p: PlayerData): boolean => p.position === Position.Goalkeeper;
