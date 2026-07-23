import { useCallback, useEffect, useRef, useState } from "react";
import type { Team } from "@fut/domain";
import type { MatchEvent, TeamStats } from "@fut/engine";
import { SpatialMatch, type SpatialSnapshot } from "@fut/spatial";

export type Speed = 0 | 1 | 2 | 4;

const DT = 0.1; // fixed sim timestep (s) — matches the engine's determinism
const SIM_PER_REAL = 3; // sim-seconds advanced per real second at 1× (~90' in ~30 min; calm — use 2×/4× to speed up)
const MAX_STEPS_PER_FRAME = 400; // spiral-of-death guard
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

  const finishNow = useCallback(() => {
    const m = ref.current;
    if (!m) return;
    let guard = 0;
    while (!m.finished && guard++ < 100_000) m.tick(DT);
    setSnapshot(m.snapshot());
    setEvents([...m.events]);
    setStats(liveStats(m));
    setFinished(true);
    setResult(report(m, home, away));
    setSpeed(0);
  }, [home, away]);

  return { snapshot, events, stats, finished, result, speed, setSpeed, finishNow };
}
