import { createContext, useCallback, useContext, useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import type { MatchResult } from "@fut/engine";
import type { Formation, Mentality, RoleKey } from "@fut/domain";
import { Career, type CareerCommand, type StoredInstructions } from "@fut/career";

type PendingMatch = NonNullable<ReturnType<Career["prepareNextUserFixture"]>>;
import { getDataset } from "../lib/career/dataset";
import { IndexedDbCareerStore, getLastSlot } from "../lib/career/storage";

export type CareerStatus = "loading" | "no-save" | "active";

interface CareerContextValue {
  status: CareerStatus;
  /** Bumps on every mutation so consumers re-render (Career is a mutable class). */
  version: number;
  career: Career | null;
  newGame: (managedClubId: string, datasetId?: string) => Promise<void>;
  loadGame: (slotId: string) => Promise<void>;
  /** Return to the Start menu without deleting the save (it stays under Continue). */
  leaveToStart: () => void;
  /** Delete a save slot; if it's the active one, drop back to the menu. */
  deleteSlot: (slotId: string) => Promise<void>;
  saveNow: () => Promise<void>;
  advance: () => void;
  /** Auto-advance the calendar day-by-day (visible), halting on the user's match
   *  or season end. `advancing` is true while the loop runs. */
  continueTime: () => void;
  stopTime: () => void;
  advancing: boolean;
  simulateSeason: () => void;
  rolloverSeason: () => void;
  dispatch: (command: CareerCommand) => void;
  setFormation: (formation: Formation) => void;
  setMentality: (mentality: Mentality) => void;
  setInstruction: (patch: Partial<StoredInstructions>) => void;
  setLineupSlot: (slot: number, playerId: string) => void;
  setPlayerRole: (playerId: string, roleKey: RoleKey) => void;
  setSlotPosition: (slot: number, depth: number, width: number) => void;
  autoPickLineup: () => void;
  addTarget: (playerId: string) => void;
  removeTarget: (playerId: string) => void;
  makeOffer: (playerId: string, fee: number) => boolean;
  respondOffer: (offerId: string, accept: boolean) => void;
  agreeTerms: (playerId: string, wage: number, years: number) => { signed: boolean };
  renewContract: (playerId: string, wage: number, years: number) => void;
  scout: (playerId: string) => void;
  /** The user fixture staged for watching (set by playUserFixture). */
  pendingMatch: PendingMatch | null;
  /** Sim AI up to the user's next fixture and stage it for the match screen. */
  playUserFixture: () => PendingMatch | null;
  /** Rebuild the staged match's teams from current tactics (called at kick-off). */
  refreshPendingTeams: () => void;
  /** Fold a watched result back and clear the staged match. */
  commitUserMatch: (result: MatchResult) => void;
  /** Re-render + persist after a direct façade call. */
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
  const [pendingMatch, setPendingMatch] = useState<PendingMatch | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
          careerRef.current = Career.load(snap, getDataset(snap.datasetId).league());
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

  const stopTime = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setAdvancing(false);
  }, []);

  const continueTime = useCallback(() => {
    const c = careerRef.current;
    if (!c || timerRef.current) return;
    setAdvancing(true);
    const step = () => {
      const cur = careerRef.current;
      if (!cur) return stopTime();
      const { blocked } = cur.advanceDay();
      bump();
      scheduleSave();
      if (blocked) stopTime();
    };
    step(); // first day immediately
    if (careerRef.current && careerRef.current.peekNextStop() === "ai") {
      timerRef.current = setInterval(step, 450); // then tick visibly
    } else {
      setAdvancing(false);
    }
  }, [scheduleSave, stopTime]);

  useEffect(() => () => stopTime(), [stopTime]); // clean up on unmount

  const newGame = useCallback(async (managedClubId: string, datasetId = "brasil-ficticio") => {
    const ds = getDataset(datasetId);
    const seed = Math.floor(Math.random() * 1_000_000_000);
    careerRef.current = Career.create(ds.league(), { leagueId: ds.id, managedClubId, seed, world: ds.world() });
    slotRef.current = `slot-${Date.now()}`;
    setStatus("active");
    bump();
    await storeRef.current.save(slotRef.current, careerRef.current.snapshot());
  }, []);

  const loadGame = useCallback(async (slotId: string) => {
    const snap = await storeRef.current.load(slotId);
    if (!snap) return;
    careerRef.current = Career.load(snap, getDataset(snap.datasetId).league());
    slotRef.current = slotId;
    setStatus("active");
    bump();
  }, []);

  const leaveToStart = useCallback(() => {
    stopTime();
    if (saveTimer.current) clearTimeout(saveTimer.current);
    void saveNow(); // flush the current career before leaving (it stays under Continue)
    careerRef.current = null;
    slotRef.current = null;
    setPendingMatch(null);
    setStatus("no-save");
    bump();
  }, [saveNow, stopTime]);

  const deleteSlot = useCallback(
    async (slotId: string) => {
      await storeRef.current.delete(slotId);
      if (slotRef.current === slotId) leaveToStart();
    },
    [leaveToStart],
  );

  const value: CareerContextValue = {
    status,
    version,
    career: careerRef.current,
    newGame,
    loadGame,
    leaveToStart,
    deleteSlot,
    saveNow,
    advance: () => mutate((c) => c.advance()),
    continueTime,
    stopTime,
    advancing,
    simulateSeason: () => mutate((c) => c.simulateSeason()),
    rolloverSeason: () => mutate((c) => c.rolloverSeason()),
    dispatch: (command) => mutate((c) => c.dispatch(command)),
    setFormation: (formation) => mutate((c) => c.setFormation(formation)),
    setMentality: (mentality) => mutate((c) => c.setMentality(mentality)),
    setInstruction: (patch) => mutate((c) => c.setInstruction(patch)),
    setLineupSlot: (slot, playerId) => mutate((c) => c.setLineupSlot(slot, playerId)),
    setPlayerRole: (playerId, roleKey) => mutate((c) => c.setPlayerRole(playerId, roleKey)),
    setSlotPosition: (slot, depth, width) => mutate((c) => c.setSlotPosition(slot, depth, width)),
    autoPickLineup: () => mutate((c) => c.autoPickLineup()),
    addTarget: (playerId) => mutate((c) => c.addTarget(playerId)),
    removeTarget: (playerId) => mutate((c) => c.removeTarget(playerId)),
    makeOffer: (playerId, fee) => {
      const c = careerRef.current;
      if (!c) return false;
      const r = c.makeOffer(playerId, fee);
      bump();
      scheduleSave();
      return r;
    },
    respondOffer: (offerId, accept) => mutate((c) => c.respondOffer(offerId, accept)),
    agreeTerms: (playerId, wage, years) => {
      const c = careerRef.current;
      if (!c) return { signed: false };
      const r = c.agreeTerms(playerId, wage, years);
      bump();
      scheduleSave();
      return r;
    },
    renewContract: (playerId, wage, years) => mutate((c) => c.renewContract(playerId, wage, years)),
    scout: (playerId) => mutate((c) => c.scout(playerId)),
    pendingMatch,
    playUserFixture: () => {
      const c = careerRef.current;
      if (!c) return null;
      const prepared = c.prepareNextUserFixture();
      setPendingMatch(prepared);
      bump();
      scheduleSave();
      return prepared;
    },
    refreshPendingTeams: () => {
      const c = careerRef.current;
      if (!c || !pendingMatch) return;
      const { home, away } = c.buildTeams(pendingMatch.fixture);
      setPendingMatch({ ...pendingMatch, home, away });
    },
    commitUserMatch: (result) => {
      const c = careerRef.current;
      if (!c || !pendingMatch) return;
      c.commitUserFixture(pendingMatch.comp, pendingMatch.fixture, result);
      setPendingMatch(null);
      bump();
      scheduleSave();
    },
    touch: () => mutate(() => {}),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCareer(): CareerContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCareer must be used within CareerProvider");
  return v;
}
