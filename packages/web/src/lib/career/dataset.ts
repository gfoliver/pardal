import type { LeagueData, PlayerData, TeamData } from "@fut/competition";
import { Position } from "@fut/domain";

/**
 * A fictional Brazilian-flavoured league used to seed a career. Purely
 * procedural (licensing-safe); this is the concrete data a DatasetProvider
 * serves. Community datasets/patches can replace it later behind the same shape.
 */

const CLUBS: { id: string; name: string; short: string; rating: number }[] = [
  { id: "rio", name: "Rio Atlético", short: "RIO", rating: 80 },
  { id: "sao", name: "São Paulo United", short: "SPU", rating: 78 },
  { id: "min", name: "Mineiro EC", short: "MIN", rating: 76 },
  { id: "bah", name: "Bahia FC", short: "BAH", rating: 73 },
  { id: "por", name: "Porto Alegre SC", short: "POA", rating: 72 },
  { id: "rec", name: "Recife Náutico", short: "REC", rating: 70 },
  { id: "cur", name: "Curitiba FC", short: "CUR", rating: 68 },
  { id: "for", name: "Fortaleza AD", short: "FOR", rating: 66 },
  { id: "goi", name: "Goiânia EC", short: "GOI", rating: 64 },
  { id: "bel", name: "Belém Paraense", short: "BEL", rating: 62 },
  { id: "man", name: "Manaus FC", short: "MAN", rating: 60 },
  { id: "vit", name: "Vitória SC", short: "VIT", rating: 58 },
];

const FIRST = ["Bruno", "Léo", "Gabriel", "Rafael", "Thiago", "Matheus", "Lucas", "Pedro", "João", "Diego", "Vinícius", "Caio", "Felipe", "Rodrigo", "André", "Marcelo", "Igor", "Douglas", "Renan", "Everton"];
const LAST = ["Silva", "Santos", "Oliveira", "Souza", "Lima", "Costa", "Pereira", "Almeida", "Ferreira", "Rocha", "Barbosa", "Ribeiro", "Gomes", "Martins", "Araújo", "Cardoso", "Teixeira", "Moreira", "Nunes", "Freitas"];

// 18-man squad supporting 4-4-2 (2 GK, 6 DEF, 6 MID, 4 FWD).
const SQUAD: Position[] = [
  Position.Goalkeeper, Position.Goalkeeper,
  Position.CentreBack, Position.CentreBack, Position.CentreBack, Position.FullBack, Position.FullBack, Position.FullBack,
  Position.DefensiveMidfielder, Position.CentralMidfielder, Position.CentralMidfielder, Position.CentralMidfielder, Position.Winger, Position.Winger,
  Position.Striker, Position.Striker, Position.Striker, Position.AttackingMidfielder,
];

function clampAttr(v: number): number {
  return Math.max(1, Math.min(99, Math.round(v)));
}

function attrs(base: Position, v: number) {
  const b = (extra: number) => clampAttr(v + extra);
  const flat = clampAttr(v);
  const physical = { pace: flat, stamina: flat, strength: flat, agility: flat };
  const mental = { decisions: flat, composure: flat, workRate: flat, teamwork: flat, aggression: flat, anticipation: flat, positioning: flat, vision: flat };
  const technical = { passing: flat, technique: flat, dribbling: flat, finishing: flat, shotPower: flat, tackling: flat, marking: flat, crossing: flat };
  if (base === Position.Striker) { technical.finishing = b(12); technical.dribbling = b(4); }
  else if (base === Position.Winger) { technical.dribbling = b(8); technical.crossing = b(12); technical.finishing = b(3); }
  else if (base === Position.AttackingMidfielder) { technical.passing = b(8); mental.vision = b(10); }
  else if (base === Position.CentreBack) { technical.tackling = b(10); technical.marking = b(10); physical.strength = b(6); }
  else if (base === Position.FullBack) { physical.pace = b(6); technical.crossing = b(6); }
  else if (base === Position.DefensiveMidfielder) { technical.tackling = b(8); mental.positioning = b(6); }
  else if (base === Position.CentralMidfielder) { technical.passing = b(10); }
  return { physical, mental, technical };
}

function team(spec: { id: string; name: string; short: string; rating: number }, teamIdx: number): TeamData {
  const players: PlayerData[] = SQUAD.map((pos, i) => {
    // Starters a touch stronger than bench; slight per-player variation.
    const v = spec.rating + (i < 11 ? 2 : -3) + ((i * 7 + teamIdx * 3) % 5) - 2;
    const isGk = pos === Position.Goalkeeper;
    const name = `${FIRST[(teamIdx * 3 + i) % FIRST.length]} ${LAST[(teamIdx * 5 + i * 2) % LAST.length]}`;
    return {
      id: `${spec.id}-p${i}`,
      name,
      age: 19 + ((i * 3 + teamIdx) % 15), // 19..33
      nationality: "BR",
      position: pos,
      ...attrs(pos, v),
      ...(isGk ? { goalkeeping: { reflexes: clampAttr(v), handling: clampAttr(v), positioning: clampAttr(v), oneOnOnes: clampAttr(v) } } : {}),
    };
  });
  return { id: spec.id, name: spec.name, shortName: spec.short, coach: { id: `${spec.id}-c`, name: `${spec.name} Coach`, age: 52, nationality: "BR", attributes: { adaptability: 60, tacticalKnowledge: 62, reactiveness: 60, composure: 60 } }, players };
}

export function defaultLeague(): LeagueData {
  return { id: "brasil-ficticio", name: "Série Brasil (Fictícia)", teams: CLUBS.map(team) };
}

/** Selectable clubs for the new-game screen. */
export function clubChoices(): { id: string; name: string; short: string; rating: number }[] {
  return CLUBS.map((c) => ({ ...c }));
}
