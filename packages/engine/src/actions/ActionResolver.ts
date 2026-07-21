import { type RandomSource } from "../random/RandomSource.js";
import { type RefereeAdjudicator } from "../referee/RefereeAdjudicator.js";
import { type MatchEvent } from "../result/MatchEvent.js";
import { type MatchState } from "../state/MatchState.js";

/** Everything a resolver needs to resolve one action and mutate the state. */
export interface ResolutionContext {
  readonly state: MatchState;
  readonly rng: RandomSource;
  readonly referee: RefereeAdjudicator;
}

/**
 * Resolves one on-ball action, mutating the match state and returning the
 * timeline events it produced. New actions plug in via the registry (OCP)
 * without touching the simulation loop.
 */
export interface ActionResolver {
  resolve(ctx: ResolutionContext): MatchEvent[];
}
