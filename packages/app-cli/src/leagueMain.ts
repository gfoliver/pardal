import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  League,
  loadLeagueTeams,
  type LeagueData,
  type SeasonStats,
} from "@fut/competition";
import { isLocale, type Locale } from "@fut/i18n";
import { type Team } from "@fut/domain";

interface CliOptions {
  locale: Locale;
  seed: number;
}

function parseArgs(argv: readonly string[]): CliOptions {
  let locale: Locale = "en";
  let seed = 1;
  for (let i = 0; i < argv.length; i++) {
    const [key, inline] = argv[i]!.split("=");
    const value = inline ?? argv[i + 1];
    if (key === "--locale" && value) {
      if (isLocale(value)) locale = value;
      if (!inline) i++;
    } else if (key === "--seed" && value) {
      const n = Number(value);
      if (Number.isFinite(n)) seed = Math.trunc(n);
      if (!inline) i++;
    }
  }
  return { locale, seed };
}

const HEADERS: Record<Locale, string[]> = {
  en: ["Pos", "Team", "P", "W", "D", "L", "GF", "GA", "GD", "Pts"],
  "pt-BR": ["Pos", "Time", "J", "V", "E", "D", "GP", "GC", "SG", "Pts"],
};

function main(): void {
  const { locale, seed } = parseArgs(process.argv.slice(2));
  const here = dirname(fileURLToPath(import.meta.url));
  const data = JSON.parse(
    readFileSync(resolve(here, "../data/league.json"), "utf8"),
  ) as LeagueData;

  const teams = loadLeagueTeams(data);
  const nameById = new Map(data.teams.map((t) => [t.id, t.name]));
  const league = new League(teams);
  const season = league.simulateSeason(seed);

  const h = HEADERS[locale];
  console.log(`${data.name} — ${locale} (seed: ${seed})`);
  console.log(
    `${h[0]!.padStart(3)}  ${h[1]!.padEnd(20)} ${h[2]!.padStart(3)} ${h[3]!.padStart(3)} ${h[4]!.padStart(3)} ${h[5]!.padStart(3)} ${h[6]!.padStart(3)} ${h[7]!.padStart(3)} ${h[8]!.padStart(4)} ${h[9]!.padStart(4)}`,
  );
  season.table.forEach((row, i) => {
    const name = nameById.get(row.teamId) ?? row.teamId;
    console.log(
      `${String(i + 1).padStart(3)}  ${name.padEnd(20)} ${String(row.played).padStart(3)} ${String(row.won).padStart(3)} ${String(row.drawn).padStart(3)} ${String(row.lost).padStart(3)} ${String(row.goalsFor).padStart(3)} ${String(row.goalsAgainst).padStart(3)} ${String(row.goalDifference).padStart(4)} ${String(row.points).padStart(4)}`,
    );
  });

  printStats(season.stats, teams, nameById, locale);
}

const STAT_LABELS: Record<Locale, {
  scorers: string; assisters: string; keepers: string; form: string; goals: string; assists: string; conceded: string; cleanSheets: string;
}> = {
  en: {
    scorers: "Top scorers", assisters: "Top assisters", keepers: "Fewest conceded (goalkeepers)",
    form: "Form (last 5)", goals: "goals", assists: "assists", conceded: "GA", cleanSheets: "CS",
  },
  "pt-BR": {
    scorers: "Artilheiros", assisters: "Assistências", keepers: "Goleiros menos vazados",
    form: "Forma (últimos 5)", goals: "gols", assists: "assist.", conceded: "GC", cleanSheets: "JSV",
  },
};

function printStats(
  stats: SeasonStats,
  teams: readonly Team[],
  nameById: Map<string, string>,
  locale: Locale,
): void {
  const L = STAT_LABELS[locale];
  const playerName = new Map<string, string>();
  const gkByTeam = new Map<string, string>();
  for (const t of teams) {
    for (const p of [...t.startingXi, ...t.bench]) playerName.set(p.id, p.name);
    const gk = t.goalkeeper();
    if (gk) gkByTeam.set(t.id, gk.name);
  }
  const teamName = (id: string) => nameById.get(id) ?? id;

  console.log(`\n── ${L.scorers} ──`);
  stats.topScorers.slice(0, 5).forEach((r, i) => {
    console.log(`${String(i + 1).padStart(2)}. ${(playerName.get(r.playerId) ?? r.playerId).padEnd(22)} ${teamName(r.teamId).padEnd(18)} ${r.goals} ${L.goals}`);
  });

  console.log(`\n── ${L.assisters} ──`);
  stats.topAssisters.slice(0, 5).forEach((r, i) => {
    console.log(`${String(i + 1).padStart(2)}. ${(playerName.get(r.playerId) ?? r.playerId).padEnd(22)} ${teamName(r.teamId).padEnd(18)} ${r.assists} ${L.assists}`);
  });

  console.log(`\n── ${L.keepers} ──`);
  stats.defensive.slice(0, 5).forEach((r, i) => {
    const keeper = gkByTeam.get(r.teamId) ?? "—";
    console.log(`${String(i + 1).padStart(2)}. ${keeper.padEnd(22)} ${teamName(r.teamId).padEnd(18)} ${L.conceded} ${r.goalsAgainst}  ${L.cleanSheets} ${r.cleanSheets}`);
  });

  console.log(`\n── ${L.form} ──`);
  for (const f of stats.form) {
    console.log(`${teamName(f.teamId).padEnd(20)} ${f.recent.join(" ")}`);
  }
}

main();
