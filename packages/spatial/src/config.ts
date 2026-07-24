/**
 * Engine tunables, grouped by layer. These are the ONLY magic numbers in the
 * engine — every layer reads its constants from here so calibration is a matter
 * of editing this one file. Values are plausible-realistic starting points
 * (SI units: metres, seconds, m/s); calibration comes after the architecture is
 * whole.
 */

/**
 * Match-clock pacing. The displayed clock advances FASTER than the simulated
 * play, so a watched match reaches full time sooner WITHOUT speeding up player
 * motion — the same time-compression every football game uses. `matchScale`
 * match-seconds tick per simulated second; only the clock is scaled (physics,
 * decisions and movement all run on real time, so motion stays natural/fluid).
 *
 * Tuned so a full match takes ~10 min IRL at 1× (→ 5 min at 2×, 2.5 min at 4×),
 * given the watch loop's SIM_PER_REAL = 3 (useSpatialMatch): a match runs
 * ~1800 simulated seconds, / 3 = ~600 s = 10 min. Fewer events fit into the
 * shorter match — an accepted trade-off (stats get calibrated later).
 */
export const CLOCK = {
  matchScale: 3.1,
} as const;

/** Update cadences (Hz) for the layered simulation loop (see design doc). */
export const RATES = {
  physicsHz: 60, // integration of motion + ball
  analysisHz: 20, // rebuild spatial/influence maps
  decisionHz: 10, // objective planning + utility AI
  strategyHz: 2, // collective/tactical strategy
} as const;

/**
 * Stamina / fatigue. Stamina (0..1) starts at the player's pre-match `condition`
 * and drains with DISTANCE COVERED; a high stamina attribute tires slower. As it
 * falls, top speed and accel drop toward `minFactor`. Tuned so an average player
 * ends a full match around ~0.55–0.7.
 */
export const STAMINA = {
  drainPerM: 0.00009, // stamina lost per metre run, before the attribute divisor
  staminaRef: 0.6, // divisor offset: drain ∝ 1/(staminaRef + staminaAttr)
  minFactor: 0.82, // speed/accel multiplier when fully exhausted
} as const;

/** Player kinematics. Elite sprint ≈ 8–9 m/s; accel 0→top in ~1.3 s. */
export const KINEMATICS = {
  baseSpeed: 6.0, // m/s at pace 0
  paceSpeed: 2.6, // + this * paceNorm  → top speed
  baseAccel: 4.0, // m/s² at 0 agility
  agilityAccel: 2.5, // + this * agilityNorm
  turnRate: 5.5, // rad/s cap on heading change (inertia)
  arriveRadius: 4.0, // m: ease-down radius approaching a target
  keeperSpeedFactor: 0.9,
} as const;

/** Ball physics and passing/shooting. */
export const BALL = {
  friction: 4.5, // m/s² rolling deceleration
  dribbleAtFeet: 1.0, // m the ball sits ahead of the carrier
  passArriveSpeed: 4.5, // m/s target speed at the receiver → sets launch pace
  passSpeedMin: 8,
  passSpeedMax: 26,
  shotSpeed: 30, // m/s driven shot (record ≈ 50)
  shotSpeedVar: 6, // + shotPower scaling
  controlRadius: 1.3, // m to collect a loose ball
  receiverRadius: 2.3, // m: intended receiver's generous first-touch radius
  interceptRadius: 1.2, // m: an opponent must run this close to a lane to intercept
  launchProtect: 3.0, // m: a released ball can't be collected until it clears this (beats the near presser)
} as const;

/** First-touch / decision tempo. */
export const TEMPO = {
  firstTouch: 1.3, // s a receiver controls/carries before its next action (sets tempo — calmer)
  carrySpeed: 3.4, // m/s while settling/carrying the ball
  keeperHold: 2.8, // s a keeper holds a caught ball before distributing
  softmaxTau: 0.12, // utility-AI temperature (small → mostly-best choice)
} as const;

/** Contest / duel model. */
export const DUEL = {
  tackleRadius: 1.5,
  tackleCooldown: 2.3, // s between tackle attempts on a carrier (pressing mostly CONTAINS)
  tackleBase: 0.05, // base success before skill delta
  tackleSkill: 0.18, // * (tackling − dribbling)
  tackleMin: 0.02,
  tackleMax: 0.24,
  foulOnMiss: 0.035, // chance a failed tackle is a foul (scaled by aggression)
} as const;

/** Aerial physics (ball height, z). Players move on the ground plane; only the
 *  ball has a height — enough for lofted balls, chips, crosses and (later) headers. */
export const AIR = {
  gravity: 13, // m/s² (a touch above 9.8 for snappier arcs at this scale)
  bounce: 0.55, // restitution on landing
  drag: 0.12, // fraction of ground friction applied to a ball in flight
  reach: 2.2, // m: max height an outfielder can play the ball (head/chest)
  keeperReach: 2.75, // m: keeper can claim higher (jump/reach)
  crossbar: 2.44, // m: goal height — shots above this go over the bar
} as const;

/** Aerial contests — crosses dropping into the box and headers. A ball above
 *  `headMin` is contested in the air (a header/jump) rather than at the feet. */
export const AERIAL = {
  headMin: 1.4, // m: ball height above which a reception is an aerial duel (header)
  jumpReach: 2.65, // m: max height an outfielder reaches jumping to head it
  radius: 2.9, // m: horizontal radius within which players contest a dropping ball
  headerShotSpeed: 15, // m/s of a downward header at goal (weaker than a foot shot)
  clearSpeed: 17, // m/s of a defensive header clearance
  crossArch: 1.35, // arch scale of a cross (high enough to drop from above into the box)
} as const;

/** When the ball leaves the pitch it keeps travelling its natural course for
 *  this long (seconds) before the restart snaps it to the spot — so you see
 *  exactly where a shot finished (how close/wide/high) instead of an instant
 *  teleport. */
export const RESTART = {
  exitRoll: 1.0, // max seconds the out-of-play ball keeps rolling before the restart
  exitMaxBeyond: 4.0, // …or until it is this many metres past the boundary (fast shots reset once clearly out, staying on-screen)
} as const;

/** Dead-ball pauses (seconds) — football isn't frenetic; play stops and resets. */
export const DEADBALL = {
  throwIn: 1.8,
  goalKick: 2.4,
  corner: 3.0,
  freeKick: 4.0,
  penalty: 4.2,
  kickoff: 4.0,
  wall: 9.15, // free-kick defensive wall distance from the ball
} as const;

/** Spatial-analysis influence maps. */
export const MAPS = {
  cell: 5, // m grid resolution (105×68 → 21×14)
  sigma: 7, // m Gaussian falloff of a player's influence
  arrivalWeight: 0.6, // weight time-to-arrive vs raw distance in control
} as const;

/** Steering (context steering + separation). */
export const STEERING = {
  slots: 16, // direction slots around an agent
  separationRadius: 8.0, // m: teammates closer than this repel (keeps players spaced out)
  separationWeight: 2.6,
  dangerRadius: 6.0, // m: opponents within this add danger to slots
} as const;

/** SBSP formation positioning (home position derivation). */
export const FORMATION = {
  attrY: 0.55, // whole team shifts to the ball's side
  clipY: 14, // lateral clip (m) around the formation channel
  teamLengthMax: 42, // m front-to-back cap on the defending block
  // Attacking block that follows the ball: the deepest line trails the ball by
  // `attackTrail` m and the side spans `attackBlockLen` m up-pitch from there.
  attackTrail: 30,
  attackBlockLen: 40,
} as const;
