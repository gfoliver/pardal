import {
  DefaultRoleProvider,
  Formation,
  MatchRules,
  Mentality,
  Position,
  positionGroup,
  PositionGroup,
  positionOverall,
  RoleKey,
  SubstitutionRules,
  type Player,
  type Team,
} from "@fut/domain";
import { MatchSimulator, possessionPercent } from "@fut/engine";
import { buildClub } from "./factory";

export type PosGroup = "GK" | "DEF" | "MID" | "ATT";

export interface SquadPlayer {
  id: string;
  name: string;
  pos: string;
  group: PosGroup;
  age: number;
  overall: number;
  role: string;
  attrs: { pace: number; shooting: number; passing: number; defending: number; physical: number };
}

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

const POS_LABEL: Record<Position, string> = {
  [Position.Goalkeeper]: "GK",
  [Position.CentreBack]: "CB",
  [Position.FullBack]: "FB",
  [Position.WingBack]: "WB",
  [Position.DefensiveMidfielder]: "DM",
  [Position.CentralMidfielder]: "CM",
  [Position.AttackingMidfielder]: "AM",
  [Position.Winger]: "WG",
  [Position.Striker]: "ST",
};

const ROLE_LABEL: Partial<Record<RoleKey, string>> = {
  [RoleKey.Goalkeeper]: "Goalkeeper",
  [RoleKey.Stopper]: "Stopper",
  [RoleKey.BallPlayingDefender]: "Ball-Playing Def.",
  [RoleKey.DefensiveFullBack]: "Defensive FB",
  [RoleKey.WingBack]: "Wing Back",
  [RoleKey.BallWinningMidfielder]: "Ball-Winning Mid",
  [RoleKey.DeepLyingPlaymaker]: "Deep-Lying Playmaker",
  [RoleKey.BoxToBox]: "Box-to-Box",
  [RoleKey.AttackingMidfielder]: "Attacking Mid",
  [RoleKey.Winger]: "Winger",
  [RoleKey.InsideForward]: "Inside Forward",
  [RoleKey.WideMidfielder]: "Wide Midfielder",
  [RoleKey.TargetMan]: "Target Man",
  [RoleKey.Poacher]: "Poacher",
  [RoleKey.FalseNine]: "False Nine",
  [RoleKey.InfiltratingForward]: "Infiltrating Fwd",
};

function toGroup(pos: Position): PosGroup {
  const g = positionGroup(pos);
  return g === PositionGroup.Goalkeeper ? "GK" : g === PositionGroup.Defence ? "DEF" : g === PositionGroup.Midfield ? "MID" : "ATT";
}

const roleFallback = new DefaultRoleProvider();

function displayAttrs(p: Player): SquadPlayer["attrs"] {
  const r = (n: number) => Math.round(n);
  return {
    pace: r(p.physical.pace),
    shooting: r((p.technical.finishing * 2 + p.technical.shotPower) / 3),
    passing: r((p.technical.passing + p.technical.technique + p.mental.vision) / 3),
    defending: r((p.technical.tackling + p.technical.marking + p.mental.positioning) / 3),
    physical: r((p.physical.strength + p.physical.stamina + p.physical.agility) / 3),
  };
}

export function squadView(team: Team): SquadPlayer[] {
  return team.startingXi.concat(team.bench).map((p) => {
    const role = team.tactics.roleFor(p.id) ?? roleFallback.defaultRoleFor(p.position);
    return {
      id: p.id,
      name: p.name,
      pos: POS_LABEL[p.position],
      group: toGroup(p.position),
      age: p.age,
      overall: Math.round(positionOverall(p, p.position)),
      role: ROLE_LABEL[role.key as RoleKey] ?? "—",
      attrs: displayAttrs(p),
    };
  });
}

// ---- Build the league ------------------------------------------------------
const MY = buildClub({
  id: "onze",
  name: "Onze FC",
  short: "ONZ",
  rating: 75,
  seed: 101,
  formation: Formation.F433,
  roleByPosition: {
    [Position.FullBack]: RoleKey.WingBack,
    [Position.DefensiveMidfielder]: RoleKey.BoxToBox,
    [Position.CentralMidfielder]: RoleKey.AttackingMidfielder,
    [Position.Winger]: RoleKey.InsideForward,
    [Position.Striker]: RoleKey.InfiltratingForward,
  },
});

const RIVAL_SPECS = [
  { id: "rio", name: "Rio Athletic", short: "RIO", rating: 78, seed: 202, formation: Formation.F442 },
  { id: "cst", name: "Costa United", short: "CST", rating: 77, seed: 303, formation: Formation.F4231 },
  { id: "val", name: "Vale Sporting", short: "VAL", rating: 73, seed: 404, formation: Formation.F352 },
  { id: "srv", name: "Serra Verde", short: "SRV", rating: 71, seed: 505, formation: Formation.F532 },
  { id: "pta", name: "Porto Azul", short: "PTA", rating: 70, seed: 606, formation: Formation.F343 },
  { id: "mar", name: "Maré FC", short: "MAR", rating: 69, seed: 707, formation: Formation.F541 },
  { id: "sol", name: "Sol Nascente", short: "SOL", rating: 74, seed: 808, formation: Formation.F442Diamond, mentality: Mentality.Attacking },
];
const RIVALS = RIVAL_SPECS.map(buildClub);

export const CLUBS: Team[] = [MY, ...RIVALS];
export const MY_CLUB = MY;
export const MY_SQUAD: SquadPlayer[] = squadView(MY);

/** Shirt numbers per player (1–11 for the XI, 12+ for the bench), per club. */
export const SHIRT = new Map<string, number>();
for (const club of CLUBS) {
  club.startingXi.forEach((p, i) => SHIRT.set(p.id, i + 1));
  club.bench.forEach((p, i) => SHIRT.set(p.id, 12 + i));
}
export function shirtOf(id: string): number | string {
  return SHIRT.get(id) ?? "";
}
export function teamById(id: string): Team | undefined {
  return CLUBS.find((c) => c.id === id);
}

// ---- Single round-robin → real standings & form ----------------------------
interface Acc { played: number; w: number; d: number; l: number; gf: number; ga: number; pts: number; }

const sim = new MatchSimulator();

function computeSeason(): { standings: StandingRow[]; myForm: ("W" | "D" | "L")[] } {
  const acc = new Map<string, Acc>(CLUBS.map((c) => [c.id, { played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }]));
  const myForm: ("W" | "D" | "L")[] = [];

  for (let i = 0; i < CLUBS.length; i++) {
    for (let j = i + 1; j < CLUBS.length; j++) {
      const home = CLUBS[i]!;
      const away = CLUBS[j]!;
      const seed = 9000 + i * 100 + j;
      const r = sim.simulate({
        home, away, seed,
        matchRules: MatchRules.league(),
        substitutionRules: SubstitutionRules.brasileirao(),
      });
      const h = acc.get(home.id)!;
      const a = acc.get(away.id)!;
      h.played++; a.played++;
      h.gf += r.homeScore; h.ga += r.awayScore;
      a.gf += r.awayScore; a.ga += r.homeScore;
      if (r.homeScore > r.awayScore) { h.w++; h.pts += 3; a.l++; }
      else if (r.homeScore < r.awayScore) { a.w++; a.pts += 3; h.l++; }
      else { h.d++; a.d++; h.pts++; a.pts++; }
      if (home.id === MY.id) myForm.push(r.homeScore > r.awayScore ? "W" : r.homeScore < r.awayScore ? "L" : "D");
      else if (away.id === MY.id) myForm.push(r.awayScore > r.homeScore ? "W" : r.awayScore < r.homeScore ? "L" : "D");
    }
  }

  const standings = [...acc.entries()]
    .map(([id, s]) => {
      const club = teamById(id)!;
      return { ...s, team: club.name, short: club.shortName, isYou: id === MY.id };
    })
    .sort((a, b) => b.pts - a.pts || b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf)
    .map((s, i) => ({ pos: i + 1, ...s }));

  return { standings, myForm: myForm.slice(-5) };
}

const season = computeSeason();
export const STANDINGS = season.standings;
export const MY_FORM = season.myForm;

export const NEXT = {
  home: MY.name,
  homeShort: MY.shortName,
  away: RIVALS[0]!.name,
  awayShort: RIVALS[0]!.shortName,
  awayId: RIVALS[0]!.id,
  competition: "League · Round 13",
  venue: "Estádio Central",
};

export const YOU = { name: MY.name, short: MY.shortName, formation: "4-3-3", mentality: "Balanced" };
