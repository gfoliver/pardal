import { useMemo, useState } from "react";
import { ArrowLeft, Check, ChevronRight } from "lucide-react";
import { useApp } from "../../app/AppProviders";
import { Button } from "../../components/ui/button";
import { Crest } from "../../components/ui/crest";
import { useDatasetPreview } from "../../lib/career/preview";
import type { DatasetOption, LeagueChoice } from "../../lib/career/dataset";
import { useFormat } from "../../lib/format";
import { cn } from "../../lib/utils";
import { ClubPreviewPanel } from "./ClubPreviewPanel";

/**
 * Starting a career, as two steps: the league, then the club.
 *
 * Two SCREENS rather than two sections on one, because the questions are answered in sequence and
 * each wants the full width — a league grid and a twenty-club master–detail stacked on one page put
 * the club panel below the fold and made the league choice look like a filter on the list rather
 * than a decision of its own.
 *
 * League first because a dataset is on its way to being a WORLD: several leagues and cups with
 * relations between them. There is one league today, so step one is a grid of one; nothing about the
 * flow changes when the second arrives, because the club list is filtered by the league's entrants
 * either way.
 */

type Step = "league" | "club";

/** Where you are, and what you already chose. Clicking a done step goes back to it. */
function Stepper({ step, league, onBack }: { step: Step; league?: LeagueChoice; onBack: () => void }) {
  const { t } = useApp();
  const dot = (active: boolean, done: boolean, n: number) => (
    <span
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-full text-2xs font-bold",
        done ? "bg-primary text-primary-foreground" : active ? "bg-primary-soft text-primary ring-1 ring-primary" : "bg-surface-3 text-fg-faint",
      )}
    >
      {done ? <Check className="size-3.5" /> : n}
    </span>
  );
  const isClub = step === "club";
  return (
    <nav className="flex items-center gap-2 text-sm" aria-label={t.newCareer}>
      <button
        type="button"
        onClick={onBack}
        disabled={!isClub}
        className={cn("flex items-center gap-2 rounded-md px-1.5 py-1", isClub ? "hover:bg-surface-2" : "cursor-default")}
      >
        {dot(!isClub, isClub, 1)}
        <span className={cn("truncate", isClub ? "text-fg-muted" : "font-medium text-fg")}>
          {isClub && league ? league.name : t.chooseLeague}
        </span>
      </button>
      <span className="h-px w-4 shrink-0 bg-border sm:w-8" />
      <span className="flex items-center gap-2 px-1.5 py-1">
        {dot(isClub, false, 2)}
        <span className={cn("truncate", isClub ? "font-medium text-fg" : "text-fg-faint")}>{t.chooseClub}</span>
      </span>
    </nav>
  );
}

export function NewCareer({ datasets, seed, onStart, onBack }: {
  datasets: readonly DatasetOption[];
  /** Drawn once by the caller and shared with `newGame`, so the figures shown are the real ones. */
  seed: number;
  onStart: (clubId: string, datasetId: string, leagueId: string) => void;
  onBack: () => void;
}) {
  const { t } = useApp();
  const fmt = useFormat();
  const [datasetId, setDatasetId] = useState(datasets[0]!.id);
  const dataset = datasets.find((d) => d.id === datasetId) ?? datasets[0]!;
  const leagues = useMemo(() => dataset.leagues(), [dataset]);

  const [step, setStep] = useState<Step>("league");
  const [leagueId, setLeagueId] = useState<string | null>(null);
  const league = leagues.find((l) => l.id === leagueId);

  /*
   * Both panes of step two read the SAME previews, so the rating beside a club in the list and the
   * rating on its panel cannot disagree. They did: the list averaged the starting XI and the panel
   * averaged the whole squad, and Flamengo showed 80 in one and 76 in the other.
   */
  const all = useDatasetPreview(dataset, seed);
  const clubs = useMemo(
    () => (league ? all.filter((c) => league.clubIds.includes(c.clubId)) : all),
    [all, league],
  );
  const [clubId, setClubId] = useState<string | null>(null);
  const selected = clubs.find((c) => c.clubId === clubId) ?? clubs[0];
  /** Phone only: within step two, whether the panel has taken over from the list. */
  const [showDetail, setShowDetail] = useState(false);

  const toLeagueStep = () => {
    setStep("league");
    setShowDetail(false);
  };
  const pickLeague = (id: string) => {
    setLeagueId(id);
    // The club cannot survive a league change: he may not play in the new one.
    setClubId(null);
    setShowDetail(false);
    setStep("club");
  };

  /** Back walks the stepper before it leaves the flow, so nobody loses a step to one tap. */
  const goBack = () => {
    if (step === "club" && showDetail) setShowDetail(false);
    else if (step === "club") toLeagueStep();
    else onBack();
  };

  return (
    <div className="flex min-h-full flex-col gap-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button variant="ghost" size="sm" onClick={goBack} className="shrink-0">
          <ArrowLeft />
          {t.back}
        </Button>
        <Stepper step={step} league={league} onBack={toLeagueStep} />
      </header>

      {step === "league" ? (
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4">
          {/* World, when there is more than one. Part of step one: it decides which leagues exist. */}
          {datasets.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {datasets.map((d) => (
                <button
                  key={d.id}
                  onClick={() => {
                    setDatasetId(d.id);
                    setLeagueId(null);
                    setClubId(null);
                  }}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-sm transition-colors",
                    datasetId === d.id ? "border-primary bg-primary-soft text-fg" : "border-border text-fg-muted hover:bg-surface-2",
                  )}
                >
                  {d.name}
                </button>
              ))}
            </div>
          )}
          <h1 className="text-2xl font-semibold tracking-tight">{t.chooseLeague}</h1>
          <ul className="grid gap-3 sm:grid-cols-2">
            {leagues.map((l) => (
              <li key={l.id}>
                <button
                  onClick={() => pickLeague(l.id)}
                  className="flex w-full items-center gap-4 rounded-xl border border-border bg-surface-1 p-4 text-left transition-colors hover:border-primary hover:bg-surface-2"
                >
                  {l.logo && <img src={l.logo} alt="" className="h-12 w-12 shrink-0 object-contain" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold text-fg">{l.name}</span>
                    <span className="block truncate text-xs text-fg-muted">
                      {[l.country, fmt.plural(l.clubIds.length, { one: t.clubOne, other: t.clubOther })]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-fg-faint" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 gap-5 md:grid-cols-[minmax(14rem,18rem)_1fr]">
          <div className={cn("min-w-0 flex-col", showDetail ? "hidden md:flex" : "flex")}>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-fg-faint">{t.chooseClub}</h2>
            <ul className="flex flex-col gap-1 md:max-h-[38rem] md:overflow-y-auto md:pr-1">
              {clubs.map((c) => (
                <li key={c.clubId}>
                  <button
                    onClick={() => {
                      setClubId(c.clubId);
                      setShowDetail(true);
                    }}
                    aria-current={selected?.clubId === c.clubId}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md border px-2.5 py-2 text-left transition-colors",
                      selected?.clubId === c.clubId
                        ? "border-primary bg-primary-soft text-fg"
                        : "border-transparent text-fg-muted hover:border-border hover:bg-surface-2",
                    )}
                  >
                    <Crest src={c.crest} code={c.shortName} size={26} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{c.detail.nickname}</span>
                    <span className="shrink-0 text-xs font-semibold tabular-nums text-fg-muted">{c.xiRating}</span>
                    <ChevronRight className="size-4 shrink-0 text-fg-faint md:hidden" />
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className={cn("min-w-0 flex-col gap-5", showDetail ? "flex" : "hidden md:flex")}>
            {selected ? (
              <>
                <ClubPreviewPanel preview={selected} />
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full"
                  onClick={() => onStart(selected.clubId, datasetId, league?.id ?? datasetId)}
                >
                  {fmt.t(t.takeOver, { club: selected.detail.nickname })}
                </Button>
              </>
            ) : (
              <p className="text-sm text-fg-muted">{t.pickAClub}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
