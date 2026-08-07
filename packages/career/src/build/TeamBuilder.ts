import { loadCoach, type PlayerData } from "@fut/competition";
import { DefaultRoleProvider, getFormationTemplate, getRole, Position, type Role, TacticsBuilder, Team, type TeamInstructions } from "@fut/domain";
import { activeTactic, type Club } from "../club/Club.js";
import type { PlayerDev } from "../development/PlayerDev.js";
import { fallbackDev, isAvailable } from "../development/PlayerDev.js";
import { buildPlayer } from "./PlayerFactory.js";
import { FAMILIARITY_RESHAPE_COST, FAMILIARITY_RESHAPE_FLOOR } from "../tactics/edit.js";
import { buildPool, fillLineupHoles, MATCHDAY_BENCH_SIZE, reshapeForMatchday } from "../tactics/StoredTactics.js";

const roleProvider = new DefaultRoleProvider();

/**
 * Build the per-match domain `Team` for a club from its PERSISTED tactics: the
 * chosen XI (in formation-slot order) with per-player roles + team instructions.
 * This is the hot path run for every fixture.
 *
 * Every matchday the club asks three questions, in this order:
 *
 *  1. WHO IS MISSING? A stored starter plays if he is still registered here, the
 *     dataset knows him, he is fit and unsuspended, and he is a goalkeeper exactly
 *     when his slot is the goalkeeper's. Anyone else leaves a hole.
 *  2. DO I HAVE COVER? The holes are filled from the eligible squad in ONE exact
 *     assignment (`fillLineupHoles`), costed by what each candidate would really
 *     be worth doing that job — so two injured wingers get the two best-suited
 *     bodies left rather than the two highest-rated ones. The other ten keep their
 *     slots, their roles and their dragged positions: a hole is not a mandate to
 *     rearrange the team around it.
 *  3. IS THE SHAPE STILL RIGHT? If the absences have forced a lot of positional cost
 *     onto it, the problem stopped being who to pick, so `reshapeForMatchday`
 *     re-judges every formation against the available pool and may play a different
 *     one for THIS MATCH ONLY (see below).
 *
 * The docstring here used to promise "always 11 with a goalkeeper", which was never
 * true of this function. What is true: eleven players WHENEVER THE CLUB HAS ELEVEN
 * AVAILABLE, and a goalkeeper in the goalkeeper's slot whenever it has a fit
 * goalkeeper at all. Below either line it does the honest thing rather than the
 * promised one — a short XI, or an outfielder in goal, which is what a real side
 * with no keeper left does. The eleven is enforced UPSTREAM, by
 * `CareerRunner.playFixture` awarding the fixture; note that guard counts
 * availability only, so "eleven available, none of them a keeper" reaches here and
 * is fielded with somebody improvising in goal.
 */
export function buildMatchTeam(
  club: Club,
  dataById: ReadonlyMap<string, PlayerData>,
  devById: ReadonlyMap<string, PlayerDev>,
  /**
   * Who wears what, resolved by `resolveSquadNumbers`. Optional so a caller with
   * no career state still builds a team; without it a player keeps whatever the
   * dataset registered and the UI falls back to positional numbering.
   */
  numbers?: ReadonlyMap<string, number>,
): Team {
  if (club.tacticSlots.length === 0) throw new Error(`Club ${club.id} has no saved tactics`);
  const tactics = activeTactic(club);
  /*
   * Squad membership is checked FIRST, and it is the load-bearing part.
   *
   * A stored lineup is a list of player ids, and this used to ask only whether the id named someone
   * in the DATASET who was fit — never whether he still played here. So a sold player stayed in the
   * seller's lineup and was fielded by both clubs at once; the engine's agent index is keyed by
   * player id, so one of the two agents silently overwrote the other and the match never finished.
   *
   * `reconcileTactics` keeps the stored lineups tidy at every roster change, which is what the
   * manager sees. This is the invariant underneath it: whatever any future roster path forgets to
   * clean up, a club can only ever field its own players.
   */
  const inSquad = new Set(club.squad.playerIds);
  const available = (id: string): boolean =>
    inSquad.has(id) && Boolean(dataById.get(id)) && isAvailable(devById.get(id) ?? fallbackDev(id));

  /*
   * The squad, and the part of it that could actually take the field today —
   * ordered by rating and carrying `ratingAt`, which is what lets a fill be costed
   * by what the man would really be worth doing that job.
   *
   * The pool is the whole eligible squad, not the matchday twelve, because who is
   * unavailable is known BEFORE a bench is named: a reserve is exactly who gets
   * promoted when three of the first team are out. The full squad is kept because
   * `reshapeForMatchday` needs to know what this shape would cost with everyone
   * fit, to tell an injury crisis apart from a shape the manager simply prefers.
   */
  const squadPool = buildPool(club.squad.playerIds, dataById, devById);
  const pool = squadPool.filter((p) => available(p.id));
  const byId = new Map(pool.map((p) => [p.id, p]));

  const template = getFormationTemplate(tactics.formation);

  // 1. Who of the stored eleven can actually play. A goalkeeper belongs in the
  //    goalkeeper's slot and nowhere else, in BOTH directions — an outfielder in
  //    goal is a 69-point drop, and a keeper in midfield is worse.
  const stored: string[] = template.map((slot, i) => {
    const id = tactics.lineup[i];
    const entry = id ? byId.get(id) : undefined;
    if (!entry) return "";
    return entry.gk === (slot.position === Position.Goalkeeper) ? entry.id : "";
  });
  // A stored lineup naming the same man twice would field him twice; the engine's
  // agent index is keyed by player id and cannot survive that.
  const kept = new Set<string>();
  for (const [i, id] of stored.entries()) {
    if (!id) continue;
    if (kept.has(id)) stored[i] = "";
    else kept.add(id);
  }

  /*
   * Where each slot is FIELDED. `slotFielded[i]` is the manager choosing a job for
   * A PARTICULAR MAN — "play HIM there instead" — so it holds only while that man
   * is in the slot. Once he is gone the choice is void and the slot reverts to the
   * template's own job, because inheriting it asks a stranger for something nobody
   * asked him about: an injured full-back's slot labelled "striker" was how an
   * attacking midfielder came to lead the line at a fit of 0.77.
   */
  const slotFor: Position[] = template.map((slot, i) => (stored[i] ? tactics.slotFielded?.[i] ?? slot.position : slot.position));

  // 2. Cover the holes, all of them together.
  const filled = fillLineupHoles(stored, slotFor, pool.filter((p) => !kept.has(p.id)));

  // 3. …and only then ask whether the shape itself is the problem.
  const shape = reshapeForMatchday(pool, squadPool, tactics.formation);
  const shapeTemplate = shape ? getFormationTemplate(shape.formation) : template;
  const lineup = shape?.lineup ?? filled;

  /*
   * A forced reshape is NOT PERSISTED and is not charged to the saved tactic.
   *
   * Not persisted, because the shape must snap back the moment the players are fit
   * again: a hamstring in March must not permanently reshape the club, and for the
   * managed club it must not rewrite the tactic he saved without him asking. That
   * "one bad decision outlives its cause" is exactly the bug `reconcileTactics`
   * used to have.
   *
   * But the squad has not drilled this shape, and the engine has to know, so the
   * drill cost is charged FOR THIS MATCH at the same rate a deliberate reshape
   * costs (`FAMILIARITY_RESHAPE_COST`, floored the same way) and forgotten
   * afterwards. Paying the cost without keeping the shape is the honest reading of
   * an emergency: the club plays worse today and is unchanged tomorrow.
   */
  const familiarity = shape ? Math.max(FAMILIARITY_RESHAPE_FLOOR, tactics.familiarity - FAMILIARITY_RESHAPE_COST) : tactics.familiarity;

  // Slot-indexed throughout, so a short XI leaves the hole where it happened
  // rather than sliding everyone one slot to the left.
  const picks = lineup.flatMap((id, slot) => (id ? [{ id, slot }] : []));

  const wearing = (id: string) => buildPlayer(dataById.get(id)!, devById.get(id), numbers?.get(id));
  const startingXi = picks.map((p) => wearing(p.id));
  // Where each starter is FIELDED, carried into the tactics so the engine knows a
  // player is out of position (and charges for it).
  const fieldedByPlayerId = new Map<string, Position>();
  const roleByPlayerId = new Map<string, Role>();
  for (const { id, slot } of picks) {
    const fielded = shape ? shapeTemplate[slot]!.position : slotFor[slot]!;
    fieldedByPlayerId.set(id, fielded);
    // A role describes the JOB, so only the man the manager actually assigned to
    // this slot keeps the role he was given for it; anyone stepping in — or the
    // whole eleven after a reshape — takes the default for the job he is doing.
    const inherited = !shape && tactics.lineup[slot] === id ? tactics.roles[id] : undefined;
    roleByPlayerId.set(id, inherited ? getRole(inherited) : roleProvider.defaultRoleFor(fielded));
  }

  const used = new Set(picks.map((p) => p.id));
  const benchIds: string[] = [];
  for (const id of [...tactics.bench, ...club.squad.playerIds]) {
    if (available(id) && !used.has(id) && !benchIds.includes(id)) benchIds.push(id);
    if (benchIds.length >= MATCHDAY_BENCH_SIZE) break;
  }

  const instructions: TeamInstructions = {
    formation: shape?.formation ?? tactics.formation,
    mentality: tactics.mentality,
    tempo: tactics.instructions.tempo,
    pressing: tactics.instructions.pressing,
    lineHeight: tactics.instructions.lineHeight,
    width: tactics.instructions.width,
    directness: tactics.instructions.directness,
    markingScheme: tactics.instructions.markingScheme,
    familiarity: familiarity / 100,
  };

  let matchTactics = new TacticsBuilder().advanced(startingXi, roleByPlayerId, instructions, fieldedByPlayerId);
  /*
   * Each starter's cell on the pitch, by his own SLOT. `TacticsBuilder` maps the XI
   * by array order instead, which is the same thing for a full eleven and wrong for
   * a short one — it would slide the survivors of a hole one slot to the left while
   * their roles and fielded positions stayed put. Stated here so the two agree.
   *
   * A dragged coordinate then overrides the template — but it is a coordinate in the
   * STORED shape, so a reshape drops it.
   */
  for (const { id, slot } of picks) {
    const dragged = shape ? undefined : tactics.slotPositions?.[slot];
    const base = shapeTemplate[slot];
    const cell = dragged ?? (base ? { depth: base.depth, width: base.width } : undefined);
    if (cell) matchTactics = matchTactics.withSlot(id, cell);
  }

  return new Team({
    id: club.id,
    name: club.name,
    shortName: club.shortName,
    coach: loadCoach(club.squad.coach),
    startingXi,
    bench: benchIds.map(wearing),
    tactics: matchTactics,
  });
}
