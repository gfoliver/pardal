import { type MatchEvent } from "@fut/engine";

export type Locale = "en" | "pt-BR";

/** Lookup for turning ids into display names during rendering. */
export interface RenderContext {
  teamName(teamId: string | undefined): string;
}

/** Stat labels rendered in the summary table. */
export type StatKey =
  | "possession"
  | "shots"
  | "shotsOnTarget"
  | "passes"
  | "passAccuracy"
  | "tackles"
  | "fouls"
  | "offsides"
  | "corners"
  | "yellowCards"
  | "redCards";

/**
 * A locale's message catalog. The engine emits structured events; the catalog
 * turns them into narration and provides UI labels — so switching language never
 * re-simulates the match, only re-renders it.
 */
export interface Catalog {
  readonly locale: Locale;
  /** Narrate a timeline event, or return null to skip it. */
  renderEvent(event: MatchEvent, ctx: RenderContext): string | null;
  /** A short label for a statistic. */
  label(key: StatKey): string;
  /** Section headers and generic phrases. */
  phrase(key: string, params?: Record<string, string | number>): string;
}
