import {
  type AssignablePlayer,
  assignToFormation,
  assignToSlots,
  type BaseSlot,
  DefaultRoleProvider,
  fitPenalty,
  Formation,
  getFormationTemplate,
  MarkingScheme,
  type Mentality,
  mentalityToAttackBias,
  Position,
  PositionGroup,
  positionGroup,
  RoleKey,
} from "@fut/domain";
import type { PlayerData } from "@fut/competition";
import type { PlayerDev } from "../development/PlayerDev.js";
import { buildPlayer, effectiveOverall, isGkData } from "../build/PlayerFactory.js";

/** The five numeric sliders + marking scheme; formation & mentality live on the Club. */
export interface StoredInstructions {
  tempo: number;
  pressing: number;
  lineHeight: number;
  width: number;
  directness: number;
  markingScheme: MarkingScheme;
}

/**
 * A club's persisted tactical setup. `lineup` is the 11 starters in
 * formation-slot order (index → `getFormationTemplate(formation)[index]`);
 * `bench` is the ordered rest; `roles` maps each selected player to a RoleKey.
 */
export interface StoredTactics {
  lineup: string[];
  bench: string[];
  roles: Record<string, RoleKey>;
  instructions: StoredInstructions;
  /**
   * Per-slot pitch coordinates that OVERRIDE the formation template (set by
   * dragging a player on the tactics pitch). Index = slot; sparse entries fall
   * back to the template, so a formation change keeps working.
   */
  slotPositions?: (BaseSlot | undefined)[];
  /**
   * Per-slot FIELDED position that overrides the formation template's (set by
   * picking a position for a player). Index = slot; sparse entries fall back to
   * the template. The engine receives it, so playing someone out of their own
   * position carries the familiarity cost the domain models.
   */
  slotFielded?: (Position | undefined)[];
}

/**
 * One of a club's saved tactical setups. A club keeps several of these
 * (`Club.tacticSlots`) and plays with whichever is `activeTacticId` — swapping
 * shape for an opponent no longer means overwriting the only tactic on file.
 * `formation`/`mentality` live here (not on the Club) precisely so each saved
 * tactic can have its own.
 */
export interface SavedTactic extends StoredTactics {
  /** Facade-generated ("t1", "t2"…), stable across renames. */
  readonly id: string;
  /** User-visible; defaults to a plain number ("1", "2"…). */
  name: string;
  formation: Formation;
  mentality: Mentality;
  /**
   * 0-100: how well the squad has drilled this exact setup. Grows with games
   * played under it, decays on the others, and takes a hit when the shape
   * itself changes — a real trade-off against switching formation every week.
   */
  familiarity: number;
}

const roleProvider = new DefaultRoleProvider();

/** Default RoleKey for a (slot) position. */
export function defaultRoleKey(position: Position): RoleKey {
  return roleProvider.defaultRoleFor(position).key as RoleKey;
}

/** Sensible default sliders derived from a mentality (mirrors TacticsBuilder). */
export function defaultInstructions(mentality: Mentality): StoredInstructions {
  const attack = mentalityToAttackBias(mentality); // [-1, 1]
  const around = (base: number) => Math.min(1, Math.max(0, base + attack * 0.2));
  return { tempo: around(0.5), pressing: around(0.5), lineHeight: around(0.5), width: 0.5, directness: around(0.5), markingScheme: MarkingScheme.Zonal };
}

/** A squad member reduced to what picking a shape needs. */
export interface PoolEntry {
  readonly id: string;
  readonly ovr: number;
  readonly gk: boolean;
  readonly group: PositionGroup;
  readonly pos: Position;
  /** Rating in any position, for costing out-of-position fills. */
  readonly ratingAt: (position: Position) => number;
}

/**
 * The pool a shape is picked from, ordered `ovr` desc then id asc.
 *
 * Exported because SELECTION IS ONE PROBLEM: the tactics board picking an XI, a
 * roster change refilling a hole and a matchday covering an injury all cost an
 * out-of-position fill the same way, and they can only do that over the same
 * entry — `pos`/`gk` to know what a player is, `ratingAt` to know what he would
 * actually be worth somewhere else.
 */
export function buildPool(playerIds: readonly string[], dataById: ReadonlyMap<string, PlayerData>, devById: ReadonlyMap<string, PlayerDev>): PoolEntry[] {
  return playerIds
    .map((id) => ({ id, data: dataById.get(id), dev: devById.get(id) }))
    .filter((e) => e.data !== undefined)
    .map((e) => {
      const data = e.data as PlayerData;
      const pos = data.position as Position;
      const player = buildPlayer(data, e.dev);
      return {
        id: e.id,
        ovr: effectiveOverall(data, e.dev),
        gk: isGkData(data),
        group: positionGroup(pos),
        pos,
        ratingAt: (position: Position) => player.overall(position),
      };
    })
    .sort((a, b) => b.ovr - a.ovr || (a.id < b.id ? -1 : 1));
}

const assignableOf = (p: PoolEntry): AssignablePlayer => ({ id: p.id, position: p.pos, isGoalkeeper: p.gk, rating: p.ovr, ratingAt: p.ratingAt });

/**
 * Fill a formation from the pool (shared exact-position-first assignment) and
 * score the result, so `chooseFormation` can compare shapes: quality rewarded,
 * out-of-position fills penalised, an unfilled slot very bad.
 *
 * `lineup` is indexed BY SLOT and carries "" where the pool ran out, never a
 * compacted list — everything downstream reads `lineup[i]` against
 * `getFormationTemplate(formation)[i]`, so a squad of nine has to leave two holes
 * rather than slide the nine two slots to the left.
 */
function fitFormation(
  pool: readonly PoolEntry[],
  formation: Formation,
): { lineup: string[]; roles: Record<string, RoleKey>; used: Set<string>; score: number; penalty: number } {
  const ovrById = new Map(pool.map((p) => [p.id, p.ovr]));
  const { slots } = assignToFormation(pool.map(assignableOf), formation);
  const template = getFormationTemplate(formation);
  const used = new Set<string>();
  const lineup: string[] = template.map(() => "");
  const roles: Record<string, RoleKey> = {};
  let score = 0;
  let penalty = 0;
  for (const [i, a] of slots.entries()) {
    if (!a) {
      score -= 40;
      continue;
    }
    used.add(a.playerId);
    lineup[i] = a.playerId;
    roles[a.playerId] = defaultRoleKey(template[i]!.position);
    score += (ovrById.get(a.playerId) ?? 0) - a.penalty;
    penalty += a.penalty;
  }
  return { lineup, roles, used, score, penalty };
}

/**
 * Fill the EMPTY slots of a part-picked eleven, deciding the fills TOGETHER.
 *
 * `lineup[i]` falsy means slot `i` needs somebody; everyone else stays exactly
 * where he is, because the other ten are the manager's choices and a hole is not
 * a mandate to rearrange the team around it. `slotFor[i]` is the position that
 * slot will actually be FIELDED at, so the cost of each candidate is what the
 * domain says he would really be worth doing that job.
 *
 * The holes go through the same exact assignment an auto-pick uses, in one solve
 * rather than one hole at a time. That is the whole point: two injured wingers
 * are covered by the two best-suited bodies left, not by the two highest-rated
 * ones — and because `fitPenalty` prices a goalkeeper/outfield mismatch at 200,
 * an outfielder only ever ends up in goal when the club has no fit keeper at all,
 * and a keeper only ever ends up outfield when it cannot name ten fit outfielders.
 *
 * Returns exactly `slotFor.length` entries; a slot stays "" only when the
 * candidates ran out.
 */
export function fillLineupHoles(lineup: readonly string[], slotFor: readonly Position[], candidates: readonly PoolEntry[]): string[] {
  const filled = slotFor.map((_, i) => lineup[i] ?? "");
  const holes = filled.flatMap((id, i) => (id ? [] : [i]));
  if (holes.length === 0 || candidates.length === 0) return filled;
  const { slots } = assignToSlots(candidates.map(assignableOf), holes.map((i) => ({ position: slotFor[i]! })));
  for (const [k, a] of slots.entries()) {
    const slot = holes[k];
    if (a && slot !== undefined) filled[slot] = a.playerId;
  }
  return filled;
}

/**
 * How much out-of-position cost TODAY'S ABSENCES may force on a shape before the
 * shape itself is judged to be the problem.
 *
 * The unit is rating points of `fitPenalty` summed over the eleven, and it is
 * measured as a DIFFERENCE: the best eleven this shape can name from the players
 * who are fit, against the best eleven it could name with everyone fit. That
 * subtraction is the whole point. A shape can be permanently imperfect for a squad
 * — nobody in the dataset is a wing-back, so every back-three formation carries a
 * standing penalty at both flanks — and that is the manager's own trade-off to
 * make, not something a matchday should overrule behind his back. What a matchday
 * gets to react to is the part the injuries and suspensions added.
 *
 * The scale comes from measurement (`career:lineups`): an exact solve over a
 * healthy squad in a shape that suits it costs about 1.5 points, one player
 * displaced by a whole line of the pitch costs roughly 8-18, and a two-line
 * displacement costs tens. So twelve says: losing one man and covering him out of
 * his line is a thing managers do and the shape is not to blame; more than that
 * and the shape is asking today for players this club cannot field today.
 */
export const RESHAPE_FORCED_COST_LIMIT = 12;

/**
 * And how much better another shape's best eleven must be before it is worth
 * abandoning the one the squad has drilled — in the same Σ(rating − penalty) the
 * auto-pick maximises.
 *
 * Six, half the limit above, so the decision cannot flip on the rounding
 * difference between two near-equal shapes, and a switch always buys back at
 * least what half a displaced line costs. Reshaping is not free (see
 * `buildMatchTeam`, which charges the drill cost for the match), so a marginal
 * gain is not a reason.
 */
export const RESHAPE_MIN_GAIN = 6;

/** A shape a club fell back on for one match, and the eleven that staffs it. */
export interface MatchdayShape {
  readonly formation: Formation;
  readonly lineup: string[];
  readonly roles: Record<string, RoleKey>;
}

/**
 * Is it better to field someone out of position, or to change shape for the day?
 *
 * Asked on every matchday, and the answer is almost always "keep the shape"
 * (`undefined`) — a club with a healthy squad never has its team rearranged,
 * because with nobody missing there is nothing for the absences to have forced.
 *
 * Two separate questions, deliberately not conflated:
 *
 *  - IS THE SHAPE THE PROBLEM? Only if the absences forced more than
 *    {@link RESHAPE_FORCED_COST_LIMIT} points of positional cost onto it. Judged
 *    on the BEST eleven each way, never on the eleven actually picked: a stored XI
 *    that has drifted behind the squad is a selection problem and reshaping the
 *    team would not fix it, it would just hide it.
 *  - WHICH SHAPE THEN? The one whose best eleven scores highest on exactly the
 *    measure career creation uses (`chooseFormation`'s Σ(rating − penalty)), and
 *    it has to beat the current shape by {@link RESHAPE_MIN_GAIN} to be taken.
 *    Reusing that measure is deliberate: judging shapes on positional cost alone
 *    would field three centre-backs and two full-backs-at-wing-back over a working
 *    4-4-2, because "close enough" is cheap and nobody is a wing-back. Trading fit
 *    against quality is the only comparison that does not fall for that.
 *
 * Reshaping re-picks the whole eleven, because slot indices mean nothing across
 * templates — which is also why it takes a threshold this high to be worth doing.
 */
export function reshapeForMatchday(
  /** Who can play today. */
  available: readonly PoolEntry[],
  /** The whole squad, fit or not — the baseline the forced cost is measured against. */
  squad: readonly PoolEntry[],
  formation: Formation,
): MatchdayShape | undefined {
  if (available.length === squad.length) return undefined; // nobody missing, nothing forced
  const now = fitFormation(available, formation);
  if (now.penalty - fitFormation(squad, formation).penalty <= RESHAPE_FORCED_COST_LIMIT) return undefined;

  let best: { formation: Formation; fit: ReturnType<typeof fitFormation> } | undefined;
  for (const f of Object.values(Formation)) {
    if (f === formation) continue;
    const fit = fitFormation(available, f);
    // Ties break to the lower formation key, as `chooseFormation` does, so the choice is total.
    if (!best || fit.score > best.fit.score || (fit.score === best.fit.score && f < best.formation)) best = { formation: f, fit };
  }
  if (!best || best.fit.score < now.score + RESHAPE_MIN_GAIN) return undefined;
  return { formation: best.formation, lineup: best.fit.lineup, roles: best.fit.roles };
}

/** Pick the formation whose best XI fits the squad's real positions best. */
export function chooseFormation(playerIds: readonly string[], dataById: ReadonlyMap<string, PlayerData>, devById: ReadonlyMap<string, PlayerDev>): Formation {
  const pool = buildPool(playerIds, dataById, devById);
  let best: { f: Formation; score: number } | undefined;
  for (const f of Object.values(Formation)) {
    const { score } = fitFormation(pool, f);
    if (!best || score > best.score || (score === best.score && f < best.f)) best = { f, score };
  }
  return best?.f ?? Formation.F442;
}

export function autoPickXI(
  playerIds: readonly string[],
  formation: Formation,
  dataById: ReadonlyMap<string, PlayerData>,
  devById: ReadonlyMap<string, PlayerDev>,
): { lineup: string[]; bench: string[]; roles: Record<string, RoleKey> } {
  const pool = buildPool(playerIds, dataById, devById);
  const { lineup, roles, used } = fitFormation(pool, formation);
  const bench = pool.filter((p) => !used.has(p.id)).map((p) => p.id);
  return { lineup, bench, roles };
}

/** Build a complete StoredTactics for a squad by auto-picking its XI. */
export function autoTactics(
  playerIds: readonly string[],
  formation: Formation,
  mentality: Mentality,
  dataById: ReadonlyMap<string, PlayerData>,
  devById: ReadonlyMap<string, PlayerDev>,
): StoredTactics {
  return { ...autoPickXI(playerIds, formation, dataById, devById), instructions: defaultInstructions(mentality) };
}

/** Starting familiarity for a freshly auto-picked tactic — known, not yet drilled. */
export const DEFAULT_FAMILIARITY = 60;

/**
 * How many substitutes actually dress for a match. `StoredTactics.bench` lists
 * the WHOLE rest of the squad, ordered by preference — only the first
 * `MATCHDAY_BENCH_SIZE` of it are the real substitutes a match is built with;
 * the rest are reserves who don't travel. Reordering that prefix (moving a
 * reserve above the line, pushing someone else below it) IS "picking the bench".
 *
 * Twelve, which is what the Brasileirão actually names, so an XI plus this bench
 * is a squad of 23. Note this is who is AVAILABLE, not how many changes you get
 * — that stays with `SubstitutionRules` (five, in three windows).
 */
export const MATCHDAY_BENCH_SIZE = 12;

/**
 * Build a brand-new saved tactic for a squad: CHOOSES the formation that best
 * suits the squad's real positions, then auto-picks the XI for it — so a new
 * tactic lines up sensibly out of the box. Caller assigns `id`/`name`.
 */
export function buildDefaultTactic(
  playerIds: readonly string[],
  mentality: Mentality,
  dataById: ReadonlyMap<string, PlayerData>,
  devById: ReadonlyMap<string, PlayerDev>,
): Omit<SavedTactic, "id" | "name"> {
  const formation = chooseFormation(playerIds, dataById, devById);
  return { ...autoTactics(playerIds, formation, mentality, dataById, devById), formation, mentality, familiarity: DEFAULT_FAMILIARITY };
}

/**
 * Bring a club's saved tactics back in line with its squad, after the roster changed.
 *
 * Every roster change has to run through here, because a stored lineup is a list of player IDS and
 * nothing else keeps it honest. Selling a player used to remove him from `squad.playerIds` and leave
 * him in the seller's `lineup`, where `buildMatchTeam` happily fielded him — so the same man started
 * for both clubs, the engine's agent index (keyed by player id) had one agent silently overwrite the
 * other, and the match never finished.
 *
 * Applied to EVERY saved tactic, not just the active one: a manager who swaps shapes for a big game
 * would otherwise find a ghost in the tactic he had not looked at since the sale.
 *
 * What it deliberately does NOT do is re-pick the XI. A departure leaves a hole, and only that hole
 * is filled; the manager's other ten choices, his roles, his dragged positions and his bench order
 * all survive. Nor does it reconsider the formation — a squad change is not a mandate to reshape the
 * team, and the one place shape IS reconsidered is the matchday, where it costs nothing permanent
 * (see `reshapeForMatchday`).
 *
 * The holes it does fill are solved TOGETHER by `fillLineupHoles`, not handed one at a time to the
 * best-rated body left. It used to be the latter, and because the result is WRITTEN BACK here, one
 * absurd fill outlived by many months the departure that caused it: measured over five seasons, an
 * AI club's stored eleven fell 85 rating points behind the best eleven it could have named.
 */
export function reconcileTactics(
  club: { readonly squad: { readonly playerIds: readonly string[] }; readonly tacticSlots: readonly SavedTactic[] },
  dataById: ReadonlyMap<string, PlayerData>,
  devById: ReadonlyMap<string, PlayerDev>,
): boolean {
  const squad = new Set(club.squad.playerIds);
  let changed = false;

  for (const tactic of club.tacticSlots) {
    const template = getFormationTemplate(tactic.formation);
    /*
     * Holes, never a filter. `lineup` is indexed BY FORMATION SLOT — `slotFielded[i]` and
     * `slotPositions[i]` line up with it — so compacting the array would slide every player one
     * slot left and quietly rearrange the team around the person who left.
     */
    const lineup = template.map((_, i) => {
      const id = tactic.lineup[i];
      return id && squad.has(id) ? id : "";
    });
    if (lineup.some((id, i) => id !== (tactic.lineup[i] ?? ""))) changed = true;

    // Fill every hole in one solve, over whoever is left, at the position each hole is fielded at.
    const kept = new Set(lineup.filter(Boolean));
    const spare = buildPool(club.squad.playerIds.filter((id) => !kept.has(id)), dataById, devById);
    const filled = fillLineupHoles(lineup, template.map((s) => s.position), spare);
    const used = new Set(filled.filter(Boolean));

    /*
     * A refilled slot loses the manager's chosen position for it. `slotFielded[i]` said "play THAT
     * man somewhere other than the template's job" — it is a decision about a person, and the person
     * is gone. Left in place it silently asks the replacement for a job nobody asked him about: a
     * full-back's slot relabelled "striker" once had an attacking midfielder fielded up front at a
     * fit of 0.77 because the full-back had been sold. `slotPositions[i]` is NOT dropped: dragging a
     * shirt moves the SHAPE, and the shape survives the man.
     */
    if (tactic.slotFielded) {
      for (const [i, id] of filled.entries()) {
        if (!id || lineup[i] || tactic.slotFielded[i] === undefined) continue;
        tactic.slotFielded[i] = undefined;
        changed = true;
      }
    }

    /*
     * The bench keeps its order, loses whoever left, and GAINS anyone the squad has that it has
     * never heard of — which is how a new signing becomes selectable without the manager having to
     * find him. `buildMatchTeam` already falls back to the squad for a matchday bench, so this is
     * about what the tactics board shows.
     */
    const bench: string[] = [];
    for (const id of [...tactic.bench, ...club.squad.playerIds]) {
      if (squad.has(id) && !used.has(id) && !bench.includes(id)) bench.push(id);
    }
    if (bench.length !== tactic.bench.length || bench.some((id, i) => id !== tactic.bench[i])) changed = true;

    // A role belonging to someone who left is dead weight; a backfilled player is left without one
    // on purpose, so `buildMatchTeam` gives him his slot's default rather than inheriting a stranger's.
    for (const id of Object.keys(tactic.roles)) {
      if (!squad.has(id)) {
        delete tactic.roles[id];
        changed = true;
      }
    }

    tactic.lineup = filled;
    tactic.bench = bench;
  }
  return changed;
}
