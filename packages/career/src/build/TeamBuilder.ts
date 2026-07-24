import { loadCoach, type PlayerData } from "@fut/competition";
import { TacticsBuilder, Team, type Player } from "@fut/domain";
import type { Club } from "../club/Club.js";
import type { PlayerDev } from "../development/PlayerDev.js";
import { isAvailable } from "../development/PlayerDev.js";
import { buildPlayer, effectiveOverall, isGkData } from "./PlayerFactory.js";

const XI = 11;
const BENCH = 7;

/**
 * Build the per-match domain `Team` for a club: pick the best available XI
 * (guaranteeing a goalkeeper), a bench, and the club's tactics. Injured/
 * suspended players are excluded. This is the hot path run for every fixture,
 * so it only touches the club's own squad.
 */
export function buildMatchTeam(
  club: Club,
  dataById: ReadonlyMap<string, PlayerData>,
  devById: ReadonlyMap<string, PlayerDev>,
): Team {
  const pool = club.squad.playerIds
    .map((id) => ({ data: dataById.get(id)!, dev: devById.get(id) }))
    .filter((e) => e.data && isAvailable(e.dev ?? fallbackDev(e.data.id)))
    .map((e) => ({ ...e, ovr: effectiveOverall(e.data, e.dev) }))
    .sort((a, b) => b.ovr - a.ovr);

  let keepers = pool.filter((e) => isGkData(e.data));
  let outfield = pool.filter((e) => !isGkData(e.data));
  if (keepers.length === 0) {
    // No fit keeper (the lone GK is injured/suspended): field the best squad
    // keeper anyway; if the club truly has none, emergency-promote an outfielder.
    const squadKeepers = club.squad.playerIds
      .map((id) => ({ data: dataById.get(id)!, dev: devById.get(id) }))
      .filter((e) => e.data && isGkData(e.data))
      .map((e) => ({ ...e, ovr: effectiveOverall(e.data, e.dev) }))
      .sort((a, b) => b.ovr - a.ovr);
    if (squadKeepers.length > 0) keepers = [squadKeepers[0]!];
    else if (outfield.length > 0) {
      keepers = [outfield[0]!];
      outfield = outfield.slice(1);
    } else throw new Error(`Club ${club.id} has no players to field`);
  }

  // Best keeper + best 10 outfield = XI; then fill the bench.
  const starters = [keepers[0]!, ...outfield.slice(0, XI - 1)];
  const rest = [...keepers.slice(1), ...outfield.slice(XI - 1)].sort((a, b) => b.ovr - a.ovr);
  const bench = rest.slice(0, BENCH);

  const toPlayer = (e: { data: PlayerData; dev?: PlayerDev }): Player => buildPlayer(e.data, e.dev);
  const startingXi = starters.map(toPlayer);

  const tactics = new TacticsBuilder().simple(startingXi, {
    formation: club.formation,
    mentality: club.mentality,
  });

  return new Team({
    id: club.id,
    name: club.name,
    shortName: club.shortName,
    coach: loadCoach(club.squad.coach),
    startingXi,
    bench: bench.map(toPlayer),
    tactics,
  });
}

function fallbackDev(playerId: string): PlayerDev {
  return { playerId, currentAbility: 100, potentialAbility: 100, attributeDeltas: {}, fitness: 100, yellowAccumulation: {}, ageAtSeasonStart: 25 };
}
