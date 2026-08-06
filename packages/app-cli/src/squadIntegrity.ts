import { readFileSync } from "node:fs";
import { PositionGroup, positionGroup, type Position } from "@fut/domain";
import type { LeagueData, PlayerData } from "@fut/competition";
import { Career, InboxMessageType, indexPlayers } from "@fut/career";

/**
 * Can every AI club still field a side, and is anybody being passed around like a parcel?
 *
 * Three claims to check, and none of them is visible in the aggregates `career:depth` reports — a
 * league can hold a healthy mean squad size while one club has no goalkeeper in it.
 *
 *  1. NO CLUB RUNS OUT OF A LINE. `squad/composition` requires two keepers, six defenders, six
 *     midfielders and four forwards of an AI club, and the rule existed for a long time with exactly
 *     one caller — contract renewal. Every SALE went round it, so a club could sell both its keepers
 *     and pass the only test anybody was running, which was the sixteen-man total.
 *  2. NOBODY MOVES CLUB REPEATEDLY IN ONE SEASON. The market runs every couple of weeks, so without a
 *     resale cooldown a player could be sold on immediately and again after that.
 *  3. DEPTH DOES NOT DRIFT. The rules above are refusals, and a refusal can deadlock a market as
 *     easily as it can protect it — if nobody can sell anybody the league freezes at its opening
 *     squads and the transfer count goes to zero.
 *
 *   npx tsx packages/app-cli/src/squadIntegrity.ts [seasons] [seed]
 */

const league = JSON.parse(readFileSync("packages/web/src/lib/career/datasets/brasileirao/league.json", "utf8")) as LeagueData;
const world = JSON.parse(readFileSync("packages/web/src/lib/career/datasets/brasileirao/world.json", "utf8")) as never;

const seasons = Number(process.argv[2] ?? 5);
const seed = Number(process.argv[3] ?? 4242);
const mine = league.teams.find((t) => t.name.includes("Flamengo"))?.id ?? league.teams[0]!.id;
const byId: ReadonlyMap<string, PlayerData> = indexPlayers(league);
const c = Career.create(league, { leagueId: "BRA1", managedClubId: mine, seed, world });

const GROUPS: readonly [PositionGroup, string, number][] = [
  [PositionGroup.Goalkeeper, "GK", 2],
  [PositionGroup.Defence, "DEF", 6],
  [PositionGroup.Midfield, "MID", 6],
  [PositionGroup.Attack, "FWD", 4],
];
const groupOf = (id: string) => positionGroup(byId.get(id)!.position as Position);

/** Where every player is right now, so a season's movement can be diffed against it. */
const placement = (): Map<string, string> => {
  const at = new Map<string, string>();
  for (const [clubId, club] of Object.entries(c.snapshot().clubs)) {
    for (const pid of club.squad.playerIds) at.set(pid, clubId);
  }
  return at;
};

/** The worst-off AI club in each line, and how many clubs are below the floor. */
function lines(): string {
  const clubs = Object.entries(c.snapshot().clubs).filter(([id]) => id !== mine);
  const cells = GROUPS.map(([group, label, floor]) => {
    const counts = clubs.map(([, club]) => club.squad.playerIds.filter((id) => byId.has(id) && groupOf(id) === group).length);
    const min = Math.min(...counts);
    const short = counts.filter((n) => n < floor).length;
    return `${label} min ${String(min).padStart(2)}${short > 0 ? ` (${short} SHORT)` : ""}`;
  });
  return cells.join("  ");
}

let moves = new Map<string, number>();
let before = placement();

console.log(`${seasons} seasons, seed ${seed}, managing ${mine} — ${Object.keys(c.snapshot().clubs).length} clubs\n`);
console.log(`start   ${lines()}`);

for (let s = 0; s < seasons; s++) {
  c.simulateSeason();
  const after = placement();
  moves = new Map();
  for (const [pid, club] of after) {
    const was = before.get(pid);
    if (was !== undefined && was !== club) moves.set(pid, (moves.get(pid) ?? 0) + 1);
  }
  const moved = [...moves.values()];
  const sizes = Object.entries(c.snapshot().clubs).filter(([id]) => id !== mine).map(([, club]) => club.squad.playerIds.length);
  const mean = sizes.reduce((a, b) => a + b, 0) / sizes.length;
  console.log(
    `season ${s}  ${lines()}` +
      `\n          moved ${String(moved.length).padStart(3)}   squad mean ${mean.toFixed(1)}  min ${Math.min(...sizes)}  max ${Math.max(...sizes)}`,
  );
  before = after;
  c.rolloverSeason();
}

/*
 * A per-season diff counts one move per player at most, because it compares two snapshots — so the
 * "three clubs in a fortnight" case would show as ONE move here. Counting it needs the inbox, which
 * records every completed transfer as it happens.
 */
// `transferCompleted` ONLY. Matching every type containing "transfer" also counts rejections,
// counters and expiries — a first pass did, and reported one player "moving" 110 times when what it
// had counted was 110 refusals of the same bid.
const transfers = c.snapshot().inbox.filter((m) => m.type === InboxMessageType.TransferCompleted);
const perPlayer = new Map<string, number>();
for (const m of transfers) {
  const pid = (m.params as { playerId?: string }).playerId;
  if (pid) perPlayer.set(pid, (perPlayer.get(pid) ?? 0) + 1);
}
const counts = [...perPlayer.values()].sort((a, b) => b - a);
console.log(`\ntransfer messages ${transfers.length} over ${seasons} season(s), ${perPlayer.size} distinct players`);
console.log(`moves per player: max ${counts[0] ?? 0}   ${counts.filter((n) => n >= 3).length} player(s) moved 3+ times`);

// The busiest player's actual itinerary. A count on its own cannot tell a player who moved twice
// legitimately from one being passed round in a loop, and the dates are what distinguish them.
const worst = [...perPlayer.entries()].sort((a, b) => b[1] - a[1])[0];
if (worst && worst[1] > 2) {
  const his = transfers.filter((m) => (m.params as { playerId?: string }).playerId === worst[0]);
  console.log(`\nbusiest: ${worst[0]} — ${his.length} moves`);
  for (const m of his.slice(0, 10)) {
    const p = m.params as { fromClubId?: string; toClubId?: string; fee?: number };
    console.log(`  s${m.date.season} d${String(m.date.dayOfSeason).padStart(3)}  ${p.fromClubId} → ${p.toClubId}  fee ${p.fee}`);
  }
}
