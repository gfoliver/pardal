/**
 * Engine tunables, grouped by layer. These are the ONLY magic numbers in the
 * engine — every layer reads its constants from here so calibration is a matter
 * of editing this one file. Values are plausible-realistic starting points
 * (SI units: metres, seconds, m/s); calibration comes after the architecture is
 * whole.
 */

/** Update cadences (Hz) for the layered simulation loop (see design doc). */
export const RATES = {
  physicsHz: 60, // integration of motion + ball
  analysisHz: 20, // rebuild spatial/influence maps
  decisionHz: 10, // objective planning + utility AI
  strategyHz: 2, // collective/tactical strategy
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
  foulOnMiss: 0.02, // chance a failed tackle is a foul (scaled by aggression)
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
