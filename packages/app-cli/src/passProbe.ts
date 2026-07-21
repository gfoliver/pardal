import { Formation, MatchRules, Position, SubstitutionRules } from "@fut/domain";
import { MatchSimulator, PASS_DEBUG } from "@fut/engine";
import { buildCustomTeam, buildTeam, type CustomSlot } from "./teamFactory.js";

// Root-cause probe for pass accuracy + no-midfield punishment. Runs matches with
// PASS_DEBUG on and prints the average pass situation (interceptors at target,
// pressure on carrier, long-ball fraction, carrier support, resulting successP).
//   npx tsx packages/app-cli/src/passProbe.ts

const P = Position;
const sl = (position: Position, depth: number, width: number): CustomSlot => ({ position, depth, width });

const noMidfield: CustomSlot[] = [
  sl(P.Goalkeeper, 0, 0.5),
  sl(P.FullBack, 0.2, 0.08), sl(P.CentreBack, 0.2, 0.3), sl(P.CentreBack, 0.2, 0.5), sl(P.CentreBack, 0.2, 0.7), sl(P.FullBack, 0.2, 0.92),
  sl(P.Winger, 0.82, 0.08), sl(P.Striker, 0.82, 0.3), sl(P.Striker, 0.82, 0.5), sl(P.Striker, 0.82, 0.7), sl(P.Winger, 0.82, 0.92),
];

const sim = new MatchSimulator();
const N = 60;

function probe(label: string, home: () => ReturnType<typeof buildTeam>): void {
  PASS_DEBUG.on = true;
  PASS_DEBUG.reset();
  for (let seed = 1; seed <= N; seed++) {
    sim.simulate({
      home: home(),
      away: buildTeam({ id: "away", name: "Away", shortName: "AWY", rating: 65, formation: Formation.F442 }),
      seed,
      matchRules: MatchRules.league(),
      substitutionRules: SubstitutionRules.brasileirao(),
    });
  }
  const n = PASS_DEBUG.n || 1;
  console.log(
    `${label.padEnd(12)} n=${String(PASS_DEBUG.n).padStart(6)}  interceptors=${(PASS_DEBUG.interceptors / n).toFixed(2)}  pressure=${(PASS_DEBUG.pressure / n).toFixed(2)}  longBall%=${((PASS_DEBUG.longBalls / n) * 100).toFixed(0)}  support=${(PASS_DEBUG.support / n).toFixed(2)}  avgSuccessP=${(PASS_DEBUG.successP / n).toFixed(3)}`,
  );
}

console.log(`Pass-situation probe (home formation vs 4-4-2), ${N} games each\n`);
probe("4-4-2", () => buildTeam({ id: "h", name: "H", shortName: "H", rating: 65, formation: Formation.F442 }));
probe("4-3-3", () => buildTeam({ id: "h", name: "H", shortName: "H", rating: 65, formation: Formation.F433 }));
probe("3-5-2", () => buildTeam({ id: "h", name: "H", shortName: "H", rating: 65, formation: Formation.F352 }));
probe("5-0-5", () => buildCustomTeam({ id: "h", name: "H", shortName: "H", rating: 65, slots: noMidfield }));
PASS_DEBUG.on = false;
