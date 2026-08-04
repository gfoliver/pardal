import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useApp } from "../app/AppProviders";
import { useCareer } from "../app/CareerProvider";
import { Button } from "../components/ui/button";
import { LogoMark } from "../components/ui/logo";
import { DEFAULT_DATASET_ID, datasetInfos, loadDataset, loadedDataset, type Dataset } from "../lib/career/dataset";
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
  const [view, setView] = useState<"menu" | "new">("menu");
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
    if (!dataset) {
      return (
        <div className="grid min-h-full place-items-center p-6">
          <p className="animate-fade-in text-sm text-fg-muted">{t.loadingDataset}</p>
        </div>
      );
    }
    return (
      <NewCareer
        infos={infos}
        dataset={dataset}
        onPickDataset={open}
        seed={seed}
        onBack={() => setView("menu")}
        onStart={(clubId, datasetId, leagueId) => void newGame(clubId, datasetId, seed, leagueId)}
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
            <SaveList
              slots={slots}
              onLoad={(id) => void loadGame(id)}
              onDelete={(id) => void deleteSlot(id).then(() => listSlots().then(setSlots))}
            />
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
      </div>
    </div>
  );
}
