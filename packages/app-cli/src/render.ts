import {
  DecidedBy,
  possessionPercent,
  type MatchResult,
} from "@fut/engine";
import { type Catalog, type RenderContext } from "@fut/i18n";

/** Render a MatchResult to a locale-specific, terminal-friendly string. */
export function renderMatch(result: MatchResult, catalog: Catalog): string {
  const ctx: RenderContext = {
    teamName: (id) =>
      id === result.homeTeamId
        ? result.homeTeamName
        : id === result.awayTeamId
          ? result.awayTeamName
          : "",
  };

  const lines: string[] = [];
  lines.push(
    `${result.homeTeamName} vs ${result.awayTeamName}  (${catalog.phrase("seed")}: ${result.seed})`,
  );
  lines.push("");

  // Timeline (narratable events only).
  lines.push(`── ${catalog.phrase("timeline")} ──`);
  for (const event of result.timeline) {
    const text = catalog.renderEvent(event, ctx);
    if (!text) continue;
    const minute = event.minute > 0 ? `${event.minute}'`.padStart(4) : "    ";
    lines.push(`${minute}  ${text}`);
  }
  lines.push("");

  // Statistics.
  lines.push(`── ${catalog.phrase("statistics")} ──`);
  const pos = possessionPercent(result.stats.home, result.stats.away);
  const row = (label: string, home: string, away: string) =>
    `${home.padStart(6)}  ${label.padEnd(18)}  ${away.padEnd(6)}`;
  lines.push(row(catalog.label("possession"), `${pos.home}%`, `${pos.away}%`));
  lines.push(
    row(
      catalog.label("shots"),
      String(result.stats.home.shots),
      String(result.stats.away.shots),
    ),
  );
  lines.push(
    row(
      catalog.label("shotsOnTarget"),
      String(result.stats.home.shotsOnTarget),
      String(result.stats.away.shotsOnTarget),
    ),
  );
  lines.push(
    row(
      catalog.label("passAccuracy"),
      passAccuracy(result.stats.home),
      passAccuracy(result.stats.away),
    ),
  );
  lines.push(
    row(
      catalog.label("tackles"),
      String(result.stats.home.tackles),
      String(result.stats.away.tackles),
    ),
  );
  lines.push(
    row(
      catalog.label("fouls"),
      String(result.stats.home.fouls),
      String(result.stats.away.fouls),
    ),
  );
  lines.push(
    row(
      catalog.label("offsides"),
      String(result.stats.home.offsides),
      String(result.stats.away.offsides),
    ),
  );
  lines.push(
    row(
      catalog.label("corners"),
      String(result.stats.home.corners),
      String(result.stats.away.corners),
    ),
  );
  lines.push(
    row(
      catalog.label("yellowCards"),
      String(result.stats.home.yellowCards),
      String(result.stats.away.yellowCards),
    ),
  );
  lines.push(
    row(
      catalog.label("redCards"),
      String(result.stats.home.redCards),
      String(result.stats.away.redCards),
    ),
  );
  lines.push("");

  // Final score + outcome.
  let score = `${result.homeTeamName} ${result.homeScore}-${result.awayScore} ${result.awayTeamName}`;
  if (result.shootoutScore) {
    score += ` (${catalog.phrase("afterShootout", {
      home: result.shootoutScore.home,
      away: result.shootoutScore.away,
    })})`;
  } else if (result.extraTimeScore) {
    score += ` (${catalog.phrase("afterExtraTime")})`;
  }
  lines.push(`── ${catalog.phrase("finalScore")} ──`);
  lines.push(score);

  if (result.outcome.aggregate) {
    lines.push(
      catalog.phrase("aggregate", {
        home: result.outcome.aggregate.home,
        away: result.outcome.aggregate.away,
      }),
    );
  }
  if (result.outcome.decidedBy === DecidedBy.Draw || !result.outcome.winnerTeamId) {
    lines.push(catalog.phrase("draw"));
  } else {
    lines.push(catalog.phrase("winner", { team: ctx.teamName(result.outcome.winnerTeamId) }));
  }

  return lines.join("\n");
}

function passAccuracy(stats: { passes: number; passesCompleted: number }): string {
  if (stats.passes === 0) return "0%";
  return `${Math.round((stats.passesCompleted / stats.passes) * 100)}%`;
}
