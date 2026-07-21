// Placeholder display data for building the UI. The live engine (@fut/engine)
// will replace this once the workspace-source resolver is wired.

export type PosGroup = "GK" | "DEF" | "MID" | "ATT";

export interface DemoPlayer {
  id: number;
  name: string;
  pos: string; // fielded label (GK, RB, CB, DM, CM, RW, ST…)
  group: PosGroup;
  age: number;
  overall: number;
  role: string; // tactical role display name
  attrs: { pace: number; shooting: number; passing: number; defending: number; physical: number };
}

const p = (
  id: number,
  name: string,
  pos: string,
  group: PosGroup,
  age: number,
  overall: number,
  role: string,
  attrs: DemoPlayer["attrs"],
): DemoPlayer => ({ id, name, pos, group, age, overall, role, attrs });

export const DEMO_SQUAD: DemoPlayer[] = [
  p(1, "Léo Prado", "GK", "GK", 29, 78, "Goalkeeper", { pace: 52, shooting: 22, passing: 64, defending: 30, physical: 74 }),
  p(2, "Rui Barreto", "RB", "DEF", 26, 74, "Wing Back", { pace: 82, shooting: 44, passing: 70, defending: 72, physical: 71 }),
  p(3, "Aldo Nunes", "CB", "DEF", 31, 79, "Ball-Playing Def.", { pace: 61, shooting: 33, passing: 74, defending: 84, physical: 82 }),
  p(4, "Caio Vasques", "CB", "DEF", 24, 76, "Stopper", { pace: 66, shooting: 30, passing: 62, defending: 82, physical: 85 }),
  p(5, "Bruno Sales", "LB", "DEF", 28, 73, "Defensive FB", { pace: 79, shooting: 40, passing: 68, defending: 74, physical: 70 }),
  p(6, "Dario Melo", "DM", "MID", 27, 80, "Deep-Lying Playmaker", { pace: 64, shooting: 58, passing: 86, defending: 76, physical: 78 }),
  p(7, "Ivan Rocha", "CM", "MID", 23, 77, "Box-to-Box", { pace: 78, shooting: 68, passing: 79, defending: 68, physical: 80 }),
  p(8, "Téo Farias", "AM", "MID", 25, 82, "Attacking Mid", { pace: 80, shooting: 79, passing: 85, defending: 46, physical: 66 }),
  p(9, "Marco Vidal", "RW", "ATT", 22, 81, "Inside Forward", { pace: 90, shooting: 80, passing: 74, defending: 38, physical: 68 }),
  p(10, "Hugo Serra", "ST", "ATT", 28, 84, "Poacher", { pace: 84, shooting: 88, passing: 66, defending: 32, physical: 79 }),
  p(11, "Nando Reis", "LW", "ATT", 24, 78, "Winger", { pace: 91, shooting: 70, passing: 76, defending: 40, physical: 64 }),
  // bench
  p(12, "Vitor Paes", "GK", "GK", 24, 71, "Goalkeeper", { pace: 50, shooting: 20, passing: 60, defending: 28, physical: 72 }),
  p(13, "Elias Gomo", "CB", "DEF", 30, 72, "Stopper", { pace: 60, shooting: 28, passing: 60, defending: 78, physical: 83 }),
  p(14, "Pedro Lins", "CM", "MID", 21, 70, "Box-to-Box", { pace: 76, shooting: 60, passing: 72, defending: 62, physical: 71 }),
  p(15, "Zeca Alves", "AM", "MID", 27, 75, "Attacking Mid", { pace: 77, shooting: 74, passing: 80, defending: 44, physical: 63 }),
  p(16, "Tomás Réu", "ST", "ATT", 20, 72, "Infiltrating Fwd", { pace: 88, shooting: 74, passing: 60, defending: 28, physical: 70 }),
];

export interface StandingRow {
  pos: number;
  team: string;
  short: string;
  played: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  pts: number;
  isYou?: boolean;
}

export const DEMO_TABLE: StandingRow[] = [
  { pos: 1, team: "Rio Athletic", short: "RIO", played: 12, w: 9, d: 2, l: 1, gf: 24, ga: 8, pts: 29 },
  { pos: 2, team: "Costa United", short: "CST", played: 12, w: 8, d: 2, l: 2, gf: 21, ga: 11, pts: 26 },
  { pos: 3, team: "Onze FC", short: "ONZ", played: 12, w: 7, d: 3, l: 2, gf: 20, ga: 12, pts: 24, isYou: true },
  { pos: 4, team: "Vale Sporting", short: "VAL", played: 12, w: 6, d: 3, l: 3, gf: 18, ga: 14, pts: 21 },
  { pos: 5, team: "Serra Verde", short: "SRV", played: 12, w: 5, d: 4, l: 3, gf: 15, ga: 13, pts: 19 },
  { pos: 6, team: "Porto Azul", short: "PTA", played: 12, w: 4, d: 4, l: 4, gf: 14, ga: 15, pts: 16 },
];

export const DEMO_FORM = ["W", "W", "D", "L", "W"] as const;

export const DEMO_NEXT = {
  home: "Onze FC",
  homeShort: "ONZ",
  away: "Vale Sporting",
  awayShort: "VAL",
  competition: "League · Round 13",
  venue: "Estádio Central",
};

export const YOU = { name: "Onze FC", short: "ONZ", formation: "4-3-3", mentality: "Balanced" };
