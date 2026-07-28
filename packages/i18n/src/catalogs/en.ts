import { CardColor, MatchEventType, type MatchEvent } from "@fut/engine";
import { type Catalog, type RenderContext, type StatKey } from "../Catalog.js";

const STAT_LABELS: Record<StatKey, string> = {
  possession: "Possession",
  shots: "Shots",
  shotsOnTarget: "On target",
  passes: "Passes",
  passAccuracy: "Pass accuracy",
  tackles: "Tackles",
  fouls: "Fouls",
  offsides: "Offsides",
  corners: "Corners",
  yellowCards: "Yellow cards",
  redCards: "Red cards",
};

const MENTALITY: Record<string, string> = {
  veryDefensive: "very defensive",
  defensive: "defensive",
  balanced: "balanced",
  attacking: "attacking",
  veryAttacking: "very attacking",
};

const PHRASES: Record<string, string> = {
  timeline: "Timeline",
  statistics: "Statistics",
  finalScore: "Final score",
  winner: "{team} win",
  draw: "Draw",
  afterExtraTime: "after extra time",
  afterShootout: "on penalties ({home}-{away})",
  aggregate: "aggregate {home}-{away}",
  seed: "seed",
};

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) =>
    params[k] !== undefined ? String(params[k]) : `{${k}}`,
  );
}

export const enCatalog: Catalog = {
  locale: "en",

  renderEvent(e: MatchEvent, ctx: RenderContext): string | null {
    const team = ctx.teamName(e.teamId);
    const p = e.playerName ?? "";
    switch (e.type) {
      case MatchEventType.Kickoff:
        return "Kick-off!";
      case MatchEventType.HalfTime:
        return "Half-time.";
      case MatchEventType.FullTime:
        return "Full-time.";
      case MatchEventType.ExtraTimeStart:
        return "Extra time begins.";
      case MatchEventType.Goal: {
        const penalty = e.params?.penalty ? " (penalty)" : "";
        const assist = e.secondaryPlayerName
          ? `, assisted by ${e.secondaryPlayerName}`
          : "";
        return `⚽ GOAL! ${p} scores for ${team}${penalty}${assist}.`;
      }
      case MatchEventType.Shot:
        // A missed penalty is its own kind of moment, not just another shot.
        if (e.params?.penalty) {
          if (e.params?.saved) return `❌ Penalty SAVED! ${p}'s spot kick is kept out.`;
          if (e.params?.woodwork) return `❌ ${p} strikes the woodwork from the spot!`;
          return `❌ ${p} misses the penalty — off target.`;
        }
        if (e.params?.woodwork) return `${p} hits the woodwork!`;
        if (e.params?.saved) return `${p} shoots — saved by the keeper!`;
        return `${p} shoots off target.`;
      case MatchEventType.Foul:
        return `Foul by ${p} (${team}).`;
      case MatchEventType.Card: {
        const color = e.params?.color;
        if (color === CardColor.Red) {
          const reason = e.params?.reason === "secondYellow" ? " (second yellow)" : "";
          return `🟥 Red card for ${p}${reason}.`;
        }
        return `🟨 Yellow card for ${p}.`;
      }
      case MatchEventType.Offside:
        return `Offside against ${p} (${team}).`;
      case MatchEventType.Corner:
        return `Corner for ${team}.`;
      case MatchEventType.Penalty:
        return `Penalty awarded to ${team}!`;
      case MatchEventType.Injury:
        return `${p} (${team}) is injured.`;
      case MatchEventType.Substitution: {
        const reason = e.params?.injury ? " (injury)" : "";
        return `Substitution (${team})${reason}: ${p} on, ${e.secondaryPlayerName ?? ""} off.`;
      }
      case MatchEventType.TacticChange: {
        const m = MENTALITY[String(e.params?.mentality)] ?? String(e.params?.mentality);
        return `${team} switch to a ${m} approach.`;
      }
      case MatchEventType.ShootoutKick:
        return e.params?.scored
          ? `Shootout — ${p} scores.`
          : `Shootout — ${p} misses!`;
      default:
        return null;
    }
  },

  label(key: StatKey): string {
    return STAT_LABELS[key];
  },

  phrase(key: string, params?: Record<string, string | number>): string {
    return interpolate(PHRASES[key] ?? key, params);
  },
};
