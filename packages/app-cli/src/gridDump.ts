import { Formation, MatchRules, Position, SubstitutionRules } from "@fut/domain";
import { MatchState, PositioningModel } from "@fut/engine";
import { buildTeam } from "./teamFactory.js";

// Prints where each formation places the HOME team on the 3x3 grid, in
// possession with the ball at the centre. Run:
//   npx tsx packages/app-cli/src/gridDump.ts

const LABEL: Record<Position, string> = {
  [Position.Goalkeeper]: "GK",
  [Position.CentreBack]: "CB",
  [Position.FullBack]: "FB",
  [Position.WingBack]: "WB",
  [Position.DefensiveMidfielder]: "DM",
  [Position.CentralMidfielder]: "CM",
  [Position.AttackingMidfielder]: "AM",
  [Position.Winger]: "WG",
  [Position.Striker]: "ST",
};

function dump(formation: Formation, label: string): void {
  const home = buildTeam({ id: "h", name: "H", shortName: "H", rating: 65, formation });
  const away = buildTeam({ id: "a", name: "A", shortName: "A", rating: 65 });
  const state = new MatchState(home, away, MatchRules.league(), SubstitutionRules.brasileirao(), undefined);
  new PositioningModel().assign(state);
  const { thirds, lanes } = state.grid;

  const grid: string[][][] = Array.from({ length: thirds }, () =>
    Array.from({ length: lanes }, () => [] as string[]),
  );
  for (const p of state.onPitchPlayers(home.id)) {
    const z = state.positions.get(p.id)!;
    grid[z.third]![z.lane]!.push(LABEL[state.fieldedPositionOf(p.id)]);
  }

  const laneHeader = Array.from({ length: lanes }, (_, l) =>
    (l === 0 ? "L" : l === lanes - 1 ? "R" : l === state.grid.centerLane ? "C" : `${l}`).padEnd(9),
  ).join(" ");
  console.log(`\n=== ${label} (home, in possession, ball at centre) ===`);
  console.log(`band   ${laneHeader}`);
  for (let third = thirds - 1; third >= 0; third--) {
    const tag = third === state.grid.attackingThird("home") ? "ATT" : third === 0 ? "DEF" : `b${third}`;
    const cells = Array.from({ length: lanes }, (_, lane) => {
      const list = grid[third]![lane]!;
      return (list.length ? list.join(",") : "·").padEnd(9);
    });
    console.log(`${tag.padEnd(4)}  ${cells.join(" ")}`);
  }
}

dump(Formation.F442, "4-4-2 (flat, wingers)");
dump(Formation.F442Diamond, "4-4-2 diamond (narrow)");
dump(Formation.F433, "4-3-3");
dump(Formation.F352, "3-5-2");
dump(Formation.F541, "5-4-1");
