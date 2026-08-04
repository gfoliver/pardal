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
 */
export function lineupSpots(
  view: TacticsView,
  squad: readonly SquadEntry[],
  shortPos: (p: string) => string,
  marker?: (pos: string, kit?: ClubKit) => ReactNode,
  kit?: ClubKit,
): PitchSpot[] {
  const short = shortNamesFor(squad);
  return view.slots.map((s) => {
    const pos = shortPos(s.position);
    return {
      id: s.slot,
      x: s.width * 100,
      y: 100 - s.depth * 100,
      pos,
      group: groupOf(s.position),
      name: s.player ? short.get(s.player.playerId) ?? s.player.name : "—",
      title: s.player ? `${s.player.name} · ${s.player.overall}` : undefined,
      marker: marker?.(pos, kit),
    };
  });
}
