import { Person } from "./Person.js";

/**
 * Referee identity. By design the referee has NO attributes and NO randomness:
 * the officiating logic (engine's `RefereeAdjudicator`) is a pure, infallible
 * function of the match state. This class only carries the person's identity.
 */
export class Referee extends Person {}
