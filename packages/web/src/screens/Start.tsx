import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useApp } from "../app/AppProviders";
import { useCareer } from "../app/CareerProvider";
import { Button } from "../components/ui/button";
import { LogoMark } from "../components/ui/logo";
import { datasets } from "../lib/career/dataset";
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
  const allDatasets = datasets();
  const seed = useMemo(() => Math.floor(Math.random() * 1_000_000_000), []);

  useEffect(() => {
    void listSlots().then(setSlots);
  }, []);

  if (view === "new") {
    return (
      <NewCareer
        datasets={allDatasets}
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

        <Button variant="primary" size="lg" className="w-full" onClick={() => setView("new")}>
          <Plus />
          {t.newCareer}
        </Button>
      </div>
    </div>
  );
}
