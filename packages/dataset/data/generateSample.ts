/**
 * Dev helper (NOT part of the pipeline): emits a curated Brasileirão Série A
 * SAMPLE snapshot in the RAW/Transfermarkt shape, so the pure pipeline can run
 * offline and deterministically. Club metadata is real/public; squads are
 * SYNTHETIC (generic names, plausible market values + basic stats) — real data
 * is populated when the user runs `cli.ts build` against a live source.
 *
 * Run: npx tsx packages/dataset/data/generateSample.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { RawClub, RawCompetition, RawPlayer, RawSnapshot, RawStatLine } from "../src/raw/RawSnapshot.js";

// Deterministic PRNG (mulberry32) seeded from a string — no Math.random, so the
// committed JSON is stable across runs.
function seedFrom(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type ClubSpec = { id: string; name: string; short: string; city: string; stadium: string; capacity: number; founded: number; tier: number };

// Real, public club metadata. `tier` (1=strongest) only seeds synthetic squad strength.
const CLUBS: ClubSpec[] = [
  { id: "flamengo", name: "Flamengo", short: "FLA", city: "Rio de Janeiro", stadium: "Maracanã", capacity: 78838, founded: 1895, tier: 1 },
  { id: "palmeiras", name: "Palmeiras", short: "PAL", city: "São Paulo", stadium: "Allianz Parque", capacity: 43713, founded: 1914, tier: 1 },
  { id: "botafogo", name: "Botafogo", short: "BOT", city: "Rio de Janeiro", stadium: "Nilton Santos", capacity: 46000, founded: 1904, tier: 1 },
  { id: "atletico-mg", name: "Atlético Mineiro", short: "CAM", city: "Belo Horizonte", stadium: "Arena MRV", capacity: 46000, founded: 1908, tier: 2 },
  { id: "sao-paulo", name: "São Paulo", short: "SAO", city: "São Paulo", stadium: "MorumBIS", capacity: 66795, founded: 1930, tier: 2 },
  { id: "corinthians", name: "Corinthians", short: "COR", city: "São Paulo", stadium: "Neo Química Arena", capacity: 49205, founded: 1910, tier: 2 },
  { id: "internacional", name: "Internacional", short: "INT", city: "Porto Alegre", stadium: "Beira-Rio", capacity: 50128, founded: 1909, tier: 2 },
  { id: "gremio", name: "Grêmio", short: "GRE", city: "Porto Alegre", stadium: "Arena do Grêmio", capacity: 55662, founded: 1903, tier: 2 },
  { id: "fluminense", name: "Fluminense", short: "FLU", city: "Rio de Janeiro", stadium: "Maracanã", capacity: 78838, founded: 1902, tier: 2 },
  { id: "cruzeiro", name: "Cruzeiro", short: "CRU", city: "Belo Horizonte", stadium: "Mineirão", capacity: 61846, founded: 1921, tier: 2 },
  { id: "bahia", name: "Bahia", short: "BAH", city: "Salvador", stadium: "Arena Fonte Nova", capacity: 50025, founded: 1931, tier: 3 },
  { id: "vasco", name: "Vasco da Gama", short: "VAS", city: "Rio de Janeiro", stadium: "São Januário", capacity: 21880, founded: 1898, tier: 3 },
  { id: "santos", name: "Santos", short: "SAN", city: "Santos", stadium: "Vila Belmiro", capacity: 16068, founded: 1912, tier: 3 },
  { id: "fortaleza", name: "Fortaleza", short: "FOR", city: "Fortaleza", stadium: "Arena Castelão", capacity: 63903, founded: 1918, tier: 3 },
  { id: "bragantino", name: "Red Bull Bragantino", short: "RBB", city: "Bragança Paulista", stadium: "Nabi Abi Chedid", capacity: 17724, founded: 1928, tier: 3 },
  { id: "juventude", name: "Juventude", short: "JUV", city: "Caxias do Sul", stadium: "Alfredo Jaconi", capacity: 19924, founded: 1913, tier: 4 },
  { id: "vitoria", name: "Vitória", short: "VIT", city: "Salvador", stadium: "Barradão", capacity: 30618, founded: 1899, tier: 4 },
  { id: "mirassol", name: "Mirassol", short: "MIR", city: "Mirassol", stadium: "Maião", capacity: 15000, founded: 1925, tier: 4 },
  { id: "ceara", name: "Ceará", short: "CEA", city: "Fortaleza", stadium: "Arena Castelão", capacity: 63903, founded: 1914, tier: 4 },
  { id: "sport", name: "Sport Recife", short: "SPT", city: "Recife", stadium: "Ilha do Retiro", capacity: 26340, founded: 1905, tier: 4 },
];

const FIRST = ["Bruno", "Léo", "Gabriel", "Rafael", "Thiago", "Matheus", "Lucas", "Pedro", "João", "Diego", "Vinícius", "Caio", "Felipe", "Rodrigo", "André", "Marcelo", "Igor", "Douglas", "Renan", "Everton", "Wesley", "Yuri", "Kaio", "Nathan"];
const LAST = ["Silva", "Santos", "Oliveira", "Souza", "Lima", "Costa", "Pereira", "Almeida", "Ferreira", "Rocha", "Barbosa", "Ribeiro", "Gomes", "Martins", "Araújo", "Cardoso", "Teixeira", "Moreira", "Nunes", "Freitas", "Carvalho", "Pinto", "Dias", "Moraes"];

// Squad template (source position labels; mapped to domain Position at Emit).
const SQUAD: { pos: string; n: number }[] = [
  { pos: "Goalkeeper", n: 2 },
  { pos: "Centre-Back", n: 4 },
  { pos: "Full-Back", n: 3 },
  { pos: "Defensive Midfield", n: 2 },
  { pos: "Central Midfield", n: 3 },
  { pos: "Attacking Midfield", n: 1 },
  { pos: "Winger", n: 2 },
  { pos: "Centre-Forward", n: 3 },
];

// Market value band (EUR) by club tier — the anchor the pipeline infers from.
const TIER_BASE: Record<number, number> = { 1: 12_000_000, 2: 7_000_000, 3: 3_500_000, 4: 1_500_000 };

function makeClubPlayers(club: ClubSpec): RawPlayer[] {
  const players: RawPlayer[] = [];
  let idx = 0;
  for (const slot of SQUAD) {
    for (let k = 0; k < slot.n; k++) {
      const pid = `${club.id}-p${idx}`;
      const r = rng(seedFrom(pid));
      const starter = k === 0; // first of each slot tends to be more valuable
      const name = `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`;
      const age = 18 + Math.floor(r() * 18); // 18..35
      const valueMul = (starter ? 1.6 : 0.7) * (0.5 + r());
      const marketValueEur = Math.round((TIER_BASE[club.tier] ?? 1_000_000) * valueMul);
      const apps = starter ? 20 + Math.floor(r() * 18) : Math.floor(r() * 20);
      const minutes = apps * (starter ? 78 : 45);
      const attacking = slot.pos === "Centre-Forward" || slot.pos === "Winger" || slot.pos === "Attacking Midfield";
      const goals = attacking ? Math.floor(r() * (slot.pos === "Centre-Forward" ? 16 : 8)) : Math.floor(r() * 3);
      const assists = attacking ? Math.floor(r() * 7) : Math.floor(r() * 4);
      const heightCm = slot.pos === "Goalkeeper" || slot.pos === "Centre-Back" ? 185 + Math.floor(r() * 12) : 170 + Math.floor(r() * 15);
      const stats: RawStatLine[] = [
        { source: "sample", competitionId: "BRA1", seasonId: "2025", appearances: apps, minutes, goals, assists, yellow: Math.floor(r() * 8), red: r() < 0.06 ? 1 : 0 },
      ];
      players.push({
        id: pid,
        name,
        clubId: club.id,
        position: slot.pos,
        age,
        nationality: ["Brazil"],
        foot: r() < 0.75 ? "right" : "left",
        heightCm,
        marketValueEur,
        contractExpires: `${2026 + Math.floor(r() * 4)}-12-31`,
        stats,
      });
      idx++;
    }
  }
  return players;
}

function build(): RawSnapshot {
  const clubs: RawClub[] = CLUBS.map((c) => ({
    id: c.id,
    name: c.name,
    shortName: c.short,
    country: "Brazil",
    city: c.city,
    stadium: c.stadium,
    capacity: c.capacity,
    foundedYear: c.founded,
    competitionIds: ["BRA1", "BRC"],
  }));
  const players = CLUBS.flatMap(makeClubPlayers);
  const clubIds = CLUBS.map((c) => c.id);
  const competitions: RawCompetition[] = [
    { id: "BRA1", name: "Brasileirão Série A", type: "league", country: "Brazil", tier: 1, seasonId: "2025", format: { twoLegged: false }, entrantClubIds: clubIds },
    { id: "BRC", name: "Copa do Brasil", type: "cup", country: "Brazil", seasonId: "2025", format: { twoLegged: true }, entrantClubIds: clubIds },
  ];
  const coaches = CLUBS.map((c) => ({ id: `${c.id}-coach`, name: `${c.name} Coach`, clubId: c.id, age: 45 + (seedFrom(c.id) % 20), nationality: "Brazil" }));
  return { primaryCompetitionId: "BRA1", competitions, clubs, players, coaches };
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(__dirname, "brasileirao-serie-a", "raw.json");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(build(), null, 2) + "\n");
console.log(`Wrote ${outPath}`);
