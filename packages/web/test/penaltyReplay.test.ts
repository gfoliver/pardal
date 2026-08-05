// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { MatchEventType, penaltyKickOf, type MatchEvent } from "@fut/engine";
import { describe, expect, it } from "vitest";
import { usePenaltyReplay } from "../src/components/match/LiveMatchView";
import type { SpatialController, Speed } from "../src/hooks/useSpatialMatch";

/**
 * The bug this pins was reported from play: watch a penalty, make a substitution, and the SAME penalty
 * is put back on the screen with the clock stopped again.
 *
 * The cause was a lifetime mismatch. `LiveMatchView` is unmounted and remounted twice in an ordinary
 * match — the tactics board replaces the whole subtree, and so does the skip view — while the event feed
 * it watches belongs to the match. A watermark held in a ref therefore restarted at zero on the way back,
 * rescanned from the first minute, and found a penalty the manager had already sat through.
 *
 * It cannot be verified in a browser: the match advances on `requestAnimationFrame`, and the in-app
 * browser pane is `document.hidden`, where rAF never fires. So it is pinned here, at the level the defect
 * actually lives — mount, unmount, mount, with the feed unchanged.
 */

/**
 * A penalty the hook will actually recognise.
 *
 * `penaltyKickOf` returns null unless `placeX` is a number and `pkOutcome` a string, and the first draft
 * of these tests supplied neither. Every "does not replay" case passed — for the wrong reason: nothing
 * was a penalty, so of course nothing replayed. Hence the first test below, which asserts the fixture is
 * a real penalty before any behaviour is claimed about it.
 */
const penalty = (minute: number): MatchEvent =>
  ({
    type: MatchEventType.Penalty,
    minute,
    teamId: "home",
    playerName: "Camilo",
    params: { placeX: 0.3, placeY: 0.55, keeperDive: -1, keeperDiveHeight: 0.4, pkOutcome: "scored" },
  }) as unknown as MatchEvent;

const goal = (minute: number): MatchEvent =>
  ({ type: MatchEventType.Goal, minute, teamId: "home", playerName: "Camilo" }) as unknown as MatchEvent;

/**
 * Only the three members the hook touches; the controller itself has forty.
 *
 * ONE object per test, whose `events` array is replaced in place — the hook calls `setSpeed` on the
 * controller it was handed, so re-rendering with a fresh object would pause a controller nobody is
 * looking at. (The first draft did exactly that, and read the speed off the abandoned one.)
 */
function controller(events: readonly MatchEvent[] = []) {
  const c = {
    events,
    speed: 1 as Speed,
    setSpeed(s: Speed) {
      c.speed = s;
    },
  };
  return c as unknown as SpatialController & { speed: Speed; events: readonly MatchEvent[] };
}

const mount = (live: SpatialController) =>
  renderHook((l: SpatialController) => usePenaltyReplay(l), { initialProps: live });

describe("usePenaltyReplay", () => {
  it("is testing something the engine calls a penalty", () => {
    // The guard against a file full of vacuous passes. If this breaks, everything below means nothing.
    expect(penaltyKickOf(penalty(22))).not.toBeNull();
    expect(penaltyKickOf(goal(4))).toBeNull();
  });

  it("stops the match and shows a penalty that has just happened", () => {
    const live = controller([goal(4)]);
    const { result, rerender } = mount(live);
    expect(result.current.event).toBeNull();

    live.events = [goal(4), penalty(22)];
    rerender(live);
    expect(result.current.event?.minute).toBe(22);
    expect(result.current.kick).not.toBeNull();
    expect(live.speed).toBe(0);
  });

  it("does not replay a penalty already in the feed when it mounts", () => {
    // Coming back from the tactics board. The penalty is history, not news.
    const { result } = mount(controller([goal(4), penalty(22), goal(31)]));
    expect(result.current.event).toBeNull();
  });

  it("leaves the clock alone on that mount", () => {
    // The other half of the damage: it did not just re-open the dialog, it re-paused the game.
    const live = controller([penalty(22)]);
    mount(live);
    expect(live.speed).toBe(1);
  });

  it("survives the full unmount-remount cycle without replaying", () => {
    const live = controller([goal(4), penalty(22)]);
    const first = mount(live);
    first.result.current.close();
    first.unmount();

    // Same feed, new mount — exactly what pressing "manage" and then closing the board does.
    const second = mount(live);
    expect(second.result.current.event).toBeNull();
  });

  it("still shows a penalty that arrives after a remount", () => {
    // The seeding must not go so far as to make the view deaf: a SECOND penalty still interrupts.
    const live = controller([penalty(22)]);
    const { result, rerender } = mount(live);
    expect(result.current.event).toBeNull();

    live.events = [penalty(22), penalty(70)];
    rerender(live);
    expect(result.current.event?.minute).toBe(70);
  });

  it("scans from the start when the feed has been replaced by a new match", () => {
    // A shorter feed means a different match, whose events are all news.
    const live = controller([goal(4), penalty(22), goal(31), goal(80)]);
    const { result, rerender } = mount(live);
    live.events = [penalty(9)];
    rerender(live);
    expect(result.current.event?.minute).toBe(9);
  });

  it("hands the clock back at the speed it was running", () => {
    const live = controller([goal(4)]);
    live.setSpeed(4 as Speed);
    const { result, rerender } = mount(live);

    live.events = [goal(4), penalty(22)];
    rerender(live);
    expect(live.speed).toBe(0); // paused for the replay...

    result.current.close();
    expect(live.speed).toBe(4); // ...and returned, so pausing for it costs nothing
  });
});
