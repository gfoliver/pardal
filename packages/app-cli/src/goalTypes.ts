import { Formation, Position, positionGroup, RoleKey, MatchRules, SubstitutionRules, type Team } from "@fut/domain";
import { MatchEventType, MatchSimulator } from "@fut/engine";
import { buildTeam } from "./teamFactory.js";

// What kinds of chances produce goals? Run:
//   npx tsx packages/app-cli/src/goalTypes.ts

const sim = new MatchSimulator();
const CENTER_LANE = 2; // 5-lane grid

function positionOf(team: Team, playerId: string): Position | undefined {
  return [...team.startingXi, ...team.bench].find((p) => p.id === playerId)?.position;
}

function laneCategory(lane: number | undefined): string {
  if (lane === undefined) return "?";
  const off = Math.abs(lane - CENTER_LANE);
  return off === 0 ? "central" : off === 1 ? "half-space" : "wide";
}

interface Breakdown {
  games: number;
  goals: number;
  chance: Record<string, number>;
  scorerGroup: Record<string, number>;
  lane: Record<string, number>;
}

function emptyBreakdown(): Breakdown {
  return { games: 0, goals: 0, chance: {}, scorerGroup: {}, lane: {} };
}

function inc(rec: Record<string, number>, key: string): void {
  rec[key] = (rec[key] ?? 0) + 1;
}

/** Aggregate goals scored BY `attacker` across N games vs `defender`. */
function scan(attacker: Team, defender: Team, seeds: number): Breakdown {
  const b = emptyBreakdown();
  for (let seed = 1; seed <= seeds; seed++) {
    const r = sim.simulate({
      home: attacker,
      away: defender,
      seed: (seed * 7919) >>> 0,
      matchRules: MatchRules.league(),
      substitutionRules: SubstitutionRules.brasileirao(),
    });
    b.games++;
    for (const e of r.timeline) {
      if (e.type !== MatchEventType.Goal || e.teamId !== attacker.id) continue;
      b.goals++;
      inc(b.chance, String(e.params?.chanceType ?? "?"));
      const pos = e.playerId ? positionOf(attacker, e.playerId) : undefined;
      inc(b.scorerGroup, pos ? positionGroup(pos) : "?");
      inc(b.lane, laneCategory(e.zone?.lane));
    }
  }
  return b;
}

function pct(rec: Record<string, number>, total: number): string {
  return Object.entries(rec)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${((v / total) * 100).toFixed(0)}%`)
    .join(", ");
}

function report(title: string, b: Breakdown): void {
  console.log(`\n${title}`);
  console.log(`  goals/game: ${(b.goals / b.games).toFixed(2)}  (${b.goals} in ${b.games})`);
  console.log(`  by chance : ${pct(b.chance, b.goals)}`);
  console.log(`  by scorer : ${pct(b.scorerGroup, b.goals)}`);
  console.log(`  by lane   : ${pct(b.lane, b.goals)}`);
}

const SEEDS = 120;
const baseline = () => buildTeam({ id: "opp", name: "Opp", shortName: "OPP", rating: 65 });

// Overall goal anatomy (even 4-4-2 sides).
report(
  "All goals — 4-4-2 vs 4-4-2",
  scan(
    buildTeam({ id: "a", name: "A", shortName: "A", rating: 65 }),
    buildTeam({ id: "opp", name: "Opp", shortName: "OPP", rating: 65 }),
    SEEDS,
  ),
);

// Poacher 4-3-3 vs false-9 4-3-3, both against the same baseline opponent.
report(
  "4-3-3 with Poacher striker (vs 4-4-2)",
  scan(
    buildTeam({ id: "p", name: "Poacher", shortName: "POA", rating: 65, formation: Formation.F433, roleByPosition: { [Position.Striker]: RoleKey.Poacher } }),
    baseline(),
    SEEDS,
  ),
);
report(
  "4-3-3 with False 9 (vs 4-4-2)",
  scan(
    buildTeam({ id: "f", name: "False9", shortName: "FAL", rating: 65, formation: Formation.F433, roleByPosition: { [Position.Striker]: RoleKey.FalseNine } }),
    baseline(),
    SEEDS,
  ),
);
