import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { Team, TeamInstructions } from "@fut/domain";
import { CardColor, DecidedBy, MatchEventType, type DisciplineRecord, type MatchEvent, type MatchOutcome, type TeamStats } from "@fut/engine";
import { SpatialMatch, type SpatialSnapshot } from "@fut/spatial";

export type Speed = 0 | 1 | 2 | 4;

const DT = 0.1; // fixed sim timestep (s) — matches the engine's determinism
const SIM_PER_REAL = 3; // sim-seconds advanced per real second at 1× — sets on-screen motion speed (fluid, natural). Full match ≈ 10 min IRL at 1× (5 at 2×, 2.5 at 4×); the pace comes from CLOCK.matchScale, NOT here — raising this would speed up player motion.
const MAX_STEPS_PER_FRAME = 400; // spiral-of-death guard
const SKIP_BUDGET_MS = 10; // per-frame work budget while fast-forwarding
const RENDER_MS = 80; // throttle React repaints (~12 fps); the CSS transition smooths between them

/** A finished-match report (shape shared with the zone MatchResult fields the UI uses). */
export interface SpatialReport {
  homeTeamName: string;
  awayTeamName: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  stats: { home: TeamStats; away: TeamStats };
  timeline: readonly MatchEvent[];
  /** Cards, folded out of the timeline — the career reads this to book players. */
  discipline: DisciplineRecord;
  outcome: MatchOutcome;
}

/** Fold Card events into the discipline record the career/engine contract expects. */
function disciplineOf(events: readonly MatchEvent[]): DisciplineRecord {
  const byPlayer: Record<string, { yellow: number; red: boolean }> = {};
  let yellowCards = 0;
  let redCards = 0;
  for (const e of events) {
    if (e.type !== MatchEventType.Card || !e.playerId) continue;
    const rec = (byPlayer[e.playerId] ??= { yellow: 0, red: false });
    if (e.params?.color === CardColor.Red) {
      rec.red = true;
      redCards++;
    } else {
      rec.yellow++;
      yellowCards++;
    }
  }
  return { yellowCards, redCards, byPlayer };
}

function report(m: SpatialMatch, home: Team, away: Team): SpatialReport {
  return {
    homeTeamName: home.name,
    awayTeamName: away.name,
    homeTeamId: home.id,
    awayTeamId: away.id,
    homeScore: m.score.home,
    awayScore: m.score.away,
    stats: m.stats,
    timeline: [...m.events],
    discipline: disciplineOf(m.events),
    outcome: {
      winnerTeamId: m.score.home === m.score.away ? undefined : m.score.home > m.score.away ? home.id : away.id,
      decidedBy: m.score.home === m.score.away ? DecidedBy.Draw : DecidedBy.Regulation,
    },
  };
}

/** Run a spatial match to full time instantly (for the quick-sim path). */
export function simulateSpatial(home: Team, away: Team, seed: number): SpatialReport {
  const m = new SpatialMatch({ home, away, seed });
  let guard = 0;
  while (!m.finished && guard++ < 100_000) m.tick(DT);
  return report(m, home, away);
}

export interface SpatialController {
  snapshot: SpatialSnapshot | null;
  events: readonly MatchEvent[];
  /** Running match stats, updated live each frame (for a real-time panel). */
  stats: { home: TeamStats; away: TeamStats } | null;
  finished: boolean;
  result: SpatialReport | null;
  speed: Speed;
  setSpeed: (s: Speed) => void;
  finishNow: () => void;
  /** True while fast-forwarding to full time. */
  skipping: boolean;
  // In-match management (for the managed team).
  subsRemaining: (teamId: string) => number;
  onPitch: (teamId: string) => { id: string; name: string; position: string; stamina: number }[];
  bench: (teamId: string) => { id: string; name: string; position: string }[];
  substitute: (teamId: string, outId: string, inId: string) => boolean;
  setInstruction: (teamId: string, patch: Partial<TeamInstructions>) => void;
}

/** Snapshot the running stats into fresh objects so React re-renders. */
function liveStats(m: SpatialMatch): { home: TeamStats; away: TeamStats } {
  return { home: { ...m.stats.home }, away: { ...m.stats.away } };
}

export function useSpatialMatch(home: Team, away: Team, seed: number): SpatialController {
  const ref = useRef<SpatialMatch | null>(null);
  const acc = useRef(0);
  const last = useRef(0);
  const lastRender = useRef(0);
  const [snapshot, setSnapshot] = useState<SpatialSnapshot | null>(null);
  const [events, setEvents] = useState<readonly MatchEvent[]>([]);
  const [stats, setStats] = useState<{ home: TeamStats; away: TeamStats } | null>(null);
  const [finished, setFinished] = useState(false);
  const [result, setResult] = useState<SpatialReport | null>(null);
  const [speed, setSpeed] = useState<Speed>(0);
  const [skipping, setSkipping] = useState(false);
  const skipping_ = useRef(false);
  const [, force] = useReducer((x: number) => x + 1, 0);

  // (Re)build the match on fixture/seed change.
  useEffect(() => {
    const m = new SpatialMatch({ home, away, seed });
    ref.current = m;
    acc.current = 0;
    last.current = 0;
    setSnapshot(m.snapshot());
    setEvents([]);
    setStats(liveStats(m));
    setFinished(false);
    setResult(null);
    setSpeed(0);
    skipping_.current = false;
    setSkipping(false);
  }, [home, away, seed]);

  // Fixed-timestep accumulator driven by rAF. Advances the sim by real elapsed
  // time × speed in fixed DT steps, then renders the snapshot.
  useEffect(() => {
    if (speed === 0 || finished) return;
    let raf = 0;
    last.current = 0;
    const loop = (now: number) => {
      const m = ref.current;
      if (!m) return;
      const realDt = Math.min(0.05, last.current ? (now - last.current) / 1000 : 0);
      last.current = now;
      acc.current += realDt * SIM_PER_REAL * speed;
      let steps = 0;
      while (acc.current >= DT && !m.finished && steps < MAX_STEPS_PER_FRAME) {
        m.tick(DT);
        acc.current -= DT;
        steps++;
      }
      // Throttle React repaints — the sim ticks every frame, but we only push
      // new state ~12×/s (the CSS transition interpolates the rest).
      if (now - lastRender.current >= RENDER_MS || m.finished) {
        lastRender.current = now;
        setSnapshot(m.snapshot());
        setEvents([...m.events]);
        setStats(liveStats(m));
      }
      if (m.finished) {
        setFinished(true);
        setResult(report(m, home, away));
        setSpeed(0);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [speed, finished, home, away]);

  /**
   * Fast-forward to full time WITHOUT blocking the UI. Simulating the rest of a
   * match is ~50k ticks — doing it in one synchronous loop froze the page for
   * >10s. Instead we run slices with a small work budget and yield between them,
   * so the clock keeps updating and the tab stays responsive. Scheduled with
   * `setTimeout` (not rAF) so it still completes when the tab/pane isn't
   * painting — otherwise the skip would silently stall.
   */
  const finishNow = useCallback(() => {
    const m = ref.current;
    if (!m || m.finished || skipping_.current) return;
    skipping_.current = true;
    setSpeed(0);
    setSkipping(true);
    const slice = () => {
      const cur = ref.current;
      if (!cur || cur !== m) return; // match was replaced mid-skip
      const until = performance.now() + SKIP_BUDGET_MS;
      let guard = 0;
      while (!cur.finished && performance.now() < until && guard++ < 20_000) cur.tick(DT);
      setSnapshot(cur.snapshot());
      setEvents([...cur.events]);
      setStats(liveStats(cur));
      if (cur.finished) {
        skipping_.current = false;
        setSkipping(false);
        setFinished(true);
        setResult(report(cur, home, away));
        return;
      }
      setTimeout(slice, 0);
    };
    setTimeout(slice, 0);
  }, [home, away]);

  const subsRemaining = useCallback((teamId: string) => ref.current?.subsRemaining(teamId) ?? 0, []);
  const onPitch = useCallback((teamId: string) => ref.current?.onPitch(teamId) ?? [], []);
  const bench = useCallback((teamId: string) => ref.current?.bench(teamId) ?? [], []);
  const substitute = useCallback((teamId: string, outId: string, inId: string) => {
    const ok = ref.current?.requestSub(teamId, outId, inId) ?? false;
    if (ok) {
      setSnapshot(ref.current!.snapshot());
      setEvents([...ref.current!.events]);
      force();
    }
    return ok;
  }, []);
  const setInstruction = useCallback((teamId: string, patch: Partial<TeamInstructions>) => {
    ref.current?.setInstructions(teamId, patch);
    force();
  }, []);

  return { snapshot, events, stats, finished, result, speed, setSpeed, finishNow, skipping, subsRemaining, onPitch, bench, substitute, setInstruction };
}
