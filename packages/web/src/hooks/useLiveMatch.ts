import { useCallback, useEffect, useRef, useState } from "react";
import { MatchRules, type Mentality, SubstitutionRules, type Team } from "@fut/domain";
import {
  LiveMatch,
  ManualCoachController,
  type LiveSnapshot,
  type MatchEvent,
  type MatchResult,
} from "@fut/engine";

/** Playback speed multiplier (0 = paused). advance() now steps per action-step
 *  (3 per minute), so a "frame" is one third of a match minute. */
export type Speed = 0 | 1 | 2 | 4;
const MS_PER_FRAME = 620;

export interface LiveController {
  snapshot: LiveSnapshot | null;
  events: MatchEvent[];
  finished: boolean;
  result: MatchResult | null;
  speed: Speed;
  setSpeed: (s: Speed) => void;
  /** Milliseconds of the current frame — match CSS transitions to it for a
   *  continuous glide between positions. */
  frameMs: number;
  finishNow: () => void;
  substitute: (outId: string, inId: string) => void;
  changeMentality: (m: Mentality) => void;
  canSubstitute: () => boolean;
  bench: () => readonly { id: string; name: string; pos: string }[];
  onPitch: () => readonly { id: string; name: string; pos: string }[];
}

export function useLiveMatch(home: Team, away: Team, seed: number): LiveController {
  const matchRef = useRef<LiveMatch | null>(null);
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [finished, setFinished] = useState(false);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [speed, setSpeed] = useState<Speed>(0);

  // Build (or rebuild) the live match whenever the fixture/seed changes.
  useEffect(() => {
    const m = new LiveMatch({
      home,
      away,
      seed,
      matchRules: MatchRules.league(),
      substitutionRules: SubstitutionRules.brasileirao(),
      homeController: new ManualCoachController(),
    });
    matchRef.current = m;
    setSnapshot(m.snapshot());
    setEvents([]);
    setFinished(false);
    setResult(null);
    setSpeed(0);
  }, [home, away, seed]);

  const step = useCallback(() => {
    const m = matchRef.current;
    if (!m || m.finished) return;
    const { events: produced, done } = m.advance();
    setSnapshot(m.snapshot());
    if (produced.length) setEvents((prev) => [...prev, ...produced]);
    if (done) {
      setFinished(true);
      setResult(m.result());
      setSpeed(0);
    }
  }, []);

  useEffect(() => {
    if (speed === 0 || finished) return;
    const id = window.setInterval(step, MS_PER_FRAME / speed);
    return () => window.clearInterval(id);
  }, [speed, finished, step]);

  const finishNow = useCallback(() => {
    const m = matchRef.current;
    if (!m) return;
    let guard = 0;
    while (!m.advance().done && guard++ < 10_000) {
      /* drain */
    }
    setSnapshot(m.snapshot());
    setEvents(m.result().timeline as MatchEvent[]);
    setFinished(true);
    setResult(m.result());
    setSpeed(0);
  }, []);

  const substitute = useCallback((outId: string, inId: string) => {
    matchRef.current?.requestSubstitution(home.id, outId, inId);
  }, [home.id]);

  const changeMentality = useCallback((m: Mentality) => {
    matchRef.current?.requestTacticChange(home.id, home.tactics.withInstructions({ mentality: m }));
  }, [home]);

  const canSubstitute = useCallback(() => matchRef.current?.canSubstitute(home.id) ?? false, [home.id]);
  const bench = useCallback(() => matchRef.current?.benchFor(home.id) ?? [], [home.id]);
  const onPitch = useCallback(() => matchRef.current?.onPitchFor(home.id) ?? [], [home.id]);

  return {
    snapshot, events, finished, result, speed, setSpeed,
    frameMs: MS_PER_FRAME / (speed || 1),
    finishNow,
    substitute, changeMentality, canSubstitute, bench, onPitch,
  };
}
