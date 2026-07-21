import { MatchRules, SubstitutionRules } from "@fut/domain";
import { MatchEventType, MatchSimulator, possessionPercent } from "@fut/engine";
import { buildTeam } from "./teamFactory.js";

// Ad-hoc calibration harness: averages key stats over many even matches.
const N = 80;
const sim = new MatchSimulator();
const acc = {
  goals: 0,
  shots: 0,
  onTarget: 0,
  passes: 0,
  passesCompleted: 0,
  tackles: 0,
  fouls: 0,
  offsides: 0,
  corners: 0,
  yellow: 0,
  red: 0,
  possHome: 0,
  injuries: 0,
};

for (let seed = 1; seed <= N; seed++) {
  const r = sim.simulate({
    home: buildTeam({ id: "home", name: "Home", shortName: "HOM", rating: 65 }),
    away: buildTeam({ id: "away", name: "Away", shortName: "AWY", rating: 65 }),
    seed,
    matchRules: MatchRules.league(),
    substitutionRules: SubstitutionRules.brasileirao(),
  });
  for (const s of [r.stats.home, r.stats.away]) {
    acc.goals += s.goals;
    acc.shots += s.shots;
    acc.onTarget += s.shotsOnTarget;
    acc.passes += s.passes;
    acc.passesCompleted += s.passesCompleted;
    acc.tackles += s.tackles;
    acc.fouls += s.fouls;
    acc.offsides += s.offsides;
    acc.corners += s.corners;
    acc.yellow += s.yellowCards;
    acc.red += s.redCards;
  }
  acc.possHome += possessionPercent(r.stats.home, r.stats.away).home;
  acc.injuries += r.timeline.filter((e) => e.type === MatchEventType.Injury).length;
}

const perTeam = (x: number) => (x / (N * 2)).toFixed(2);
console.log(`Matches: ${N} (even teams, rating 65, league)`);
console.log(`Per team per match:`);
console.log(`  goals        ${perTeam(acc.goals)}`);
console.log(`  shots        ${perTeam(acc.shots)}`);
console.log(`  onTarget     ${perTeam(acc.onTarget)}`);
console.log(`  passes       ${perTeam(acc.passes)}`);
console.log(`  passAcc      ${((acc.passesCompleted / acc.passes) * 100).toFixed(1)}%`);
console.log(`  tackles      ${perTeam(acc.tackles)}`);
console.log(`  fouls        ${perTeam(acc.fouls)}`);
console.log(`  offsides     ${perTeam(acc.offsides)}`);
console.log(`  corners      ${perTeam(acc.corners)}`);
console.log(`  yellow       ${perTeam(acc.yellow)}`);
console.log(`  red          ${perTeam(acc.red)}`);
console.log(`  avg possession(home) ${(acc.possHome / N).toFixed(1)}%`);
console.log(`Injuries per MATCH (both teams): ${(acc.injuries / N).toFixed(2)}`);
