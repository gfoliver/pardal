import { useCallback, useEffect, useRef, useState } from "react";
import type { Team } from "@fut/domain";
import type { MatchEvent, TeamStats } from "@fut/engine";
import { SpatialMatch, type SpatialSnapshot } from "@fut/spatial";

export type Speed = 0 | 1 | 2 | 4;

const DT = 0.1; // fixed sim timestep (s) — matches the engine's determinism
const SIM_PER_REAL = 14; // sim-seconds advanced per real second at 1× (~90' in 6.4 min)
const MAX_STEPS_PER_FRAME = 400; // spiral-of-death guard

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
  finished: boolean;
  result: SpatialReport | null;
  speed: Speed;
  setSpeed: (s: Speed) => void;
  finishNow: () => void;
}

export function useSpatialMatch(home: Team, away: Team, seed: number): SpatialController {
  const ref = useRef<SpatialMatch | null>(null);
  const acc = useRef(0);
  const last = useRef(0);
  const [snapshot, setSnapshot] = useState<SpatialSnapshot | null>(null);
  const [events, setEvents] = useState<readonly MatchEvent[]>([]);
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
      setSnapshot(m.snapshot());
      setEvents([...m.events]);
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
    setFinished(true);
    setResult(report(m, home, away));
    setSpeed(0);
  }, [home, away]);

  return { snapshot, events, finished, result, speed, setSpeed, finishNow };
}
