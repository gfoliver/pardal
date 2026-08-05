import {
  clampAttribute,
  Coach,
  Formation,
  getFormationTemplate,
  getRole,
  Goalkeeper,
  Mentality,
  Player,
  Position,
  PositionGroup,
  positionGroup,
  type RoleKey,
  type TeamInstructions,
  TacticsBuilder,
  Team,
  type GoalkeepingAttributes,
  type MentalAttributes,
  type PhysicalAttributes,
  type TechnicalAttributes,
} from "@fut/domain";
import { SeededRandom, type RandomSource } from "@fut/engine";

const FIRST = ["Léo", "Rui", "Aldo", "Caio", "Bruno", "Dario", "Ivan", "Téo", "Marco", "Hugo", "Nando", "Vítor", "Elias", "Pedro", "Zeca", "Tomás", "Rafa", "Gil", "Otávio", "Luca", "Kaio", "Diego"];
const LAST = ["Prado", "Barreto", "Nunes", "Vasques", "Sales", "Melo", "Rocha", "Farias", "Vidal", "Serra", "Reis", "Paes", "Gomo", "Lins", "Alves", "Réu", "Duarte", "Matos", "Pires", "Bastos", "Cardoso", "Fontes"];

/** Per-attribute deltas that give each position a believable profile. */
const PROFILE: Partial<Record<Position, Partial<Record<string, number>>>> = {
  [Position.Goalkeeper]: { reflexes: 14, handling: 12, gkPositioning: 12, oneOnOnes: 10, composure: 6 },
  [Position.CentreBack]: { marking: 14, tackling: 13, strength: 12, positioning: 8, anticipation: 6, finishing: -18, pace: -4 },
  [Position.FullBack]: { pace: 10, stamina: 10, crossing: 8, tackling: 6, marking: 4, finishing: -12 },
  [Position.WingBack]: { pace: 12, stamina: 12, crossing: 10, dribbling: 6, finishing: -8 },
  [Position.DefensiveMidfielder]: { tackling: 12, positioning: 10, stamina: 10, anticipation: 8, passing: 4, finishing: -8 },
  [Position.CentralMidfielder]: { passing: 12, vision: 10, technique: 8, stamina: 8, decisions: 6 },
  [Position.AttackingMidfielder]: { vision: 12, technique: 12, dribbling: 10, passing: 8, finishing: 6, tackling: -8 },
  [Position.Winger]: { pace: 14, dribbling: 13, crossing: 10, technique: 8, agility: 8, tackling: -10 },
  [Position.Striker]: { finishing: 15, composure: 10, shotPower: 10, pace: 8, anticipation: 6, marking: -16, tackling: -14 },
};

function jitter(rng: RandomSource, base: number, delta: number): number {
  return clampAttribute(Math.round(base + delta + (rng.int(11) - 5)));
}

function d(pos: Position, key: string): number {
  return PROFILE[pos]?.[key] ?? 0;
}

function physical(rng: RandomSource, base: number, pos: Position): PhysicalAttributes {
  return {
    pace: jitter(rng, base, d(pos, "pace")),
    stamina: jitter(rng, base, d(pos, "stamina")),
    strength: jitter(rng, base, d(pos, "strength")),
    agility: jitter(rng, base, d(pos, "agility")),
  };
}

function mental(rng: RandomSource, base: number, pos: Position): MentalAttributes {
  const m = (k: string) => jitter(rng, base, d(pos, k));
  return {
    decisions: m("decisions"), composure: m("composure"), workRate: m("workRate"),
    teamwork: m("teamwork"), aggression: m("aggression"), anticipation: m("anticipation"),
    positioning: m("positioning"), vision: m("vision"), offTheBall: m("offTheBall"),
  };
}

function technical(rng: RandomSource, base: number, pos: Position): TechnicalAttributes {
  const tk = (k: string) => jitter(rng, base, d(pos, k));
  return {
    passing: tk("passing"), technique: tk("technique"), dribbling: tk("dribbling"),
    finishing: tk("finishing"), shotPower: tk("shotPower"), tackling: tk("tackling"),
    marking: tk("marking"), crossing: tk("crossing"),
    firstTouch: tk("firstTouch"), heading: tk("heading"),
  };
}

function goalkeeping(rng: RandomSource, base: number, pos: Position): GoalkeepingAttributes {
  return {
    reflexes: jitter(rng, base, d(pos, "reflexes")),
    handling: jitter(rng, base, d(pos, "handling")),
    positioning: jitter(rng, base, d(pos, "gkPositioning")),
    oneOnOnes: jitter(rng, base, d(pos, "oneOnOnes")),
  };
}

export interface ClubSpec {
  id: string;
  name: string;
  short: string;
  rating: number;
  seed: number;
  formation?: Formation;
  mentality?: Mentality;
  roleByPosition?: Partial<Record<Position, RoleKey>>;
  instructions?: Partial<TeamInstructions>;
}

function makePlayer(rng: RandomSource, id: string, pos: Position, base: number, usedNames: Set<string>): Player {
  let name = "";
  for (let i = 0; i < 40; i++) {
    name = `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
    if (!usedNames.has(name)) break;
  }
  usedNames.add(name);
  const age = 18 + rng.int(18);
  const common = { id, name, age, nationality: "BR", position: pos };
  if (pos === Position.Goalkeeper) {
    return new Goalkeeper({
      ...common,
      physical: physical(rng, base, pos),
      mental: mental(rng, base, pos),
      technical: technical(rng, base, pos),
      goalkeeping: goalkeeping(rng, base, pos),
    });
  }
  return new Player({
    ...common,
    physical: physical(rng, base, pos),
    mental: mental(rng, base, pos),
    technical: technical(rng, base, pos),
  });
}

const BENCH: Position[] = [
  Position.Goalkeeper,
  Position.CentreBack,
  Position.FullBack,
  Position.CentralMidfielder,
  Position.Winger,
  Position.Striker,
];

export function buildClub(spec: ClubSpec): Team {
  const rng = new SeededRandom(spec.seed);
  const formation = spec.formation ?? Formation.F433;
  const used = new Set<string>();

  const starters = getFormationTemplate(formation).map((slot, i) =>
    makePlayer(rng, `${spec.id}-s${i}`, slot.position, spec.rating, used),
  );
  const bench = BENCH.map((pos, i) => makePlayer(rng, `${spec.id}-b${i}`, pos, spec.rating - 4, used));

  const coach = new Coach({
    id: `${spec.id}-coach`,
    name: `${rng.pick(FIRST)} ${rng.pick(LAST)}`,
    age: 45 + rng.int(20),
    nationality: "BR",
    attributes: { adaptability: 62, tacticalKnowledge: 66, reactiveness: 60, composure: 64 },
  });

  let tactics = new TacticsBuilder().simple(starters, {
    formation,
    mentality: spec.mentality ?? Mentality.Balanced,
  });
  if (spec.roleByPosition) {
    for (const p of starters) {
      const key = spec.roleByPosition[p.position];
      if (key) tactics = tactics.withRole(p.id, getRole(key));
    }
  }
  if (spec.instructions) tactics = tactics.withInstructions(spec.instructions);

  return new Team({ id: spec.id, name: spec.name, shortName: spec.short, coach, startingXi: starters, bench, tactics });
}

export { PositionGroup, positionGroup };
