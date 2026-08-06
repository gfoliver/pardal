import { readFileSync } from "node:fs";
import type { DatasetWorld, LeagueData } from "@fut/competition";
import { Career, MONTHS_PER_SEASON, indexPlayers, monthlyWage, monthlyWageBill, playerValue, summariseFinance } from "@fut/career";

/**
 * What money means in each division, and what changes when a club moves between them.
 *
 * `seasonBudget` scales the prize by final position and division size only, and both Brazilian
 * divisions hold twenty clubs — so winning Série B pays exactly what winning Série A pays. This
 * harness is here to say whether that is worth a tier factor and, if so, how big, because a factor is
 * a balance constant and picking one from intuition is how you get a second-tier club outbidding a
 * first-tier one.
 *
 * The columns that decide it:
 *  - PAYROLL is the anchor: the budget is payroll × (1 + slack × appetite) + prize, so a division's
 *    wage bill already separates the tiers whatever the prize does.
 *  - PRIZE SHARE says how much of the budget the finishing position is responsible for. If it is a few
 *    per cent, a tier factor on the prize cannot move anything and the lever is elsewhere.
 *  - AFFORDS is the number a manager feels: how many of his own division's median-valued players the
 *    budget could buy outright, wages included.
 *
 *   npx tsx packages/app-cli/src/divisionEconomy.ts [seasons] [seed]
 */

const DIR = "packages/web/src/lib/career/datasets/brasileirao";
const league = JSON.parse(readFileSync(`${DIR}/league.json`, "utf8")) as LeagueData;
const world = JSON.parse(readFileSync(`${DIR}/world.json`, "utf8")) as DatasetWorld;

const seasons = Number(process.argv[2] ?? 3);
const seed = Number(process.argv[3] ?? 4242);
const mine = league.teams.find((t) => t.name.includes("Flamengo"))?.id ?? league.teams[0]!.id;
const byId = indexPlayers(league);
const c = Career.create(league, { leagueId: "BRA1", managedClubId: mine, seed, world: world as never });

const fmt = (n: number) => (n / 1_000_000).toFixed(1).padStart(7);
const stat = (xs: readonly number[]) => ({
  mean: xs.reduce((a, b) => a + b, 0) / xs.length,
  min: Math.min(...xs),
  max: Math.max(...xs),
});

/** Every club's division, by the id the career actually stores. */
const divisionOf = () => {
  const byClub = new Map<string, { id: string; name: string; tier: number }>();
  for (const d of c.divisions()) {
    for (const t of c.snapshot().structure.divisions.find((x) => x.id === d.id)?.teamIds ?? []) {
      byClub.set(t, { id: d.id, name: d.name, tier: d.tier ?? 99 });
    }
  }
  return byClub;
};

function report(label: string): void {
  const s = c.snapshot();
  const div = divisionOf();
  const tiers = [...new Set([...div.values()].map((d) => d.tier))].sort();
  console.log(`\n── ${label} ──`);
  for (const tier of tiers) {
    const ids = [...div.entries()].filter(([, d]) => d.tier === tier).map(([id]) => id);
    if (ids.length === 0) continue;
    const payroll = ids.map((id) => monthlyWageBill(s, id) * MONTHS_PER_SEASON);
    const budget = ids.map((id) => s.clubs[id]!.finance.annualBudget);
    /*
     * What the prize contributed: the budget minus what payroll alone would have produced. The
     * appetite factor is unknown per club, so this is bounded rather than exact — reported at the two
     * ends of the appetite range.
     *
     * The tier share has to be in here too, and leaving it out was actively misleading: with the slack
     * scaled down but the estimate still assuming full slack, the second tier's prize appeared to
     * vanish (0–1%) when it had only been reduced along with everything else.
     */
    const p = stat(payroll), b = stat(budget);
    const share = tier === 1 ? 1 : 0.45;
    const prizeShareHi = 1 - (p.mean * (1 + 0.25 * 0.75 * share)) / b.mean;
    const prizeShareLo = 1 - (p.mean * (1 + 0.25 * 1.4 * share)) / b.mean;
    // Median player value in this tier, so "what can a club buy" is asked in its own market.
    const values = ids
      .flatMap((id) => (s.clubs[id]?.squad.playerIds ?? []).map((pid) => playerValue(s, byId, pid)))
      .filter((v) => v > 0)
      .sort((x, y) => x - y);
    const median = values[Math.floor(values.length / 2)] ?? 0;
    // A signing costs the fee AND a year of his salary out of the same pot, which is the rule
    // `runTransferWindow` applies — so "affords" has to price both or it flatters every club.
    const perSigning = median + monthlyWage(median) * MONTHS_PER_SEASON;
    const affords = ids.map((id) => {
      const f = summariseFinance(s.clubs[id]!.finance, monthlyWageBill(s, id));
      return perSigning > 0 ? Math.max(0, f.available) / perSigning : 0;
    });
    const a = stat(affords);
    console.log(
      `  tier ${tier}  n=${String(ids.length).padStart(2)}  ` +
        `payroll ${fmt(p.mean)}M  budget ${fmt(b.mean)}M (${fmt(b.min)}–${fmt(b.max)})  ` +
        `prize ${(Math.max(0, prizeShareLo) * 100).toFixed(0)}–${(Math.max(0, prizeShareHi) * 100).toFixed(0)}%  ` +
        `median player ${fmt(median)}M  affords ${a.mean.toFixed(1)} (${a.min.toFixed(1)}–${a.max.toFixed(1)})`,
    );
  }
}

report("start");

for (let s = 0; s < seasons; s++) {
  const beforeDiv = divisionOf();
  const beforeBudget = new Map(Object.entries(c.snapshot().clubs).map(([id, club]) => [id, club.finance.annualBudget]));
  c.simulateSeason();
  c.rolloverSeason();
  const afterDiv = divisionOf();

  // The clubs that changed tier, and what their money and their board target did about it.
  const movers = [...afterDiv.entries()].filter(([id, d]) => beforeDiv.get(id)?.tier !== d.tier);
  report(`after season ${s}`);
  if (movers.length > 0) {
    console.log(`  moved between divisions: ${movers.length}`);
    for (const [id, d] of movers.slice(0, 8)) {
      const was = beforeDiv.get(id)!;
      const club = c.snapshot().clubs[id]!;
      const before = beforeBudget.get(id) ?? 0;
      const dir = d.tier < was.tier ? "UP  " : "DOWN";
      console.log(
        `    ${dir} ${c.clubNickname(id).padEnd(22)} tier ${was.tier}→${d.tier}  ` +
          `budget ${fmt(before)}M → ${fmt(club.finance.annualBudget)}M  ` +
          `board target ≤ ${club.objectives.leaguePositionTarget}`,
      );
    }
  }
}
