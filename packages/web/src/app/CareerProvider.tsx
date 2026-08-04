import { createContext, useCallback, useContext, useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import type { MatchResult } from "@fut/engine";
import type { Formation, Mentality, Position, RoleKey } from "@fut/domain";
import { Career, type CareerCommand, type ContractOutcome, type OfferRefusal, type StoredInstructions, type TacticPresetKey } from "@fut/career";

type PendingMatch = NonNullable<ReturnType<Career["prepareNextUserFixture"]>>;
import { DEFAULT_DATASET_ID, getDataset } from "../lib/career/dataset";
import { IndexedDbCareerStore, readSession, writeSession } from "../lib/career/storage";

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
  /**
   * `seed` is passed in by the club picker rather than drawn here, so the budget and squad it
   * previewed are the ones the save opens with. Omitted, a fresh one is drawn.
   */
  newGame: (managedClubId: string, datasetId?: string, seed?: number, leagueId?: string) => Promise<void>;
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
  /** Bid for a player. Carries the REASON when it cannot be lodged. */
  makeOffer: (playerId: string, fee: number) => { ok: true } | { ok: false; reason: OfferRefusal };
  respondOffer: (negotiationId: string, accept: boolean) => void;
  counterOffer: (negotiationId: string, fee: number) => void;
  acceptCounter: (negotiationId: string) => void;
  withdrawOffer: (negotiationId: string) => void;
  askFor: (negotiationId: string, fee: number) => void;
  agreeTerms: (playerId: string, wage: number, years: number) => { signed: boolean };
  /** Put one of our players up for sale at a price (or re-price an existing listing). */
  listPlayer: (playerId: string, askingPrice: number) => void;
  unlistPlayer: (playerId: string) => void;
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

  /*
   * Boot: go back to WHERE THE PLAYER WAS, which is a stored fact and not a guess.
   *
   * This used to resume whichever save was most recently written, so refreshing at the menu threw
   * you into your last career — you could not sit on the menu at all. Having played a save and
   * currently being in it are different things, and only the app knows which; so it records the
   * difference (see `readSession`) and this reads it.
   */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const where = await readSession();
        if (where.at === "career") {
          const snap = await storeRef.current.load(where.slotId);
          const ds = snap ? getDataset(snap.datasetId) : undefined;
          // A save naming a dataset we no longer ship is not resumable. Dropping to the
          // start screen leaves it listed and deletable rather than loading it against the
          // wrong squads.
          if (alive && snap && ds) {
            careerRef.current = Career.load(snap, ds.league());
            slotRef.current = where.slotId;
            setStatus("active");
            bump();
            return;
          }
        }
      } catch {
        /* fall through to the menu */
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

  const newGame = useCallback(async (managedClubId: string, datasetId = DEFAULT_DATASET_ID, seed?: number, leagueId?: string) => {
    const ds = getDataset(datasetId);
    if (!ds) return;
    const careerSeed = seed ?? Math.floor(Math.random() * 1_000_000_000);
    careerRef.current = Career.create(ds.league(), { leagueId: leagueId ?? ds.id, managedClubId, seed: careerSeed, world: ds.world() });
    slotRef.current = `slot-${Date.now()}`;
    setStatus("active");
    bump();
    await storeRef.current.save(slotRef.current, careerRef.current.snapshot());
    await writeSession({ at: "career", slotId: slotRef.current });
  }, []);

  const loadGame = useCallback(async (slotId: string) => {
    const snap = await storeRef.current.load(slotId);
    if (!snap) return;
    const ds = getDataset(snap.datasetId);
    if (!ds) return; // dataset no longer shipped — Start marks the slot unplayable
    careerRef.current = Career.load(snap, ds.league());
    slotRef.current = slotId;
    setStatus("active");
    bump();
    await writeSession({ at: "career", slotId });
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
    // Being at the menu is the thing a refresh has to reproduce, so it is recorded like any
    // other move — otherwise the next boot has only "you played this save" to go on and resumes it.
    void writeSession({ at: "menu" });
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
      if (!c || matchLiveRef.current) return { ok: false, reason: "notForSale" };
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
    listPlayer: (playerId, askingPrice) => mutate((c) => c.listPlayer(playerId, askingPrice)),
    unlistPlayer: (playerId) => mutate((c) => c.unlistPlayer(playerId)),
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
