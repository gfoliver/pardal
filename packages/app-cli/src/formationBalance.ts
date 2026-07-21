import { Formation, Position, RoleKey, MatchRules, SubstitutionRules } from "@fut/domain";
import { MatchSimulator, possessionPercent } from "@fut/engine";
import { buildTeam } from "./teamFactory.js";

// Formation & role balance harness: every setup vs every other, home & away,
// over many seeds. All teams are identical except shape/roles, so differences
// isolate how the engine handles each tactical setup.
// Run: npx tsx packages/app-cli/src/formationBalance.ts

interface Setup {
  label: string;
  formation: Formation;
  roleByPosition?: Partial<Record<Position, RoleKey>>;
}

// Each formation fielded with its OPTIMISED role system (from roleSweep.ts),
// so the league measures each shape at its potential, not with default roles.
const P = Position;
const setups: Setup[] = [
  { label: "4-4-2", formation: Formation.F442, roleByPosition: { [P.FullBack]: RoleKey.WingBack, [P.CentralMidfielder]: RoleKey.DeepLyingPlaymaker, [P.Winger]: RoleKey.Winger, [P.Striker]: RoleKey.Poacher } },
  { label: "4-4-2 diamond", formation: Formation.F442Diamond, roleByPosition: { [P.FullBack]: RoleKey.DefensiveFullBack, [P.DefensiveMidfielder]: RoleKey.BallWinningMidfielder, [P.CentralMidfielder]: RoleKey.BoxToBox, [P.AttackingMidfielder]: RoleKey.AttackingMidfielder, [P.Striker]: RoleKey.InfiltratingForward } },
  { label: "4-3-3", formation: Formation.F433, roleByPosition: { [P.FullBack]: RoleKey.WingBack, [P.DefensiveMidfielder]: RoleKey.BoxToBox, [P.CentralMidfielder]: RoleKey.AttackingMidfielder, [P.Winger]: RoleKey.InsideForward, [P.Striker]: RoleKey.InfiltratingForward } },
  { label: "4-2-3-1", formation: Formation.F4231, roleByPosition: { [P.FullBack]: RoleKey.DefensiveFullBack, [P.DefensiveMidfielder]: RoleKey.BoxToBox, [P.AttackingMidfielder]: RoleKey.AttackingMidfielder, [P.Winger]: RoleKey.InsideForward, [P.Striker]: RoleKey.Poacher } },
  { label: "4-2-4", formation: Formation.F424, roleByPosition: { [P.FullBack]: RoleKey.DefensiveFullBack, [P.CentralMidfielder]: RoleKey.DeepLyingPlaymaker, [P.Winger]: RoleKey.InsideForward, [P.Striker]: RoleKey.FalseNine } },
  { label: "3-5-2", formation: Formation.F352, roleByPosition: { [P.WingBack]: RoleKey.WingBack, [P.CentralMidfielder]: RoleKey.DeepLyingPlaymaker, [P.Striker]: RoleKey.Poacher } },
  { label: "3-4-3", formation: Formation.F343, roleByPosition: { [P.WingBack]: RoleKey.WingBack, [P.CentralMidfielder]: RoleKey.BoxToBox, [P.Winger]: RoleKey.InsideForward, [P.Striker]: RoleKey.Poacher } },
  { label: "5-4-1", formation: Formation.F541, roleByPosition: { [P.WingBack]: RoleKey.DefensiveFullBack, [P.CentralMidfielder]: RoleKey.BoxToBox, [P.Winger]: RoleKey.InsideForward, [P.Striker]: RoleKey.TargetMan } },
  { label: "5-3-2", formation: Formation.F532, roleByPosition: { [P.WingBack]: RoleKey.WingBack, [P.DefensiveMidfielder]: RoleKey.DeepLyingPlaymaker, [P.CentralMidfielder]: RoleKey.BoxToBox, [P.Striker]: RoleKey.Poacher } },
];

const SEEDS = 40; // per ordered pair
const n = setups.length;
const sim = new MatchSimulator();

const teams = setups.map((s) =>
  buildTeam({
    id: s.label,
    name: s.label,
    shortName: s.label,
    rating: 65,
    formation: s.formation,
    roleByPosition: s.roleByPosition,
  }),
);

interface Agg {
  played: number; w: number; d: number; l: number;
  gf: number; ga: number; shots: number; possSum: number;
}
const agg: Agg[] = setups.map(() => ({
  played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, shots: 0, possSum: 0,
}));
// gdMatrix[i][j] = total goal difference of i vs j, from i's perspective.
const gdMatrix: number[][] = setups.map(() => setups.map(() => 0));

for (let seed = 1; seed <= SEEDS; seed++) {
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const r = sim.simulate({
        home: teams[i]!,
        away: teams[j]!,
        seed: (seed * 10000 + i * 100 + j) >>> 0,
        matchRules: MatchRules.league(),
        substitutionRules: SubstitutionRules.brasileirao(),
      });
      const home = agg[i]!;
      const away = agg[j]!;
      home.played++; away.played++;
      home.gf += r.homeScore; home.ga += r.awayScore;
      away.gf += r.awayScore; away.ga += r.homeScore;
      home.shots += r.stats.home.shots;
      away.shots += r.stats.away.shots;
      const poss = possessionPercent(r.stats.home, r.stats.away);
      home.possSum += poss.home; away.possSum += poss.away;
      if (r.homeScore > r.awayScore) { home.w++; away.l++; }
      else if (r.homeScore < r.awayScore) { away.w++; home.l++; }
      else { home.d++; away.d++; }
      gdMatrix[i]![j]! += r.homeScore - r.awayScore;
      gdMatrix[j]![i]! += r.awayScore - r.homeScore;
    }
  }
}

const rows = setups.map((s, i) => {
  const a = agg[i]!;
  const points = a.w * 3 + a.d;
  return {
    label: s.label,
    ppg: points / a.played,
    record: `${a.w}-${a.d}-${a.l}`,
    gfpg: a.gf / a.played,
    gapg: a.ga / a.played,
    gdpg: (a.gf - a.ga) / a.played,
    shotspg: a.shots / a.played,
    poss: a.possSum / a.played,
  };
});
rows.sort((x, y) => y.ppg - x.ppg);

console.log(`Formation & role balance — ${SEEDS} seeds/pair, ${agg[0]!.played} games each, rating 65\n`);
console.log(
  `${"Setup".padEnd(16)} ${"PPG".padStart(5)} ${"W-D-L".padStart(12)} ${"GF/g".padStart(5)} ${"GA/g".padStart(5)} ${"GD/g".padStart(6)} ${"Sh/g".padStart(5)} ${"Poss".padStart(5)}`,
);
for (const r of rows) {
  console.log(
    `${r.label.padEnd(16)} ${r.ppg.toFixed(2).padStart(5)} ${r.record.padStart(12)} ${r.gfpg.toFixed(2).padStart(5)} ${r.gapg.toFixed(2).padStart(5)} ${r.gdpg.toFixed(2).padStart(6)} ${r.shotspg.toFixed(1).padStart(5)} ${r.poss.toFixed(0).padStart(4)}%`,
  );
}

// Head-to-head: average goal difference per game, row vs col (+ = row better).
const codes = setups.map((_, i) => `f${i}`);
console.log(`\nHead-to-head avg GD per game (row vs col):`);
console.log(setups.map((s, i) => `${codes[i]} = ${s.label}`).join("   "));
console.log(`${"".padEnd(6)}${codes.map((c) => c.padStart(7)).join("")}`);
for (let i = 0; i < n; i++) {
  const cells = codes.map((_, j) =>
    i === j ? "—".padStart(7) : (gdMatrix[i]![j]! / (SEEDS * 2)).toFixed(2).padStart(7),
  );
  console.log(`${codes[i]!.padEnd(6)}${cells.join("")}`);
}
