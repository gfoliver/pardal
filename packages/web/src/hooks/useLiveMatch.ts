import { useCallback, useEffect, useRef, useState } from "react";
import { MatchRules, type Mentality, SubstitutionRules, type Team } from "@fut/domain";
import {
  LiveMatch,
  ManualCoachController,
  type LiveSnapshot,
  type MatchEvent,
  type MatchResult,
} from "@fut/engine";

/** Playback speed as a minute-advance multiplier (0 = paused). */
export type Speed = 0 | 1 | 2 | 4;
const MS_PER_MINUTE = 750;

export interface LiveController {
  snapshot: LiveSnapshot | null;
  events: MatchEvent[];
  finished: boolean;
  result: MatchResult | null;
  speed: Speed;
  setSpeed: (s: Speed) => void;
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
    const id = window.setInterval(step, MS_PER_MINUTE / speed);
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
    snapshot, events, finished, result, speed, setSpeed, finishNow,
    substitute, changeMentality, canSubstitute, bench, onPitch,
  };
}
