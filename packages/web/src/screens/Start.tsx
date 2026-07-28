import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { useApp } from "../app/AppProviders";
import { useCareer } from "../app/CareerProvider";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { datasets } from "../lib/career/dataset";
import { listSlots, type SaveSlot } from "../lib/career/storage";
import { Crest } from "../components/ui/crest";
import { LogoMark } from "../components/ui/logo";
import { cn } from "../lib/utils";

export function Start() {
  const { t } = useApp();
  const { newGame, loadGame, deleteSlot } = useCareer();
  const [slots, setSlots] = useState<SaveSlot[]>([]);
  const allDatasets = datasets();
  const [datasetId, setDatasetId] = useState<string>(allDatasets[0]!.id);
  const dataset = allDatasets.find((d) => d.id === datasetId) ?? allDatasets[0]!;
  const clubs = dataset.clubChoices();
  const [choice, setChoice] = useState<string>(clubs[0]!.id);

  useEffect(() => {
    void listSlots().then(setSlots);
  }, []);

  const pickDataset = (id: string) => {
    setDatasetId(id);
    const ds = allDatasets.find((d) => d.id === id) ?? allDatasets[0]!;
    setChoice(ds.clubChoices()[0]!.id);
  };

  return (
    <div className="grid min-h-full place-items-center p-8">
      <div className="w-full max-w-2xl animate-fade-in">
        {/* The one screen with room to give the mark its own line. */}
        <div className="mb-8 flex flex-col items-center">
          <LogoMark size={96} className="mb-3" />
          <span className="serif text-4xl font-semibold tracking-tight">
            Pard<b className="italic text-primary">al</b>
          </span>
          <p className="mt-1 text-sm text-fg-muted">{t.career}</p>
        </div>

        {slots.length > 0 && (
          <Card className="mb-6">
            <CardContent className="flex flex-col gap-2 py-4">
              <h2 className="text-xs font-bold uppercase tracking-wide text-fg-faint">{t.continueCareer}</h2>
              {slots.map((s) => (
                <div key={s.slotId} className="flex items-center gap-1 rounded-md border border-border pr-1 hover:bg-surface-2">
                  <button onClick={() => void loadGame(s.slotId)} className="flex flex-1 items-center justify-between px-3 py-2 text-left text-sm">
                    <span className="font-medium text-fg">{s.name}</span>
                    <span className="text-xs text-fg-faint tabular-nums">{s.seasonLabel}</span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="delete"
                    onClick={() => void deleteSlot(s.slotId).then(() => listSlots().then(setSlots))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="py-5">
            {allDatasets.length > 1 && (
              <>
                <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-fg-faint">{t.dataset}</h2>
                <div className="mb-5 grid grid-cols-2 gap-2">
                  {allDatasets.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => pickDataset(d.id)}
                      className={cn(
                        "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                        datasetId === d.id ? "border-primary bg-primary-soft text-fg" : "border-border text-fg-muted hover:bg-surface-2",
                      )}
                    >
                      <span className="font-medium">{d.name}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-fg-faint">{t.chooseClub}</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {clubs.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setChoice(c.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                    choice === c.id ? "border-primary bg-primary-soft text-fg" : "border-border text-fg-muted hover:bg-surface-2",
                  )}
                >
                  <Crest src={c.crest} code={c.short} size={20} />
                  <span className="flex-1 font-medium">{c.short}</span>
                  <span className="text-2xs text-fg-faint tabular-nums">{c.rating}</span>
                </button>
              ))}
            </div>
            <Button variant="primary" className="mt-5 w-full" onClick={() => void newGame(choice, datasetId)}>
              {t.start}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
