import { Formation, MatchRules, Position, RoleKey, SubstitutionRules, type Team } from "@fut/domain";
import { MatchEventType, MatchSimulator, possessionPercent } from "@fut/engine";
import { buildTeam } from "./teamFactory.js";

// Why does one formation beat another? Break down shot origin (by lane),
// conversion by lane, goal origin, and where the ball is won (by third).
// Run: npx tsx packages/app-cli/src/whyDominates.ts

const sim = new MatchSimulator();
const CENTER = 2; // 5-lane grid

function laneCat(lane: number): string {
  const off = Math.abs(lane - CENTER);
  return off === 0 ? "central" : off === 1 ? "half" : "wide";
}

interface Acc {
  shotsByLane: Record<string, number>;
  goalsByLane: Record<string, number>;
  shots: number;
  goalsOpen: number;
  goalsPen: number;
  // where this team WINS the ball (tackles), by pitch third relative to own goal
  tacklesOwnHalf: number;
  tacklesOppHalf: number;
  possession: number;
}

function emptyAcc(): Acc {
  return {
    shotsByLane: { central: 0, half: 0, wide: 0 },
    goalsByLane: { central: 0, half: 0, wide: 0 },
    shots: 0, goalsOpen: 0, goalsPen: 0,
    tacklesOwnHalf: 0, tacklesOppHalf: 0, possession: 0,
  };
}

/** advancement of a third from a team's own goal (home attacks up, away down). */
function ownHalf(side: "home" | "away", third: number): boolean {
  return side === "home" ? third <= 2 : third >= 2;
}

function run(home: Team, away: Team, seeds: number): { home: Acc; away: Acc } {
  const acc = { home: emptyAcc(), away: emptyAcc() };
  for (let seed = 1; seed <= seeds; seed++) {
    const r = sim.simulate({
      home, away, seed,
      matchRules: MatchRules.league(),
      substitutionRules: SubstitutionRules.brasileirao(),
    });
    const side = (teamId: string) => (teamId === home.id ? "home" : "away");
    const pick = (teamId: string) => (teamId === home.id ? acc.home : acc.away);
    for (const e of r.timeline) {
      if (e.type === MatchEventType.Shot && e.teamId && e.zone) {
        const a = pick(e.teamId);
        a.shots++;
        a.shotsByLane[laneCat(e.zone.lane)]!++;
      } else if (e.type === MatchEventType.Goal && e.teamId) {
        const a = pick(e.teamId);
        if (e.params?.chanceType === "penalty" || !e.zone) a.goalsPen++;
        else {
          a.goalsOpen++;
          a.goalsByLane[laneCat(e.zone.lane)]!++;
          a.shotsByLane[laneCat(e.zone.lane)]!++; // a goal is also a shot attempt
          a.shots++;
        }
      } else if (e.type === MatchEventType.Tackle && e.teamId && e.zone) {
        const a = pick(e.teamId);
        if (ownHalf(side(e.teamId), e.zone.third)) a.tacklesOwnHalf++;
        else a.tacklesOppHalf++;
      }
    }
    acc.home.possession += possessionPercent(r.stats.home, r.stats.away).home;
    acc.away.possession += possessionPercent(r.stats.home, r.stats.away).away;
  }
  return acc;
}

function report(label: string, a: Acc, seeds: number): void {
  const totalGoals = a.goalsOpen + a.goalsPen;
  const conv = (lane: string) =>
    a.shotsByLane[lane]! > 0
      ? `${((a.goalsByLane[lane]! / a.shotsByLane[lane]!) * 100).toFixed(0)}%`
      : "—";
  console.log(`\n${label}`);
  console.log(`  goals/game ${(totalGoals / seeds).toFixed(2)}  (open ${a.goalsOpen}, pen ${a.goalsPen})`);
  console.log(`  shots/game ${(a.shots / seeds).toFixed(1)}`);
  console.log(`  shots by lane : central ${a.shotsByLane.central}  half ${a.shotsByLane.half}  wide ${a.shotsByLane.wide}`);
  console.log(`  goals by lane : central ${a.goalsByLane.central}  half ${a.goalsByLane.half}  wide ${a.goalsByLane.wide}`);
  console.log(`  conversion    : central ${conv("central")}  half ${conv("half")}  wide ${conv("wide")}`);
  console.log(`  ball won      : own half ${a.tacklesOwnHalf}  opp half ${a.tacklesOppHalf}`);
  console.log(`  possession    : ${(a.possession / seeds).toFixed(0)}%`);
}

const SEEDS = 200;
const tFalse9 = () => buildTeam({ id: "af9", name: "false9", shortName: "F9", rating: 65, formation: Formation.F433, roleByPosition: { [Position.Striker]: RoleKey.FalseNine } });
const t442 = () => buildTeam({ id: "b442", name: "4-4-2", shortName: "442", rating: 65, formation: Formation.F442 });

console.log(`=== false9 (home) vs 4-4-2 (away), ${SEEDS} games ===`);
const r = run(tFalse9(), t442(), SEEDS);
report("false9", r.home, SEEDS);
report("4-4-2", r.away, SEEDS);
