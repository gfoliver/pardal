import { Formation, MatchRules, Position, RoleKey, SubstitutionRules, type Team } from "@fut/domain";
import { MatchSimulator } from "@fut/engine";
import { buildTeam } from "./teamFactory.js";

// Experiment (user request): take the 4-3-3 and vary the role of every outfield
// position EXCEPT centre-back and goalkeeper, over the full cross product. The
// question: is a "false 9" (or any striker role) only viable with the right
// SUPPORTING cast (runners in midfield, inside forwards, overlapping backs)?
// Each combination plays a neutral 4-4-2 (default roles) home & away over N
// seeds; we rank by points-per-game and surface the best system per striker role.
//   npx tsx packages/app-cli/src/roleSweep433.ts

const POOL: Record<string, { pos: Position; roles: RoleKey[] }> = {
  fb: { pos: Position.FullBack, roles: [RoleKey.DefensiveFullBack, RoleKey.WingBack] },
  dm: { pos: Position.DefensiveMidfielder, roles: [RoleKey.BallWinningMidfielder, RoleKey.DeepLyingPlaymaker, RoleKey.BoxToBox] },
  cm: { pos: Position.CentralMidfielder, roles: [RoleKey.BoxToBox, RoleKey.DeepLyingPlaymaker, RoleKey.AttackingMidfielder] },
  wg: { pos: Position.Winger, roles: [RoleKey.Winger, RoleKey.InsideForward] },
  st: { pos: Position.Striker, roles: [RoleKey.Poacher, RoleKey.TargetMan, RoleKey.FalseNine, RoleKey.InfiltratingForward] },
};

const SHORT: Partial<Record<RoleKey, string>> = {
  [RoleKey.DefensiveFullBack]: "dFB", [RoleKey.WingBack]: "WB",
  [RoleKey.BallWinningMidfielder]: "BWM", [RoleKey.DeepLyingPlaymaker]: "DLP", [RoleKey.BoxToBox]: "B2B",
  [RoleKey.AttackingMidfielder]: "AM", [RoleKey.Winger]: "WG", [RoleKey.InsideForward]: "IF",
  [RoleKey.Poacher]: "Poach", [RoleKey.TargetMan]: "TgtM", [RoleKey.FalseNine]: "F9", [RoleKey.InfiltratingForward]: "InfF",
};

interface Combo { fb: RoleKey; dm: RoleKey; cm: RoleKey; wg: RoleKey; st: RoleKey; }

function label(c: Combo): string {
  return `FB:${SHORT[c.fb]} DM:${SHORT[c.dm]} CM:${SHORT[c.cm]} WG:${SHORT[c.wg]} ST:${SHORT[c.st]}`;
}

function comboTeam(c: Combo): Team {
  return buildTeam({
    id: "cand", name: "cand", shortName: "CND", rating: 65, formation: Formation.F433,
    roleByPosition: {
      [Position.FullBack]: c.fb,
      [Position.DefensiveMidfielder]: c.dm,
      [Position.CentralMidfielder]: c.cm,
      [Position.Winger]: c.wg,
      [Position.Striker]: c.st,
    },
  });
}

const sim = new MatchSimulator();
const SEEDS = 24;
const baseline = () => buildTeam({ id: "base", name: "4-4-2", shortName: "442", rating: 65, formation: Formation.F442 });

interface Result { c: Combo; pts: number; games: number; gf: number; ga: number; shots: number; }

function evaluate(c: Combo): Result {
  const team = comboTeam(c);
  let pts = 0, games = 0, gf = 0, ga = 0, shots = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    // home
    let r = sim.simulate({ home: team, away: baseline(), seed, matchRules: MatchRules.league(), substitutionRules: SubstitutionRules.brasileirao() });
    gf += r.homeScore; ga += r.awayScore; shots += r.stats.home.shots; games++;
    pts += r.homeScore > r.awayScore ? 3 : r.homeScore === r.awayScore ? 1 : 0;
    // away
    r = sim.simulate({ home: baseline(), away: team, seed: seed + 1000, matchRules: MatchRules.league(), substitutionRules: SubstitutionRules.brasileirao() });
    gf += r.awayScore; ga += r.homeScore; shots += r.stats.away.shots; games++;
    pts += r.awayScore > r.homeScore ? 3 : r.awayScore === r.homeScore ? 1 : 0;
  }
  return { c, pts, games, gf, ga, shots };
}

const results: Result[] = [];
for (const fb of POOL.fb!.roles)
  for (const dm of POOL.dm!.roles)
    for (const cm of POOL.cm!.roles)
      for (const wg of POOL.wg!.roles)
        for (const st of POOL.st!.roles)
          results.push(evaluate({ fb, dm, cm, wg, st }));

results.sort((a, b) => b.pts / b.games - a.pts / a.games);
const ppg = (r: Result) => (r.pts / r.games).toFixed(2);
const row = (r: Result) => `${ppg(r)}  GF ${(r.gf / r.games).toFixed(2)}  GA ${(r.ga / r.games).toFixed(2)}  sh ${(r.shots / r.games).toFixed(1)}   ${label(r.c)}`;

console.log(`4-3-3 role sweep vs neutral 4-4-2 — ${results.length} combos, ${SEEDS * 2} games each\n`);
console.log(`--- TOP 12 ---`);
for (const r of results.slice(0, 12)) console.log("  " + row(r));
console.log(`\n--- BOTTOM 6 ---`);
for (const r of results.slice(-6)) console.log("  " + row(r));

console.log(`\n--- BEST system per striker role ---`);
for (const st of POOL.st!.roles) {
  const best = results.filter((r) => r.c.st === st).sort((a, b) => b.pts / b.games - a.pts / a.games)[0]!;
  const worst = results.filter((r) => r.c.st === st).sort((a, b) => b.pts / b.games - a.pts / a.games).slice(-1)[0]!;
  console.log(`  ST=${SHORT[st]}: best ${ppg(best)}  worst ${ppg(worst)}   | best = ${label(best.c)}`);
}

// Reference: the "naive false 9" I was testing before (only ST changed, rest default 4-3-3 roles).
console.log(`\n--- reference: naive false9 (only ST=F9, rest DEFAULT 4-3-3 roles) ---`);
const naive = buildTeam({ id: "naive", name: "naive", shortName: "NAI", rating: 65, formation: Formation.F433, roleByPosition: { [Position.Striker]: RoleKey.FalseNine } });
let npts = 0, ng = 0, ngf = 0, nga = 0, nsh = 0;
for (let seed = 1; seed <= SEEDS; seed++) {
  let r = sim.simulate({ home: naive, away: baseline(), seed, matchRules: MatchRules.league(), substitutionRules: SubstitutionRules.brasileirao() });
  ngf += r.homeScore; nga += r.awayScore; nsh += r.stats.home.shots; ng++; npts += r.homeScore > r.awayScore ? 3 : r.homeScore === r.awayScore ? 1 : 0;
  r = sim.simulate({ home: baseline(), away: naive, seed: seed + 1000, matchRules: MatchRules.league(), substitutionRules: SubstitutionRules.brasileirao() });
  ngf += r.awayScore; nga += r.homeScore; nsh += r.stats.away.shots; ng++; npts += r.awayScore > r.homeScore ? 3 : r.awayScore === r.homeScore ? 1 : 0;
}
console.log(`  ${(npts / ng).toFixed(2)}  GF ${(ngf / ng).toFixed(2)}  GA ${(nga / ng).toFixed(2)}  sh ${(nsh / ng).toFixed(1)}`);
