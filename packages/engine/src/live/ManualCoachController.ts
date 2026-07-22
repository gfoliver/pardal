import { type CoachController, type CoachDecision } from "../coach/CoachController.js";

/**
 * A coach controller driven by an external agent (a human via the UI). It holds
 * a queue of decisions; the simulator drains it each time it asks the coach to
 * decide, so human substitutions / tactic changes flow through the exact same
 * validated path as the AI's (subs against the rules, tactic changes with the
 * assimilation delay) — see `LiveMatch` / `MatchSimulator`.
 */
export class ManualCoachController implements CoachController {
  private queue: CoachDecision[] = [];

  enqueue(decision: CoachDecision): void {
    this.queue.push(decision);
  }

  decide(): CoachDecision[] {
    if (this.queue.length === 0) return [];
    const drained = this.queue;
    this.queue = [];
    return drained;
  }
}
