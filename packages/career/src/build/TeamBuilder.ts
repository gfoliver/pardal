import { loadCoach, type PlayerData } from "@fut/competition";
import { DefaultRoleProvider, getFormationTemplate, getRole, Position, type Role, TacticsBuilder, Team, type TeamInstructions, type Player } from "@fut/domain";
import type { Club } from "../club/Club.js";
import type { PlayerDev } from "../development/PlayerDev.js";
import { isAvailable } from "../development/PlayerDev.js";
import { buildPlayer, effectiveOverall, isGkData } from "./PlayerFactory.js";
import { ensureTactics } from "../tactics/StoredTactics.js";

const BENCH = 7;
const roleProvider = new DefaultRoleProvider();

/**
 * Build the per-match domain `Team` for a club from its PERSISTED tactics: the
 * chosen XI (in formation-slot order) with per-player roles + team instructions.
 * Unavailable (injured/suspended) starters are replaced from the eligible squad
 * so the XI is always 11 with a goalkeeper; the bench is the ordered remainder.
 * This is the hot path run for every fixture.
 */
export function buildMatchTeam(
  club: Club,
  dataById: ReadonlyMap<string, PlayerData>,
  devById: ReadonlyMap<string, PlayerDev>,
): Team {
  const tactics = club.tactics ?? ensureTactics(club, dataById, devById);
  const available = (id: string): boolean => Boolean(dataById.get(id)) && isAvailable(devById.get(id) ?? fallbackDev(id));
  const isGk = (id: string): boolean => Boolean(dataById.get(id) && isGkData(dataById.get(id)!));

  // Eligible squad sorted by overall — the pool replacements are drawn from.
  const pool = club.squad.playerIds
    .filter(available)
    .map((id) => ({ id, ovr: effectiveOverall(dataById.get(id)!, devById.get(id)), gk: isGk(id) }))
    .sort((a, b) => b.ovr - a.ovr || (a.id < b.id ? -1 : 1));

  const used = new Set<string>();
  const template = getFormationTemplate(club.formation);
  const xiIds: string[] = [];
  template.forEach((slot, i) => {
    const wantGk = slot.position === Position.Goalkeeper;
    let id: string | undefined = tactics.lineup[i];
    const ok = id && !used.has(id) && available(id) && (!wantGk || isGk(id));
    if (!ok) {
      const rep = pool.find((p) => !used.has(p.id) && (wantGk ? p.gk : !p.gk)) ?? pool.find((p) => !used.has(p.id));
      id = rep?.id;
    }
    if (id) {
      used.add(id);
      xiIds.push(id);
    }
  });

  const benchIds: string[] = [];
  for (const id of [...tactics.bench, ...club.squad.playerIds]) {
    if (available(id) && !used.has(id) && !benchIds.includes(id)) benchIds.push(id);
    if (benchIds.length >= BENCH) break;
  }

  const startingXi = xiIds.map((id) => buildPlayer(dataById.get(id)!, devById.get(id)));
  const roleByPlayerId = new Map<string, Role>();
  xiIds.forEach((id, i) => {
    const rk = tactics.roles[id];
    roleByPlayerId.set(id, rk ? getRole(rk) : roleProvider.defaultRoleFor(template[i]!.position));
  });

  const instructions: TeamInstructions = {
    formation: club.formation,
    mentality: club.mentality,
    tempo: tactics.instructions.tempo,
    pressing: tactics.instructions.pressing,
    lineHeight: tactics.instructions.lineHeight,
    width: tactics.instructions.width,
    directness: tactics.instructions.directness,
    markingScheme: tactics.instructions.markingScheme,
  };

  let matchTactics = new TacticsBuilder().advanced(startingXi, roleByPlayerId, instructions);
  // Custom (dragged) slot coordinates override the formation template.
  tactics.slotPositions?.forEach((slot, i) => {
    const id = xiIds[i];
    if (slot && id) matchTactics = matchTactics.withSlot(id, slot);
  });

  return new Team({
    id: club.id,
    name: club.name,
    shortName: club.shortName,
    coach: loadCoach(club.squad.coach),
    startingXi,
    bench: benchIds.map((id) => buildPlayer(dataById.get(id)!, devById.get(id))),
    tactics: matchTactics,
  });
}

function fallbackDev(playerId: string): PlayerDev {
  return { playerId, currentAbility: 100, potentialAbility: 100, attributeDeltas: {}, fitness: 100, yellowAccumulation: {}, ageAtSeasonStart: 25 };
}
