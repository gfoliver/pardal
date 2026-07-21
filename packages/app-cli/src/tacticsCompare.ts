import { Formation, MatchRules, SubstitutionRules, type TeamInstructions, type Team } from "@fut/domain";
import { MatchEventType, MatchSimulator, possessionPercent } from "@fut/engine";
import { buildTeam } from "./teamFactory.js";

// Does possession emerge from tactics (patient vs direct)? Run:
//   npx tsx packages/app-cli/src/tacticsCompare.ts

const sim = new MatchSimulator();

interface Acc { poss: number; shots: number; goals: number; passes: number; passC: number; games: number; }
const empty = (): Acc => ({ poss: 0, shots: 0, goals: 0, passes: 0, passC: 0, games: 0 });

function team(id: string, label: string, instr: Partial<TeamInstructions>): Team {
  return buildTeam({ id, name: label, shortName: label, rating: 65, formation: Formation.F442, instructions: instr });
}

/** Play A vs B home-and-away over `seeds`, aggregating each style's numbers. */
function compare(a: Team, b: Team, seeds: number): { a: Acc; b: Acc } {
  const acc = { a: empty(), b: empty() };
  const add = (dst: Acc, r: ReturnType<MatchSimulator["simulate"]>, home: boolean) => {
    const s = home ? r.stats.home : r.stats.away;
    dst.games++;
    dst.poss += home ? possessionPercent(r.stats.home, r.stats.away).home : possessionPercent(r.stats.home, r.stats.away).away;
    dst.shots += s.shots; dst.goals += s.goals; dst.passes += s.passes; dst.passC += s.passesCompleted;
  };
  for (let seed = 1; seed <= seeds; seed++) {
    const r1 = sim.simulate({ home: a, away: b, seed, matchRules: MatchRules.league(), substitutionRules: SubstitutionRules.brasileirao() });
    add(acc.a, r1, true); add(acc.b, r1, false);
    const r2 = sim.simulate({ home: b, away: a, seed: seed + 99991, matchRules: MatchRules.league(), substitutionRules: SubstitutionRules.brasileirao() });
    add(acc.b, r2, true); add(acc.a, r2, false);
  }
  return acc;
}

function report(label: string, x: Acc): void {
  console.log(
    `${label.padEnd(16)} poss ${(x.poss / x.games).toFixed(1)}%  shots ${(x.shots / x.games).toFixed(1)}  goals ${(x.goals / x.games).toFixed(2)}  passAcc ${((x.passC / x.passes) * 100).toFixed(0)}%`,
  );
}

const SEEDS = 150;
const possession = team("poss", "possession", { tempo: 0.15, directness: 0.25, pressing: 0.45 });
const direct = team("dir", "direct", { tempo: 0.9, directness: 0.85, pressing: 0.6 });

console.log(`=== Possession (tempo 0.15) vs Direct (tempo 0.9), ${SEEDS * 2} games ===`);
const r = compare(possession, direct, SEEDS);
report("possession", r.a);
report("direct", r.b);
