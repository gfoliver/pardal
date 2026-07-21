/**
 * Optional context for a two-legged knockout tie, injected into the SECOND leg.
 * Goals are expressed from the perspective of THIS match's teams (home/away of
 * the current leg), so the engine can compute the aggregate directly.
 *
 * Example: team H won the first leg 2–0. When H hosts the second leg, pass
 * `new TieContext(2, 0)` → H's aggregate = 2 + (H's goals this match).
 *
 * The engine only *honours* this context to decide extra time / penalties for
 * this match; aggregating across legs is the future competition layer's job.
 */
export class TieContext {
  constructor(
    public readonly firstLegHomeTeamGoals: number,
    public readonly firstLegAwayTeamGoals: number,
  ) {}
}
