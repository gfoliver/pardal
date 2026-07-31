import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runPipeline, type RawSnapshot } from "@fut/dataset";
import { Career, indexPlayers, InboxMessageType, InMemoryDatasetProvider, marketValue } from "@fut/career";

/**
 * How busy is the transfer market, and can anybody afford anybody?
 *
 * Written because the market was reported as "too rare" and turned out to be
 * something else entirely: `runTransferWindow` has no caller outside the tests, so
 * AI-to-AI transfers never happened at all, and inbound offers for the user's players
 * were generated only at career creation and at season rollover. "Increase the
 * frequency" is not a constant to nudge when the frequency is zero.
 *
 * The number that actually decides whether a wired-up market DOES anything is the last
 * column: a club's transfer budget against what a player costs. Budget is derived from
 * the wage bill (`balance * 0.4`, and `balance` is twelve weeks of wages), so if that
 * lands below a typical fee the market is inert however often it runs — and it would
 * look like a cadence problem.
 *
 * ONLY SEASONS 0-1 ARE MEANINGFUL. Nobody is playing, so nobody renews a contract, and
 * expiry is a daily concern — the managed squad drains away (measured 28 -> 17 -> 7 -> 0
 * players) while the AI market deliberately never buys on the user's behalf. That is the
 * harness being unattended, not the engine misbehaving, but it makes every later season's
 * numbers meaningless. Read season 0.
 *
 * The third argument puts our N worst players on the transfer list before kick-off, which
 * is how the list's effect is measured: run with 0 and with 6 and compare `offersToUs`.
 * Those players are chosen from the BOTTOM of the squad on purpose — they sit outside the
 * band rivals look at unprompted, so any interest in them is the listing's doing and
 * nothing else's.
 *
 * Run: npx tsx packages/app-cli/src/careerMarket.ts [seasons] [seed] [listWorstN]
 */
const SEASONS = Number(process.argv[2] ?? 3);
const SEED = Number(process.argv[3] ?? 7);
const LIST_WORST = Number(process.argv[4] ?? 0);

const RAW: RawSnapshot = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../dataset/data/brasileirao-serie-a/raw.json", import.meta.url)),
    "utf8",
  ),
);

const { league, world } = runPipeline(RAW);
const provider = new InMemoryDatasetProvider("bra", "1", [league], { [league.id]: world });
const dataById = indexPlayers(provider.getLeague(league.id));
const career = Career.create(provider.getLeague(league.id), {
  leagueId: league.id,
  managedClubId: "614",
  seed: SEED,
  world: provider.getWorld!(league.id)!,
});

const money = (v: number): string =>
  v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : `${Math.round(v / 1000)}k`;
const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0 ? 0 : s[Math.floor(s.length / 2)]!;
};

if (LIST_WORST > 0) {
  const worst = career.squad().slice(-LIST_WORST);
  for (const e of worst) career.listPlayer(e.playerId);
  console.log(
    `\nListed ${worst.length}: ${worst.map((e) => `${e.name} (${e.overall}, ask ${money(career.askingPrice(e.playerId) ?? 0)})`).join(", ")}`,
  );
}

console.log(`\nTransfer market over ${SEASONS} season(s), Brasileirão, seed ${SEED}\n`);
console.log(
  "season  squadMoves  loansIn  offersToUs  medBudget  affordable%  squad min/med/max  sellers",
);

for (let season = 0; season < SEASONS; season++) {
  const before = career.snapshot();
  const startSquads = new Map(
    Object.entries(before.clubs).map(([id, c]) => [id, [...c.squad.playerIds]] as const),
  );
  // Counted from the INBOX, not from live negotiations: an offer expires after ten days
  // and is then pruned, so a snapshot diff of `negotiations` reports zero however many
  // arrived. The inbox is append-only, which makes it the only honest counter.
  const offersBefore = before.inbox.filter((m) => m.type === InboxMessageType.TransferOfferReceived).length;

  career.simulateSeason();

  const after = career.snapshot();
  // Squad churn is the honest measure of market activity: it counts every player who
  // changed hands, whatever route (buy, loan, contract expiry) put him there.
  let moves = 0;
  for (const [clubId, ids] of startSquads) {
    const now = new Set(after.clubs[clubId]?.squad.playerIds ?? []);
    for (const id of ids) if (!now.has(id)) moves++;
  }
  const loansIn = after.transfers.loans.length;
  const offersToUs =
    after.inbox.filter((m) => m.type === InboxMessageType.TransferOfferReceived).length - offersBefore;

  // The affordability diagnostic. A club can only buy when a fee clears BOTH its
  // transfer budget and its balance, so the budget is the binding one.
  const budgets = Object.values(after.clubs).map((c) => c.finance.transferBudget);
  const values = Object.keys(after.playerDev)
    .map((id) => {
      const data = dataById.get(id);
      const dev = after.playerDev[id];
      if (!data || !dev) return 0;
      return marketValue({
        overall: dev.currentAbility / 2,
        age: dev.ageAtSeasonStart,
        currentAbility: dev.currentAbility,
        potentialAbility: dev.potentialAbility,
      });
    })
    .filter((v) => v > 0);
  const medBudget = median(budgets);
  const medValue = median(values);
  const affordable = values.filter((v) => v <= medBudget).length / (values.length || 1);

  // Squad SIZE is the suspected reason the market dries up over seasons: a club at or
  // below MIN_SQUAD (16) is skipped as a seller, so once squads polarise the candidate
  // pool empties and cadence stops mattering again.
  const sizes = Object.values(after.clubs).map((c) => c.squad.playerIds.length);
  const sellers = sizes.filter((n) => n > 16).length;
  console.log(
    `${String(season).padStart(6)}  ${String(moves).padStart(10)}  ${String(loansIn).padStart(7)}  ` +
      `${String(offersToUs).padStart(10)}  ${money(medBudget).padStart(9)}  ` +
      `${(affordable * 100).toFixed(0).padStart(11)}  ` +
      `${`${Math.min(...sizes)}/${median(sizes)}/${Math.max(...sizes)}`.padStart(17)}  ${String(sellers).padStart(7)}  ours=${after.clubs[after.managedClubId]?.squad.playerIds.length ?? 0}`,
  );

  if (season < SEASONS - 1) career.rolloverSeason();
}

console.log(
  `\nsquadMoves counts players who left a squad, whatever the route. offersToUs is\n` +
    `negotiations opened with us as SELLER. affordable% is the share of players whose\n` +
    `value fits the median club's transfer budget — if that is near zero, cadence is\n` +
    `not the problem.\n`,
);
