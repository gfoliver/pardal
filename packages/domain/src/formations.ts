import { Formation } from "./Tactics.js";
import { Position } from "./types.js";

/**
 * A base slot in a formation: the position and its home cell on the pitch, in
 * NORMALISED coordinates (grid-resolution-agnostic):
 *   depth: 0 = own goal line … 1 = opponent's goal line
 *   width: 0 = own left touchline … 1 = own right touchline
 * The engine maps these to its grid. Slots are chosen so every player occupies a
 * DISTINCT cell — the base shape spreads across the whole pitch. (Custom tactics
 * will later let users move players between cells, one player per cell.)
 */
export interface FormationSlot {
  readonly position: Position;
  readonly depth: number;
  readonly width: number;
}

const P = Position;

const TEMPLATES: Record<Formation, readonly FormationSlot[]> = {
  [Formation.F442]: [
    { position: P.Goalkeeper, depth: 0.0, width: 0.5 },
    { position: P.FullBack, depth: 0.22, width: 0.08 },
    { position: P.CentreBack, depth: 0.22, width: 0.35 },
    { position: P.CentreBack, depth: 0.22, width: 0.65 },
    { position: P.FullBack, depth: 0.22, width: 0.92 },
    { position: P.Winger, depth: 0.68, width: 0.08 },
    { position: P.CentralMidfielder, depth: 0.45, width: 0.35 },
    { position: P.CentralMidfielder, depth: 0.45, width: 0.65 },
    { position: P.Winger, depth: 0.68, width: 0.92 },
    { position: P.Striker, depth: 0.85, width: 0.35 },
    { position: P.Striker, depth: 0.85, width: 0.65 },
  ],
  [Formation.F442Diamond]: [
    { position: P.Goalkeeper, depth: 0.0, width: 0.5 },
    { position: P.FullBack, depth: 0.24, width: 0.08 },
    { position: P.CentreBack, depth: 0.22, width: 0.35 },
    { position: P.CentreBack, depth: 0.22, width: 0.65 },
    { position: P.FullBack, depth: 0.24, width: 0.92 },
    { position: P.DefensiveMidfielder, depth: 0.38, width: 0.5 },
    { position: P.CentralMidfielder, depth: 0.52, width: 0.32 },
    { position: P.CentralMidfielder, depth: 0.52, width: 0.68 },
    { position: P.AttackingMidfielder, depth: 0.68, width: 0.5 },
    { position: P.Striker, depth: 0.85, width: 0.35 },
    { position: P.Striker, depth: 0.85, width: 0.65 },
  ],
  [Formation.F433]: [
    { position: P.Goalkeeper, depth: 0.0, width: 0.5 },
    { position: P.FullBack, depth: 0.24, width: 0.08 },
    { position: P.CentreBack, depth: 0.22, width: 0.35 },
    { position: P.CentreBack, depth: 0.22, width: 0.65 },
    { position: P.FullBack, depth: 0.24, width: 0.92 },
    { position: P.DefensiveMidfielder, depth: 0.42, width: 0.5 },
    { position: P.CentralMidfielder, depth: 0.55, width: 0.3 },
    { position: P.CentralMidfielder, depth: 0.55, width: 0.7 },
    { position: P.Winger, depth: 0.78, width: 0.1 },
    { position: P.Striker, depth: 0.88, width: 0.5 },
    { position: P.Winger, depth: 0.78, width: 0.9 },
  ],
  [Formation.F4231]: [
    { position: P.Goalkeeper, depth: 0.0, width: 0.5 },
    { position: P.FullBack, depth: 0.24, width: 0.08 },
    { position: P.CentreBack, depth: 0.22, width: 0.35 },
    { position: P.CentreBack, depth: 0.22, width: 0.65 },
    { position: P.FullBack, depth: 0.24, width: 0.92 },
    { position: P.DefensiveMidfielder, depth: 0.4, width: 0.35 },
    { position: P.DefensiveMidfielder, depth: 0.4, width: 0.65 },
    { position: P.Winger, depth: 0.72, width: 0.1 },
    { position: P.AttackingMidfielder, depth: 0.68, width: 0.5 },
    { position: P.Winger, depth: 0.72, width: 0.9 },
    { position: P.Striker, depth: 0.88, width: 0.5 },
  ],
  [Formation.F424]: [
    { position: P.Goalkeeper, depth: 0.0, width: 0.5 },
    { position: P.FullBack, depth: 0.24, width: 0.08 },
    { position: P.CentreBack, depth: 0.22, width: 0.35 },
    { position: P.CentreBack, depth: 0.22, width: 0.65 },
    { position: P.FullBack, depth: 0.24, width: 0.92 },
    { position: P.CentralMidfielder, depth: 0.48, width: 0.35 },
    { position: P.CentralMidfielder, depth: 0.48, width: 0.65 },
    { position: P.Winger, depth: 0.78, width: 0.08 },
    { position: P.Striker, depth: 0.86, width: 0.35 },
    { position: P.Striker, depth: 0.86, width: 0.65 },
    { position: P.Winger, depth: 0.78, width: 0.92 },
  ],
  [Formation.F352]: [
    { position: P.Goalkeeper, depth: 0.0, width: 0.5 },
    { position: P.CentreBack, depth: 0.22, width: 0.3 },
    { position: P.CentreBack, depth: 0.22, width: 0.5 },
    { position: P.CentreBack, depth: 0.22, width: 0.7 },
    { position: P.WingBack, depth: 0.5, width: 0.05 },
    { position: P.CentralMidfielder, depth: 0.52, width: 0.3 },
    { position: P.CentralMidfielder, depth: 0.55, width: 0.5 },
    { position: P.CentralMidfielder, depth: 0.52, width: 0.7 },
    { position: P.WingBack, depth: 0.5, width: 0.95 },
    { position: P.Striker, depth: 0.85, width: 0.35 },
    { position: P.Striker, depth: 0.85, width: 0.65 },
  ],
  [Formation.F532]: [
    { position: P.Goalkeeper, depth: 0.0, width: 0.5 },
    { position: P.WingBack, depth: 0.38, width: 0.05 },
    { position: P.CentreBack, depth: 0.22, width: 0.3 },
    { position: P.CentreBack, depth: 0.22, width: 0.5 },
    { position: P.CentreBack, depth: 0.22, width: 0.7 },
    { position: P.WingBack, depth: 0.38, width: 0.95 },
    { position: P.DefensiveMidfielder, depth: 0.48, width: 0.5 },
    { position: P.CentralMidfielder, depth: 0.58, width: 0.35 },
    { position: P.CentralMidfielder, depth: 0.58, width: 0.65 },
    { position: P.Striker, depth: 0.84, width: 0.35 },
    { position: P.Striker, depth: 0.84, width: 0.65 },
  ],
  [Formation.F343]: [
    { position: P.Goalkeeper, depth: 0.0, width: 0.5 },
    { position: P.CentreBack, depth: 0.22, width: 0.3 },
    { position: P.CentreBack, depth: 0.22, width: 0.5 },
    { position: P.CentreBack, depth: 0.22, width: 0.7 },
    { position: P.WingBack, depth: 0.44, width: 0.05 },
    { position: P.CentralMidfielder, depth: 0.52, width: 0.35 },
    { position: P.CentralMidfielder, depth: 0.52, width: 0.65 },
    { position: P.WingBack, depth: 0.44, width: 0.95 },
    { position: P.Winger, depth: 0.8, width: 0.1 },
    { position: P.Striker, depth: 0.86, width: 0.5 },
    { position: P.Winger, depth: 0.8, width: 0.9 },
  ],
  [Formation.F541]: [
    { position: P.Goalkeeper, depth: 0.0, width: 0.5 },
    { position: P.WingBack, depth: 0.32, width: 0.05 },
    { position: P.CentreBack, depth: 0.22, width: 0.3 },
    { position: P.CentreBack, depth: 0.22, width: 0.5 },
    { position: P.CentreBack, depth: 0.22, width: 0.7 },
    { position: P.WingBack, depth: 0.32, width: 0.95 },
    { position: P.Winger, depth: 0.62, width: 0.1 },
    { position: P.CentralMidfielder, depth: 0.5, width: 0.35 },
    { position: P.CentralMidfielder, depth: 0.5, width: 0.65 },
    { position: P.Winger, depth: 0.62, width: 0.9 },
    { position: P.Striker, depth: 0.84, width: 0.5 },
  ],
};

export function getFormationTemplate(formation: Formation): readonly FormationSlot[] {
  return TEMPLATES[formation];
}
