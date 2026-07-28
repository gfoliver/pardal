import { createContext, useCallback, useContext, useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import type { MatchResult } from "@fut/engine";
import type { Formation, Mentality, Position, RoleKey } from "@fut/domain";
import { Career, type CareerCommand, type ContractOutcome, type StoredInstructions, type TacticPresetKey } from "@fut/career";

type PendingMatch = NonNullable<ReturnType<Career["prepareNextUserFixture"]>>;
import { getDataset } from "../lib/career/dataset";
import { IndexedDbCareerStore, getLastSlot } from "../lib/career/storage";

export type CareerStatus = "loading" | "no-save" | "active";

/** Enough to look the finished fixture back up through `career.matchSummary`. */
export interface QuickSimResult {
  readonly round: number;
  readonly homeId: string;
  readonly awayId: string;
}

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
  /** Quick-sim the next match day. Returns the managed club's fixture if it was
   *  one of the games played, so the caller can put the result on screen. */
  advance: () => QuickSimResult | null;
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
  setSlotFielded: (slot: number, position: Position) => void;
  setBenchSlot: (index: number, playerId: string) => void;
  autoPickLineup: () => void;
  createTactic: (name?: string) => void;
  duplicateTactic: (sourceId: string, name?: string) => void;
  renameTactic: (id: string, name: string) => void;
  deleteTactic: (id: string) => void;
  selectTactic: (id: string) => void;
  applyPreset: (key: TacticPresetKey) => void;
  addTarget: (playerId: string) => void;
  removeTarget: (playerId: string) => void;
  makeOffer: (playerId: string, fee: number) => boolean;
  respondOffer: (negotiationId: string, accept: boolean) => void;
  counterOffer: (negotiationId: string, fee: number) => void;
  acceptCounter: (negotiationId: string) => void;
  withdrawOffer: (negotiationId: string) => void;
  askFor: (negotiationId: string, fee: number) => void;
  agreeTerms: (playerId: string, wage: number, years: number) => { signed: boolean };
  /** Put terms to a player. He may accept, name his price, or refuse. */
  offerContract: (playerId: string, wage: number, years: number) => ContractOutcome;
  /** Give one of our players a squad number (swaps if a squad-mate wears it). */
  setShirtNumber: (playerId: string, number: number) => void;
  scout: (playerId: string) => void;
  cancelScout: (assignmentId: string) => void;
  /** The user fixture staged for watching (set by playUserFixture). */
  pendingMatch: PendingMatch | null;
  /** Sim AI up to the user's next fixture and stage it for the match screen. */
  playUserFixture: () => PendingMatch | null;
  /** Rebuild the staged match's teams from current tactics (called at kick-off). */
  refreshPendingTeams: () => void;
  /** Fold a watched result back and clear the staged match. */
  commitUserMatch: (result: MatchResult) => void;
  /**
   * A watched match has kicked off and hasn't reached full time.
   *
   * The running match lives in the match screen's own state (the spatial sim
   * isn't serialisable), so the save can't hold a half-played game. While this
   * is true the app therefore LOCKS: the calendar can't move, the career can't
   * be mutated, and navigation is pinned to the match screen — leaving and
   * coming back would silently restart the same fixture from minute 0, which is
   * a free re-roll of a result the manager didn't like.
   */
  matchLive: boolean;
  /** Called at kick-off, by the match screen. */
  beginMatch: () => void;
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
  const [matchLive, setMatchLive] = useState(false);
  // Mirrored in a ref so the guards below can read it without every callback
  // taking a dependency on it (they'd be rebuilt on kick-off and at full time).
  const matchLiveRef = useRef(false);
  const lock = useCallback((v: boolean) => {
    matchLiveRef.current = v;
    setMatchLive(v);
  }, []);

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

  // A reload mid-match throws the played minutes away — nothing on disk holds a
  // half-finished game — so make the browser ask first.
  useEffect(() => {
    if (!matchLive) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [matchLive]);

  const mutate = useCallback(
    (fn: (c: Career) => void) => {
      const c = careerRef.current;
      // Nothing touches the save while a match is being played — a transfer or a
      // tactic edit folded in mid-match would be applied to a world the running
      // simulation has already left behind.
      if (!c || matchLiveRef.current) return;
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
    if (!c || timerRef.current || matchLiveRef.current) return;
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
      // Slow enough to READ. At 450 ms a week went by before you could take in
      // what happened on any of those days, which makes the calendar feel like a
      // fast-forward button rather than time passing.
      timerRef.current = setInterval(step, 800);
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
    lock(false);
    setStatus("no-save");
    bump();
  }, [lock, saveNow, stopTime]);

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
    advance: () => {
      const c = careerRef.current;
      if (!c || matchLiveRef.current) return null;
      const played = c.advance();
      bump();
      scheduleSave();
      const mine = played.find((r) => r.homeTeamId === c.managedClubId || r.awayTeamId === c.managedClubId);
      return mine ? { round: mine.round, homeId: mine.homeTeamId, awayId: mine.awayTeamId } : null;
    },
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
    setSlotFielded: (slot, position) => mutate((c) => c.setSlotFielded(slot, position)),
    setBenchSlot: (index, playerId) => mutate((c) => c.setBenchSlot(index, playerId)),
    autoPickLineup: () => mutate((c) => c.autoPickLineup()),
    createTactic: (name) => mutate((c) => c.createTactic(name)),
    duplicateTactic: (sourceId, name) => mutate((c) => c.duplicateTactic(sourceId, name)),
    renameTactic: (id, name) => mutate((c) => c.renameTactic(id, name)),
    deleteTactic: (id) => mutate((c) => c.deleteTactic(id)),
    selectTactic: (id) => mutate((c) => c.selectTactic(id)),
    applyPreset: (key) => mutate((c) => c.applyPreset(key)),
    addTarget: (playerId) => mutate((c) => c.addTarget(playerId)),
    removeTarget: (playerId) => mutate((c) => c.removeTarget(playerId)),
    makeOffer: (playerId, fee) => {
      const c = careerRef.current;
      if (!c || matchLiveRef.current) return false;
      const r = c.makeOffer(playerId, fee);
      bump();
      scheduleSave();
      return r;
    },
    respondOffer: (negotiationId, accept) => mutate((c) => c.respondOffer(negotiationId, accept)),
    counterOffer: (negotiationId, fee) => mutate((c) => c.counterOffer(negotiationId, fee)),
    acceptCounter: (negotiationId) => mutate((c) => c.acceptCounter(negotiationId)),
    withdrawOffer: (negotiationId) => mutate((c) => c.withdrawOffer(negotiationId)),
    askFor: (negotiationId, fee) => mutate((c) => c.askFor(negotiationId, fee)),
    agreeTerms: (playerId, wage, years) => {
      const c = careerRef.current;
      if (!c || matchLiveRef.current) return { signed: false };
      const r = c.agreeTerms(playerId, wage, years);
      bump();
      scheduleSave();
      return r;
    },
    offerContract: (playerId, wage, years) => {
      const c = careerRef.current;
      if (!c || matchLiveRef.current) return { kind: "rejected", reason: "wantsToLeave" };
      const outcome = c.offerContract(playerId, wage, years);
      bump();
      scheduleSave();
      return outcome;
    },
    setShirtNumber: (playerId, number) => mutate((c) => c.setShirtNumber(playerId, number)),
    scout: (playerId) => mutate((c) => c.scout(playerId)),
    cancelScout: (assignmentId) => mutate((c) => c.cancelScout(assignmentId)),
    pendingMatch,
    playUserFixture: () => {
      const c = careerRef.current;
      // Re-staging a live fixture would re-run prepareNextUserFixture and hand
      // the match screen a brand-new kick-off — the restart this lock exists for.
      if (!c || matchLiveRef.current) return pendingMatch;
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
      lock(false); // full time: the result is in the save, so the app is free again
      c.commitUserFixture(pendingMatch.comp, pendingMatch.fixture, result);
      setPendingMatch(null);
      bump();
      scheduleSave();
    },
    matchLive,
    beginMatch: () => lock(true),
    touch: () => mutate(() => {}),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCareer(): CareerContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCareer must be used within CareerProvider");
  return v;
}
