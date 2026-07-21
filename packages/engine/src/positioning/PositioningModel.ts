import {
  type BaseSlot,
  DefaultRoleProvider,
  mentalityToAttackBias,
  Position,
  positionAdvancement,
  PositionGroup,
  positionGroup,
  type Player,
  type Role,
  type Tactics,
} from "@fut/domain";
import { type TeamSide } from "../pitch/PitchGrid.js";
import { zone, type Zone } from "../pitch/Zone.js";
import { type MatchState } from "../state/MatchState.js";

/**
 * Off-ball repositioning (stage (a) of the loop). Each player has a DISTINCT
 * base cell on the pitch (from the formation template / tactic); positioning
 * moves that base cell dynamically — pushing forward in possession, dropping
 * out of it, and drifting toward the ball — while keeping the team spread.
 */
export class PositioningModel {
  private readonly roleFallback = new DefaultRoleProvider();

  assign(state: MatchState): void {
    for (const teamId of [state.homeTeam.id, state.awayTeam.id]) {
      const side = state.sideOf(teamId);
      const tactics = state.tacticsFor(teamId);
      const hasBall = state.possessionTeamId === teamId;
      const ballAdvancement = state.grid.advancement(side, state.ballZone);
      for (const player of state.onPitchPlayers(teamId)) {
        const fielded = state.fieldedPositionOf(player.id);
        const role = tactics.roleFor(player.id) ?? this.roleFallback.defaultRoleFor(fielded);
        const slot = tactics.baseSlot(player.id);
        const z = this.zoneFor(state, tactics, role, hasBall, ballAdvancement, side, slot, fielded);
        state.positions.set(player.id, z);
      }
      if (hasBall) {
        this.applyInvertedWingers(state, teamId, side);
        this.applyFlankCombinations(state, teamId, side);
        this.applyThirdManRun(state, teamId, side, tactics);
      }
    }
    // The ball carrier is always at the ball — keeps the on-screen ball at their
    // feet and the spatial (marking/sector) reads coherent.
    state.positions.set(state.ballCarrierId, state.ballZone);
  }

  /**
   * Inverted wingers: a winger high up the pitch cuts inside from the touchline
   * into the half-space, where chances are more valuable — the width is then
   * provided by an overlapping full-back. Makes wide, single-striker shapes
   * (4-3-3) a genuine central threat rather than crossing to one target.
   */
  private applyInvertedWingers(state: MatchState, teamId: string, side: TeamSide): void {
    const center = state.grid.centerLane;
    for (const p of state.onPitchPlayers(teamId)) {
      if (state.fieldedPositionOf(p.id) !== Position.Winger) continue;
      const z = state.positions.get(p.id);
      if (!z || !state.grid.isFinalThird(side, z)) continue;
      // Step one lane in toward the centre (touchline → half-space).
      const inward = z.lane + Math.sign(center - z.lane);
      state.positions.set(p.id, zone(z.third, state.grid.clampLane(inward)));
    }
  }

  /**
   * Overlap combination: when a full-back/wing-back has advanced up a flank, the
   * winger ahead of them cuts inside (into the half-space) while the full-back
   * provides the width (touchline). Two players never share the flank — they
   * combine, one wide and one inside.
   */
  private applyFlankCombinations(state: MatchState, teamId: string, side: TeamSide): void {
    const lanes = state.grid.lanes;
    const players = state.onPitchPlayers(teamId);
    const flanks: Array<{ inner: number; outer: number; contains: (l: number) => boolean }> = [
      { inner: 1, outer: 0, contains: (l) => l <= 1 },
      { inner: lanes - 2, outer: lanes - 1, contains: (l) => l >= lanes - 2 },
    ];

    for (const flank of flanks) {
      const here = players.filter((p) => {
        const z = state.positions.get(p.id);
        return z !== undefined && flank.contains(z.lane);
      });
      const fullBack = here.find(
        (p) => positionGroup(state.fieldedPositionOf(p.id)) === PositionGroup.Defence,
      );
      const winger = here.find(
        (p) => state.fieldedPositionOf(p.id) === Position.Winger,
      );
      if (!fullBack || !winger) continue;

      const fbZone = state.positions.get(fullBack.id)!;
      if (state.grid.advancement(side, fbZone) < 0.55) continue; // not overlapping yet

      const wZone = state.positions.get(winger.id)!;
      state.positions.set(winger.id, zone(wZone.third, flank.inner)); // cut inside
      state.positions.set(fullBack.id, zone(fbZone.third, flank.outer)); // overlap wide

      // Cover: a central midfielder shuffles across and drops to cover the space
      // the full-back vacated (defensive balance / rest defence).
      const dir = state.grid.direction(side);
      const coverer = players
        .filter((p) => positionGroup(state.fieldedPositionOf(p.id)) === PositionGroup.Midfield)
        .map((p) => ({ p, z: state.positions.get(p.id)! }))
        .filter((x) => Math.abs(x.z.lane - flank.inner) <= 2)
        .sort((a, b) => Math.abs(a.z.lane - flank.inner) - Math.abs(b.z.lane - flank.inner))[0];
      if (coverer) {
        const coverLane = state.grid.clampLane(
          coverer.z.lane + Math.sign(flank.inner - coverer.z.lane),
        );
        const coverBand = state.grid.clampThird(coverer.z.third - dir); // drop toward own goal
        state.positions.set(coverer.p.id, zone(coverBand, coverLane));
      }
    }
  }

  /**
   * Third-man run: if the central attacking cell is vacant (e.g. a false 9 has
   * dropped deep), the best available runner infiltrates it. This is what makes
   * dropping a striker viable — a midfielder/winger attacks the vacated space.
   */
  private applyThirdManRun(
    state: MatchState,
    teamId: string,
    side: TeamSide,
    tactics: Tactics,
  ): void {
    const centralCell = zone(state.grid.attackingThird(side), state.grid.centerLane);
    const players = state.onPitchPlayers(teamId);
    const occupied = players.some((p) => {
      const z = state.positions.get(p.id);
      return z !== undefined && z.third === centralCell.third && z.lane === centralCell.lane;
    });
    if (occupied) return;

    let best: { id: string; freq: number } | undefined;
    for (const p of players) {
      const role = tactics.roleFor(p.id) ?? this.roleFallback.defaultRoleFor(state.fieldedPositionOf(p.id));
      const freq = role.movement.runFrequency;
      const pos = state.positions.get(p.id);
      const advanced = pos ? state.grid.advancement(side, pos) >= 0.45 : false;
      if (freq >= 0.5 && advanced && (!best || freq > best.freq)) {
        best = { id: p.id, freq };
      }
    }
    if (best) state.positions.set(best.id, centralCell);
  }

  private zoneFor(
    state: MatchState,
    tactics: Tactics,
    role: Role,
    hasBall: boolean,
    ballAdvancement: number,
    side: TeamSide,
    slot: BaseSlot | undefined,
    fielded: ReturnType<MatchState["fieldedPositionOf"]>,
  ): Zone {
    const instr = tactics.instructions;
    let advancement = slot ? slot.depth : positionAdvancement(fielded);

    if (hasBall) {
      const attack = mentalityToAttackBias(instr.mentality); // [-1, 1]
      advancement += role.movement.attackingBias * 0.18;
      advancement += role.movement.depthBias * 0.12;
      advancement += attack * 0.1;
      advancement += (instr.lineHeight - 0.5) * 0.12;
      // Off-ball run: infiltrate forward as the ball is advanced.
      advancement += role.movement.runFrequency * ballAdvancement * 0.18;
    } else {
      advancement -= role.movement.defensiveBias * 0.14;
      advancement += (instr.lineHeight - 0.5) * 0.16;
    }

    // Compactness/pressing pull players toward the ball's band.
    const pull = hasBall ? instr.tempo * 0.15 : instr.pressing * 0.22;
    advancement += (ballAdvancement - advancement) * pull;
    advancement = Math.min(1, Math.max(0, advancement));

    const own = state.grid.ownThird(side);
    const dir = state.grid.direction(side);
    const third = state.grid.clampThird(
      Math.round(own + dir * advancement * (state.grid.thirds - 1)),
    );

    const lane = this.laneFor(state, side, slot, hasBall, instr.pressing);
    return zone(third, lane);
  }

  /**
   * Base lane from the slot width (mirrored for the away side), drifting toward
   * the ball's lane. When defending, the whole block slides more strongly to
   * the ball side (compactness) — covering the flank under attack.
   */
  private laneFor(
    state: MatchState,
    side: TeamSide,
    slot: BaseSlot | undefined,
    hasBall: boolean,
    pressing: number,
  ): number {
    const widthFrac = slot ? slot.width : 0.5;
    const homeLane = Math.round(widthFrac * (state.grid.lanes - 1));
    const base = side === "home" ? homeLane : state.grid.lanes - 1 - homeLane;
    const shift = hasBall ? 0.2 : 0.3 + pressing * 0.18;
    const drift = Math.round((state.ballZone.lane - base) * shift);
    return state.grid.clampLane(base + drift);
  }
}
