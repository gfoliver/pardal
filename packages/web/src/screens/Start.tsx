import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Users } from "lucide-react";
import { useApp } from "../app/AppProviders";
import { useCareer } from "../app/CareerProvider";
import { Alert } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { LogoMark } from "../components/ui/logo";
import { LoadingScreen } from "../components/ui/spinner";
import { Suspense, lazy } from "react";
import { DEFAULT_DATASET_ID, datasetInfos, loadDataset, loadedDataset, type Dataset } from "../lib/career/dataset";

const Friendly = lazy(() => import("./mp/Friendly").then((m) => ({ default: m.Friendly })));
import { listSlots, type SaveSlot } from "../lib/career/storage";
import { NewCareer } from "./start/NewCareer";
import { SaveList } from "./start/SaveList";

/**
 * The front door.
 *
 * Two views rather than one long column: the menu, which exists to get you back into a save in one
 * click, and the club picker, which needs the whole screen to show what you would be taking on. The
 * previous single card stacked the save list, a dataset picker and a 20-club grid above a Start
 * button, so the common case — continue the career you were playing — was the smallest thing on it.
 *
 * The career SEED is drawn here, once, and handed to both the preview and `newGame`. That is what
 * makes the budget and squad on the preview panel the actual opening figures of the save rather
 * than a plausible-looking sample: the board's appetite is derived from the seed.
 */
export function Start() {
  const { t } = useApp();
  const { newGame, loadGame, deleteSlot } = useCareer();
  const [slots, setSlots] = useState<SaveSlot[]>([]);
  const [view, setView] = useState<"menu" | "new" | "friendly">("menu");
  const infos = datasetInfos();
  const seed = useMemo(() => Math.floor(Math.random() * 1_000_000_000), []);

  useEffect(() => {
    void listSlots().then(setSlots);
  }, []);

  /*
   * The squads arrive here, not with the bundle.
   *
   * Naming the datasets is free (the manifests are static), but their league and world data is
   * 855 kB, and this screen is the first place anything needs it: the club picker shows real
   * budgets and real starting elevens. So it is fetched when the manager asks to start a career,
   * and the menu itself paints without waiting for any of it.
   */
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [failed, setFailed] = useState(false);
  /**
   * The save being opened, and whether opening it went wrong.
   *
   * Continuing a career is the one click on this screen that does real work with no feedback: on a cold
   * start the dataset is not in memory yet, so it fetches 855 kB, reads the save out of IndexedDB and
   * rehydrates a season — and until now the row simply sat there. Twice, if you clicked it twice.
   */
  const [opening, setOpening] = useState<string | null>(null);
  const [openFailed, setOpenFailed] = useState(false);

  const [starting, setStarting] = useState(false);
  const [startFailed, setStartFailed] = useState(false);

  const startCareer = useCallback(
    async (clubId: string, datasetId: string, leagueId: string) => {
      setStarting(true);
      setStartFailed(false);
      const ok = await newGame(clubId, datasetId, seed, leagueId);
      if (!ok) {
        setStarting(false);
        setStartFailed(true);
      }
    },
    [newGame, seed],
  );

  const openSave = useCallback(
    async (slotId: string) => {
      setOpening(slotId);
      setOpenFailed(false);
      const ok = await loadGame(slotId);
      // On success this screen is unmounted by the status change, so only the failure path lands here.
      if (!ok) {
        setOpening(null);
        setOpenFailed(true);
      }
    },
    [loadGame],
  );
  /** Which dataset the UI is actually asking for, so a slow earlier fetch cannot land on top. */
  const wanted = useRef(DEFAULT_DATASET_ID);

  const open = useCallback((id: string) => {
    wanted.current = id;
    setFailed(false);
    setView("new");
    // Already in memory (a second visit, or a dataset switched back to): no flash of loading.
    const cached = loadedDataset(id);
    if (cached) {
      setDataset(cached);
      return;
    }
    setDataset(null);
    loadDataset(id).then(
      (ds) => {
        if (wanted.current !== id) return;
        if (ds) setDataset(ds);
        else setFailed(true);
      },
      () => wanted.current === id && setFailed(true),
    );
  }, []);

  /*
   * Lazy, like every other screen that can reach the simulator: a friendly ends in a watched match, and
   * the start screen must not carry the engine for a visitor who only wants to resume a save.
   */
  if (view === "friendly") {
    return (
      <Suspense fallback={<LoadingScreen label={t.loadingDataset} />}>
        <Friendly onExit={() => setView("menu")} />
      </Suspense>
    );
  }

  if (view === "new") {
    if (failed) {
      return (
        <div className="grid min-h-full place-items-center p-6">
          <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-5 text-center">
            <p className="text-sm font-medium text-fg">{t.datasetLoadFailed}</p>
            <div className="mt-4 flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setView("menu")}>{t.back}</Button>
              <Button variant="primary" className="flex-1" onClick={() => open(wanted.current)}>{t.tryAgain}</Button>
            </div>
          </div>
        </div>
      );
    }
    // A line of text alone read as a page that had finished loading and had nothing on it. A spinner
    // says the wait is ours rather than the manager's.
    if (!dataset) return <LoadingScreen label={t.loadingDataset} />;
    return (
      <NewCareer
        infos={infos}
        dataset={dataset}
        onPickDataset={open}
        seed={seed}
        starting={starting}
        failed={startFailed}
        onBack={() => setView("menu")}
        onStart={(clubId, datasetId, leagueId) => void startCareer(clubId, datasetId, leagueId)}
      />
    );
  }

  return (
    <div className="grid min-h-full place-items-center p-6">
      <div className="w-full max-w-md animate-fade-in">
        {/* The one screen with room to give the mark its own line. */}
        <div className="mb-8 flex flex-col items-center">
          <LogoMark size={96} className="mb-3" />
          <span className="serif text-4xl font-semibold tracking-tight">
            Pard<b className="italic text-primary">al</b>
          </span>
          <p className="mt-1 text-sm text-fg-muted">{t.career}</p>
        </div>

        <section className="mb-4">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-fg-faint">{t.continueCareer}</h2>
          {slots.length > 0 ? (
            <>
              <SaveList
                slots={slots}
                opening={opening}
                onLoad={(id) => void openSave(id)}
                onDelete={(id) => void deleteSlot(id).then(() => listSlots().then(setSlots))}
              />
              {/* Said in place, under the list, rather than by replacing the screen: the menu is still
                  useful — the other saves still open, and a new career still starts. */}
              {openFailed && <Alert tone="danger" className="mt-2 text-xs">{t.careerLoadFailed}</Alert>}
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-4 text-center">
              <p className="text-sm font-medium text-fg-muted">{t.noSaves}</p>
              <p className="mt-0.5 text-xs text-fg-faint">{t.noSavesHint}</p>
            </div>
          )}
        </section>

        <Button variant="primary" size="lg" className="w-full" onClick={() => open(DEFAULT_DATASET_ID)}>
          <Plus />
          {t.newCareer}
        </Button>

        {/*
          * Multiplayer lives beside a career rather than inside one: a friendly has no save, no calendar
          * and no finances, and the single-player game keeps working when the API is down — which on the
          * free plan is a thing that happens ON PURPOSE once the day's allowance is spent.
          */}
        <Button variant="secondary" size="lg" className="w-full" onClick={() => setView("friendly")}>
          <Users />
          {t.friendlyOnline}
        </Button>
      </div>
    </div>
  );
}
