import { loadCoach, type PlayerData } from "@fut/competition";
import { DefaultRoleProvider, getFormationTemplate, getRole, Position, type Role, TacticsBuilder, Team, type TeamInstructions, type Player } from "@fut/domain";
import { activeTactic, type Club } from "../club/Club.js";
import type { PlayerDev } from "../development/PlayerDev.js";
import { isAvailable } from "../development/PlayerDev.js";
import { buildPlayer, effectiveOverall, isGkData } from "./PlayerFactory.js";

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
  if (club.tacticSlots.length === 0) throw new Error(`Club ${club.id} has no saved tactics`);
  const tactics = activeTactic(club);
  const available = (id: string): boolean => Boolean(dataById.get(id)) && isAvailable(devById.get(id) ?? fallbackDev(id));
  const isGk = (id: string): boolean => Boolean(dataById.get(id) && isGkData(dataById.get(id)!));

  // Eligible squad sorted by overall — the pool replacements are drawn from.
  const pool = club.squad.playerIds
    .filter(available)
    .map((id) => ({ id, ovr: effectiveOverall(dataById.get(id)!, devById.get(id)), gk: isGk(id) }))
    .sort((a, b) => b.ovr - a.ovr || (a.id < b.id ? -1 : 1));

  const used = new Set<string>();
  const template = getFormationTemplate(tactics.formation);
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
  // Where each starter is FIELDED: the slot's position, or the one the manager
  // chose for it. Carried into the tactics so the engine knows a player is out
  // of position (and charges for it).
  const fieldedByPlayerId = new Map<string, Position>();
  const roleByPlayerId = new Map<string, Role>();
  xiIds.forEach((id, i) => {
    const fielded = tactics.slotFielded?.[i] ?? template[i]!.position;
    fieldedByPlayerId.set(id, fielded);
    const rk = tactics.roles[id];
    roleByPlayerId.set(id, rk ? getRole(rk) : roleProvider.defaultRoleFor(fielded));
  });

  const instructions: TeamInstructions = {
    formation: tactics.formation,
    mentality: tactics.mentality,
    tempo: tactics.instructions.tempo,
    pressing: tactics.instructions.pressing,
    lineHeight: tactics.instructions.lineHeight,
    width: tactics.instructions.width,
    directness: tactics.instructions.directness,
    markingScheme: tactics.instructions.markingScheme,
    familiarity: tactics.familiarity / 100,
  };

  let matchTactics = new TacticsBuilder().advanced(startingXi, roleByPlayerId, instructions, fieldedByPlayerId);
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
