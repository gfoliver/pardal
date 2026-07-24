import { Mentality, type TeamInstructions } from "@fut/domain";
import { possessionPercent } from "@fut/engine";
import { MatchEngine } from "@fut/spatial";
import { buildTeam } from "./teamFactory.js";

/**
 * Scenario battery for the spatial engine. Runs several fixtures (mirror and
 * mismatched) and reports per-side output so we can see the scoreline average
 * AND that quality/mentality tilt results the right way.
 *
 * Run: npx tsx packages/app-cli/src/scenarios.ts
 */
interface Side {
  rating: number;
  mentality?: Mentality;
  instructions?: Partial<TeamInstructions>;
  label: string;
}

function run(name: string, n: number, home: Side, away: Side): void {
  const acc = {
    hg: 0, ag: 0, hsh: 0, ash: 0, hot: 0, aot: 0, poss: 0,
    hw: 0, dr: 0, aw: 0, total: 0,
  };
  const scores: string[] = [];
  for (let seed = 1; seed <= n; seed++) {
    const h = buildTeam({ id: "home", name: "Home", shortName: "HOM", rating: home.rating, mentality: home.mentality, instructions: home.instructions });
    const a = buildTeam({ id: "away", name: "Away", shortName: "AWY", rating: away.rating, mentality: away.mentality, instructions: away.instructions });
    const eng = new MatchEngine(h, a, seed);
    let t = 0;
    while (!eng.finished && t < 80000) { eng.tick(0.1); t++; }
    const hs = eng.stats.home, as = eng.stats.away;
    acc.hg += hs.goals; acc.ag += as.goals; acc.hsh += hs.shots; acc.ash += as.shots;
    acc.hot += hs.shotsOnTarget; acc.aot += as.shotsOnTarget;
    acc.poss += possessionPercent(hs, as).home;
    acc.total += hs.goals + as.goals;
    if (eng.score.home > eng.score.away) acc.hw++;
    else if (eng.score.home < eng.score.away) acc.aw++;
    else acc.dr++;
    scores.push(`${eng.score.home}-${eng.score.away}`);
  }
  const f = (x: number) => (x / n).toFixed(2);
  console.log(`\n=== ${name} (${n} games) ===`);
  console.log(`  HOME ${home.label} (ovr ${home.rating})   vs   AWAY ${away.label} (ovr ${away.rating})`);
  console.log(`  goals/game      home ${f(acc.hg)}  away ${f(acc.ag)}   TOTAL ${f(acc.total)}`);
  console.log(`  shots/game      home ${f(acc.hsh)}  away ${f(acc.ash)}`);
  console.log(`  on-target/game  home ${f(acc.hot)}  away ${f(acc.aot)}`);
  console.log(`  possession home ${(acc.poss / n).toFixed(0)}%`);
  console.log(`  record (home)   ${acc.hw}W ${acc.dr}D ${acc.aw}L  → home win ${((acc.hw / n) * 100).toFixed(0)}%`);
  console.log(`  scores: ${scores.join(" ")}`);
}

// 1) 100 games, mirror ovr 80 (balanced both).
run("Mirror 80 v 80", 100, { rating: 80, label: "Balanced" }, { rating: 80, label: "Balanced" });

// 2) 30 games, ovr 85 attacking vs ovr 77 counter-attack (sit deep + direct).
run(
  "85 Attacking v 77 Counter",
  30,
  { rating: 85, mentality: Mentality.Attacking, label: "Attacking" },
  { rating: 77, mentality: Mentality.Defensive, instructions: { directness: 0.85, lineHeight: 0.28 }, label: "Counter" },
);

// 3) 30 games, mirror-tactics ovr 90 vs ovr 80 (quality gap only).
run("90 v 80 (balanced)", 30, { rating: 90, label: "Balanced" }, { rating: 80, label: "Balanced" });
