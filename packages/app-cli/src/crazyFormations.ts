import { Formation, MatchRules, Position, SubstitutionRules, type Team } from "@fut/domain";
import { MatchSimulator, possessionPercent } from "@fut/engine";
import { buildCustomTeam, buildTeam, type CustomSlot } from "./teamFactory.js";

// Experiment: how does the engine react to absurd formations users might try?
// No tuning — just observation. Run:
//   npx tsx packages/app-cli/src/crazyFormations.ts

const P = Position;
const sl = (position: Position, depth: number, width: number): CustomSlot => ({ position, depth, width });

const crazy: { label: string; slots: CustomSlot[] }[] = [
  {
    label: "5-0-5",
    slots: [
      sl(P.Goalkeeper, 0, 0.5),
      sl(P.FullBack, 0.2, 0.08), sl(P.CentreBack, 0.2, 0.3), sl(P.CentreBack, 0.2, 0.5), sl(P.CentreBack, 0.2, 0.7), sl(P.FullBack, 0.2, 0.92),
      sl(P.Winger, 0.82, 0.08), sl(P.Striker, 0.82, 0.3), sl(P.Striker, 0.82, 0.5), sl(P.Striker, 0.82, 0.7), sl(P.Winger, 0.82, 0.92),
    ],
  },
  {
    label: "3-3-4",
    slots: [
      sl(P.Goalkeeper, 0, 0.5),
      sl(P.CentreBack, 0.2, 0.3), sl(P.CentreBack, 0.2, 0.5), sl(P.CentreBack, 0.2, 0.7),
      sl(P.CentralMidfielder, 0.5, 0.3), sl(P.CentralMidfielder, 0.5, 0.5), sl(P.CentralMidfielder, 0.5, 0.7),
      sl(P.Winger, 0.82, 0.1), sl(P.Striker, 0.82, 0.4), sl(P.Striker, 0.82, 0.6), sl(P.Winger, 0.82, 0.9),
    ],
  },
  {
    label: "2-4-4",
    slots: [
      sl(P.Goalkeeper, 0, 0.5),
      sl(P.CentreBack, 0.2, 0.35), sl(P.CentreBack, 0.2, 0.65),
      sl(P.Winger, 0.5, 0.1), sl(P.CentralMidfielder, 0.5, 0.4), sl(P.CentralMidfielder, 0.5, 0.6), sl(P.Winger, 0.5, 0.9),
      sl(P.Winger, 0.82, 0.1), sl(P.Striker, 0.82, 0.4), sl(P.Striker, 0.82, 0.6), sl(P.Winger, 0.82, 0.9),
    ],
  },
  {
    label: "5-5-0",
    slots: [
      sl(P.Goalkeeper, 0, 0.5),
      sl(P.FullBack, 0.18, 0.08), sl(P.CentreBack, 0.18, 0.3), sl(P.CentreBack, 0.18, 0.5), sl(P.CentreBack, 0.18, 0.7), sl(P.FullBack, 0.18, 0.92),
      sl(P.Winger, 0.55, 0.08), sl(P.CentralMidfielder, 0.55, 0.3), sl(P.CentralMidfielder, 0.55, 0.5), sl(P.CentralMidfielder, 0.55, 0.7), sl(P.Winger, 0.55, 0.92),
    ],
  },
];

const sim = new MatchSimulator();
const SEEDS = 200;

function baseline(): Team {
  return buildTeam({ id: "base", name: "4-4-2", shortName: "442", rating: 65, formation: Formation.F442 });
}

console.log(`Each crazy formation vs a normal 4-4-2 (rating 65), ${SEEDS} games\n`);
console.log(`${"Formation".padEnd(10)} ${"GF/g".padStart(5)} ${"GA/g".padStart(5)} ${"shots".padStart(6)} ${"conc.sh".padStart(7)} ${"poss".padStart(5)}  vs 4-4-2`);

for (const c of crazy) {
  const team = buildCustomTeam({ id: c.label, name: c.label, shortName: c.label, rating: 65, slots: c.slots });
  let gf = 0, ga = 0, shots = 0, shotsAg = 0, poss = 0, w = 0, d = 0, l = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const r = sim.simulate({
      home: team, away: baseline(), seed,
      matchRules: MatchRules.league(), substitutionRules: SubstitutionRules.brasileirao(),
    });
    gf += r.homeScore; ga += r.awayScore;
    shots += r.stats.home.shots; shotsAg += r.stats.away.shots;
    poss += possessionPercent(r.stats.home, r.stats.away).home;
    if (r.homeScore > r.awayScore) w++; else if (r.homeScore < r.awayScore) l++; else d++;
  }
  const g = SEEDS;
  console.log(
    `${c.label.padEnd(10)} ${(gf / g).toFixed(2).padStart(5)} ${(ga / g).toFixed(2).padStart(5)} ${(shots / g).toFixed(1).padStart(6)} ${(shotsAg / g).toFixed(1).padStart(7)} ${(poss / g).toFixed(0).padStart(4)}%  ${w}W-${d}D-${l}L`,
  );
}
