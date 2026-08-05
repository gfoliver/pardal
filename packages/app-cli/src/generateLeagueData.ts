import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Position } from "@fut/domain";
import { type LeagueData, type PlayerData, type TeamData } from "@fut/competition";

// One-off generator for the fictional league dataset (packages/app-cli/data/league.json).
// Run with: npx tsx packages/app-cli/src/generateLeagueData.ts

const clamp = (v: number) => Math.max(1, Math.min(99, v));
const phys = (v: number) => ({ pace: v, stamina: v, strength: v, agility: v });
const ment = (v: number) => ({
  decisions: v, composure: v, workRate: v, teamwork: v,
  aggression: v, anticipation: v, positioning: v, vision: v, offTheBall: v,
});
const tech = (v: number, ov: Partial<Record<string, number>> = {}) => ({
  passing: v, technique: v, dribbling: v, finishing: v,
  shotPower: v, tackling: v, marking: v, crossing: v, firstTouch: v, heading: v, ...ov,
});
const gk = (v: number) => ({ reflexes: v, handling: v, positioning: v, oneOnOnes: v });

function outfield(id: string, name: string, position: Position, v: number): PlayerData {
  let technical = tech(v);
  switch (position) {
    case Position.Striker:
      technical = tech(v, { finishing: clamp(v + 12), dribbling: clamp(v + 4) });
      break;
    case Position.Winger:
      technical = tech(v, { dribbling: clamp(v + 8), crossing: clamp(v + 12), finishing: clamp(v + 3) });
      break;
    case Position.CentreBack:
    case Position.WingBack:
      technical = tech(v, { tackling: clamp(v + 10), marking: clamp(v + 10) });
      break;
    case Position.FullBack:
      technical = tech(v, { tackling: clamp(v + 10), marking: clamp(v + 10), crossing: clamp(v + 8) });
      break;
    default:
      technical = tech(v, { passing: clamp(v + 10) });
  }
  return {
    id, name, age: 25, nationality: "BR", position,
    physical: phys(v), mental: ment(v), technical,
  };
}

function keeper(id: string, name: string, v: number): PlayerData {
  return {
    id, name, age: 28, nationality: "BR", position: Position.Goalkeeper,
    physical: phys(v), mental: ment(v), technical: tech(v), goalkeeping: gk(v),
  };
}

function makeTeam(id: string, name: string, short: string, rating: number): TeamData {
  const players: PlayerData[] = [
    keeper(`${id}-gk`, `${short} Keeper`, rating),
    outfield(`${id}-lb`, `${short} Left Back`, Position.FullBack, rating),
    outfield(`${id}-cb1`, `${short} Centre Back 1`, Position.CentreBack, rating),
    outfield(`${id}-cb2`, `${short} Centre Back 2`, Position.CentreBack, rating),
    outfield(`${id}-rb`, `${short} Right Back`, Position.FullBack, rating),
    outfield(`${id}-lw`, `${short} Left Winger`, Position.Winger, rating),
    outfield(`${id}-cm1`, `${short} Midfielder 1`, Position.CentralMidfielder, rating),
    outfield(`${id}-cm2`, `${short} Midfielder 2`, Position.CentralMidfielder, rating),
    outfield(`${id}-rw`, `${short} Right Winger`, Position.Winger, rating),
    outfield(`${id}-st1`, `${short} Striker 1`, Position.Striker, rating),
    outfield(`${id}-st2`, `${short} Striker 2`, Position.Striker, rating),
    // Bench
    keeper(`${id}-gk2`, `${short} Keeper 2`, rating - 4),
    outfield(`${id}-cb3`, `${short} Centre Back 3`, Position.CentreBack, rating - 2),
    outfield(`${id}-dm`, `${short} Defensive Mid`, Position.DefensiveMidfielder, rating),
    outfield(`${id}-am`, `${short} Attacking Mid`, Position.AttackingMidfielder, rating),
    outfield(`${id}-st3`, `${short} Striker 3`, Position.Striker, rating - 2),
  ];
  return {
    id, name, shortName: short,
    coach: {
      id: `${id}-coach`, name: `${short} Coach`, age: 50, nationality: "BR",
      attributes: { adaptability: 60, tacticalKnowledge: 60, reactiveness: 60, composure: 60 },
    },
    players,
  };
}

const league: LeagueData = {
  id: "serie-ficticia",
  name: "Série Fictícia",
  teams: [
    makeTeam("rio", "Rio Athletic", "RIO", 72),
    makeTeam("spu", "São Paulo United", "SPU", 69),
    makeTeam("min", "Minas Gerais FC", "MIN", 66),
    makeTeam("bah", "Bahia Coastal", "BAH", 63),
    makeTeam("sul", "Sul Rangers", "SUL", 60),
    makeTeam("nor", "Nordeste City", "NOR", 57),
  ],
};

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(here, "../data/league.json");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(league, null, 2), "utf8");
console.log(`Wrote ${league.teams.length} teams to ${outPath}`);
