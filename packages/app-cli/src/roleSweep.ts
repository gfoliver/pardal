import { Formation, getFormationTemplate, MatchRules, Position, RoleKey, SubstitutionRules, type Team } from "@fut/domain";
import { MatchSimulator } from "@fut/engine";
import { buildTeam } from "./teamFactory.js";

// Generic role-optimisation sweep for ANY formation: vary the role of every
// outfield position present in the shape (except centre-back and goalkeeper)
// over the full cross product, play each combo vs a neutral 4-4-2 home & away,
// and rank by points-per-game. Surfaces each formation's OPTIMAL role system.
//   npx tsx packages/app-cli/src/roleSweep.ts F433
//   npx tsx packages/app-cli/src/roleSweep.ts F442 F352 ...   (multiple)

const POOL: Partial<Record<Position, RoleKey[]>> = {
  [Position.FullBack]: [RoleKey.DefensiveFullBack, RoleKey.WingBack],
  [Position.WingBack]: [RoleKey.WingBack, RoleKey.DefensiveFullBack],
  [Position.DefensiveMidfielder]: [RoleKey.BallWinningMidfielder, RoleKey.DeepLyingPlaymaker, RoleKey.BoxToBox],
  [Position.CentralMidfielder]: [RoleKey.BoxToBox, RoleKey.DeepLyingPlaymaker, RoleKey.AttackingMidfielder],
  [Position.AttackingMidfielder]: [RoleKey.AttackingMidfielder],
  [Position.Winger]: [RoleKey.Winger, RoleKey.InsideForward],
  [Position.Striker]: [RoleKey.Poacher, RoleKey.TargetMan, RoleKey.FalseNine, RoleKey.InfiltratingForward],
};

const SHORT: Partial<Record<RoleKey, string>> = {
  [RoleKey.DefensiveFullBack]: "dFB", [RoleKey.WingBack]: "WB",
  [RoleKey.BallWinningMidfielder]: "BWM", [RoleKey.DeepLyingPlaymaker]: "DLP", [RoleKey.BoxToBox]: "B2B",
  [RoleKey.AttackingMidfielder]: "AM", [RoleKey.Winger]: "WG", [RoleKey.InsideForward]: "IF",
  [RoleKey.Poacher]: "Poach", [RoleKey.TargetMan]: "TgtM", [RoleKey.FalseNine]: "F9", [RoleKey.InfiltratingForward]: "InfF",
};

const POS_LABEL: Partial<Record<Position, string>> = {
  [Position.FullBack]: "FB", [Position.WingBack]: "WB", [Position.DefensiveMidfielder]: "DM",
  [Position.CentralMidfielder]: "CM", [Position.AttackingMidfielder]: "AM", [Position.Winger]: "WG", [Position.Striker]: "ST",
};

/** Distinct varied positions present in a formation (excluding GK & CB). */
function variedPositions(formation: Formation): Position[] {
  const present = new Set(getFormationTemplate(formation).map((s) => s.position));
  const order = [Position.FullBack, Position.WingBack, Position.DefensiveMidfielder, Position.CentralMidfielder, Position.AttackingMidfielder, Position.Winger, Position.Striker];
  return order.filter((p) => present.has(p) && (POOL[p]?.length ?? 0) > 0);
}

const sim = new MatchSimulator();
const SEEDS = 20;
const baseline = () => buildTeam({ id: "base", name: "4-4-2", shortName: "442", rating: 65, formation: Formation.F442 });

interface Result { roleByPosition: Partial<Record<Position, RoleKey>>; pts: number; games: number; gf: number; ga: number; }

function evaluate(formation: Formation, roleByPosition: Partial<Record<Position, RoleKey>>): Result {
  const team = buildTeam({ id: "cand", name: "cand", shortName: "CND", rating: 65, formation, roleByPosition });
  let pts = 0, games = 0, gf = 0, ga = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    let r = sim.simulate({ home: team, away: baseline(), seed, matchRules: MatchRules.league(), substitutionRules: SubstitutionRules.brasileirao() });
    gf += r.homeScore; ga += r.awayScore; games++; pts += r.homeScore > r.awayScore ? 3 : r.homeScore === r.awayScore ? 1 : 0;
    r = sim.simulate({ home: baseline(), away: team, seed: seed + 1000, matchRules: MatchRules.league(), substitutionRules: SubstitutionRules.brasileirao() });
    gf += r.awayScore; ga += r.homeScore; games++; pts += r.awayScore > r.homeScore ? 3 : r.awayScore === r.homeScore ? 1 : 0;
  }
  return { roleByPosition, pts, games, gf, ga };
}

function label(formation: Formation, rbp: Partial<Record<Position, RoleKey>>): string {
  return variedPositions(formation).map((p) => `${POS_LABEL[p]}:${SHORT[rbp[p]!]}`).join(" ");
}

function sweep(formation: Formation): void {
  const positions = variedPositions(formation);
  let combos: Partial<Record<Position, RoleKey>>[] = [{}];
  for (const pos of positions) {
    const next: Partial<Record<Position, RoleKey>>[] = [];
    for (const base of combos) for (const role of POOL[pos]!) next.push({ ...base, [pos]: role });
    combos = next;
  }
  const results = combos.map((c) => evaluate(formation, c)).sort((a, b) => b.pts / b.games - a.pts / a.games);
  const ppg = (r: Result) => (r.pts / r.games).toFixed(2);
  const row = (r: Result) => `${ppg(r)}  GF ${(r.gf / r.games).toFixed(2)}  GA ${(r.ga / r.games).toFixed(2)}   ${label(formation, r.roleByPosition)}`;
  console.log(`\n===== ${formation} — ${results.length} combos, ${SEEDS * 2} games each =====`);
  console.log(`TOP 5:`);
  for (const r of results.slice(0, 5)) console.log("  " + row(r));
  console.log(`BOTTOM 3:`);
  for (const r of results.slice(-3)) console.log("  " + row(r));
  // Winger-vs-InsideForward check (if the shape has wingers).
  if (positions.includes(Position.Winger)) {
    const bestWG = results.filter((r) => r.roleByPosition[Position.Winger] === RoleKey.Winger)[0];
    const bestIF = results.filter((r) => r.roleByPosition[Position.Winger] === RoleKey.InsideForward)[0];
    if (bestWG && bestIF) console.log(`  width check → best WG:Winger ${ppg(bestWG)}   best WG:InsideForward ${ppg(bestIF)}`);
  }
  console.log(`  BEST role setup: { ${variedPositions(formation).map((p) => `${POS_LABEL[p]}=${SHORT[results[0]!.roleByPosition[p]!]}`).join(", ")} }`);
}

const args = process.argv.slice(2);
const formations = (args.length ? args : ["F433"]).map((a) => Formation[a as keyof typeof Formation]).filter(Boolean);
for (const f of formations) sweep(f);
