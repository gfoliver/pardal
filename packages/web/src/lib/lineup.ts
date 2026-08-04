import type { ReactNode } from "react";
import type { SquadEntry, TacticsView } from "@fut/career";
import type { ClubKit } from "@fut/competition";
import type { PitchSpot } from "../components/pitch";
import { shortNamesFor } from "./names";
import { groupOf } from "./labels";

/**
 * A club's PERSISTED tactics as pitch spots.
 *
 * Reads the stored lineup rather than recomputing one, because a recomputed lineup is a second
 * implementation that drifts: the one this replaced matched on position GROUP only and put
 * strikers on the wing, so the club page showed an XI the match would never field.
 *
 * `shortPos` and `marker` are injected because this is a plain function, not a component — the
 * label dictionary is a hook, and the caller decides whether a spot is a kit shirt or a chip.
 *
 * `rating` exists because a `TacticsView` always carries the TRUE overall, and that is only ours to
 * show for our own club. On a rival's page the tooltip was printing `name · 84` for eleven players
 * nobody had scouted — the exact number the entire scouting model is built to withhold, free, on the
 * page you reach by clicking a crest in the league table. The caller decides what may be revealed.
 */
export function lineupSpots(
  view: TacticsView,
  squad: readonly SquadEntry[],
  shortPos: (p: string) => string,
  marker?: (pos: string, kit?: ClubKit) => ReactNode,
  kit?: ClubKit,
  rating?: (playerId: string, trueOverall: number) => string | undefined,
): PitchSpot[] {
  const short = shortNamesFor(squad);
  return view.slots.map((s) => {
    const pos = shortPos(s.position);
    const shown = s.player ? (rating ? rating(s.player.playerId, s.player.overall) : String(s.player.overall)) : undefined;
    return {
      id: s.slot,
      x: s.width * 100,
      y: 100 - s.depth * 100,
      pos,
      group: groupOf(s.position),
      name: s.player ? short.get(s.player.playerId) ?? s.player.name : "—",
      // Just the name when there is no reading to give — never "· undefined".
      title: s.player ? (shown ? `${s.player.name} · ${shown}` : s.player.name) : undefined,
      marker: marker?.(pos, kit),
    };
  });
}
