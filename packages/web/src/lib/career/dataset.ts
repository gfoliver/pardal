import type { DatasetWorld, LeagueData, PlayerData, TeamData } from "@fut/competition";
import { Position, positionOverall } from "@fut/domain";
import { loadLeagueTeams } from "@fut/competition";
import braLeague from "./datasets/brasileirao-serie-a/league.json";
import braWorld from "./datasets/brasileirao-serie-a/world.json";
import braManifest from "./datasets/brasileirao-serie-a/manifest.json";

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
export function clubChoices(): ClubChoice[] {
  return CLUBS.map((c) => ({ id: c.id, name: c.name, short: c.short, rating: c.rating }));
}

// --- dataset registry -------------------------------------------------------

export interface ClubChoice {
  readonly id: string;
  readonly name: string;
  readonly short: string;
  readonly rating: number;
}

/** A selectable dataset a career can be created on. */
export interface DatasetOption {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  league(): LeagueData;
  world(): DatasetWorld | undefined;
  clubChoices(): ClubChoice[];
}

/** Club picks derived from an assembled league's squads (rating = best XI overall). */
function derivedClubChoices(league: LeagueData): ClubChoice[] {
  const teams = loadLeagueTeams(league);
  return league.teams
    .map((t, i) => {
      const team = teams[i]!;
      const xi = team.startingXi;
      const rating = Math.round(xi.reduce((s, p) => s + positionOverall(p, p.position), 0) / Math.max(1, xi.length));
      return { id: t.id, name: t.name, short: t.shortName, rating };
    })
    .sort((a, b) => b.rating - a.rating);
}

const FICTIONAL: DatasetOption = {
  id: "brasil-ficticio",
  name: "Série Brasil (Fictícia)",
  version: "1",
  league: defaultLeague,
  world: () => undefined,
  clubChoices,
};

const BRASILEIRAO: DatasetOption = {
  id: (braManifest as { id: string }).id,
  name: (braManifest as { name: string }).name,
  version: (braManifest as { datasetVersion: string }).datasetVersion,
  league: () => braLeague as unknown as LeagueData,
  world: () => braWorld as unknown as DatasetWorld,
  clubChoices: () => derivedClubChoices(braLeague as unknown as LeagueData),
};

/** All datasets a new career can start from (procedural default first). */
export function datasets(): DatasetOption[] {
  return [FICTIONAL, BRASILEIRAO];
}

export function getDataset(id: string): DatasetOption {
  return datasets().find((d) => d.id === id) ?? FICTIONAL;
}
