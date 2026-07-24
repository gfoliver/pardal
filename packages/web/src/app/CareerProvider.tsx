import { createContext, useCallback, useContext, useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { Career, type CareerCommand } from "@fut/career";
import { defaultLeague } from "../lib/career/dataset";
import { IndexedDbCareerStore, getLastSlot } from "../lib/career/storage";

export type CareerStatus = "loading" | "no-save" | "active";

interface CareerContextValue {
  status: CareerStatus;
  /** Bumps on every mutation so consumers re-render (Career is a mutable class). */
  version: number;
  career: Career | null;
  newGame: (managedClubId: string) => Promise<void>;
  loadGame: (slotId: string) => Promise<void>;
  saveNow: () => Promise<void>;
  advance: () => void;
  simulateSeason: () => void;
  rolloverSeason: () => void;
  dispatch: (command: CareerCommand) => void;
  /** Re-render + persist after a direct façade call (e.g. a committed match). */
  touch: () => void;
}

const Ctx = createContext<CareerContextValue | null>(null);

export function CareerProvider({ children }: { children: ReactNode }) {
  const careerRef = useRef<Career | null>(null);
  const slotRef = useRef<string | null>(null);
  const storeRef = useRef(new IndexedDbCareerStore());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<CareerStatus>("loading");
  const [version, bump] = useReducer((x: number) => x + 1, 0);

  const saveNow = useCallback(async () => {
    if (careerRef.current && slotRef.current) await storeRef.current.save(slotRef.current, careerRef.current.snapshot());
  }, []);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void saveNow(), 800);
  }, [saveNow]);

  // Boot: resume the last-played slot if there is one.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const slot = await getLastSlot();
        const snap = slot ? await storeRef.current.load(slot) : null;
        if (alive && slot && snap) {
          careerRef.current = Career.load(snap, defaultLeague());
          slotRef.current = slot;
          setStatus("active");
          bump();
          return;
        }
      } catch {
        /* fall through to no-save */
      }
      if (alive) setStatus("no-save");
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Flush pending save when the tab is hidden/closed.
  useEffect(() => {
    const flush = () => void saveNow();
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flush());
    return () => window.removeEventListener("beforeunload", flush);
  }, [saveNow]);

  const mutate = useCallback(
    (fn: (c: Career) => void) => {
      const c = careerRef.current;
      if (!c) return;
      fn(c);
      bump();
      scheduleSave();
    },
    [scheduleSave],
  );

  const newGame = useCallback(async (managedClubId: string) => {
    const seed = Math.floor(Math.random() * 1_000_000_000);
    careerRef.current = Career.create(defaultLeague(), { leagueId: "brasil-ficticio", managedClubId, seed });
    slotRef.current = `slot-${Date.now()}`;
    setStatus("active");
    bump();
    await storeRef.current.save(slotRef.current, careerRef.current.snapshot());
  }, []);

  const loadGame = useCallback(async (slotId: string) => {
    const snap = await storeRef.current.load(slotId);
    if (!snap) return;
    careerRef.current = Career.load(snap, defaultLeague());
    slotRef.current = slotId;
    setStatus("active");
    bump();
  }, []);

  const value: CareerContextValue = {
    status,
    version,
    career: careerRef.current,
    newGame,
    loadGame,
    saveNow,
    advance: () => mutate((c) => c.advance()),
    simulateSeason: () => mutate((c) => c.simulateSeason()),
    rolloverSeason: () => mutate((c) => c.rolloverSeason()),
    dispatch: (command) => mutate((c) => c.dispatch(command)),
    touch: () => mutate(() => {}),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCareer(): CareerContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCareer must be used within CareerProvider");
  return v;
}
