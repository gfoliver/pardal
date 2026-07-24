import { useApp } from "../../app/AppProviders";
import { useCareer } from "../../app/CareerProvider";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { cn } from "../../lib/utils";

export function Calendar() {
  const { t } = useApp();
  const { career, advance } = useCareer();
  if (!career) return null;
  const snap = career.snapshot();
  const managed = snap.managedClubId;
  const comp = snap.competitions[0];
  if (!comp) return null;

  const resultByKey = new Map<string, { hs: number; as: number }>();
  for (const r of comp.results) resultByKey.set(`${r.round}:${r.homeTeamId}:${r.awayTeamId}`, { hs: r.homeScore, as: r.awayScore });

  const fixtures = [...comp.fixtures].sort((a, b) => a.day - b.day || a.fixtureIndex - b.fixtureIndex);
  const next = career.nextUserFixture();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t.calendar}</h1>
          <p className="text-sm text-fg-muted">{comp.id}</p>
        </div>
        <Button variant="primary" onClick={advance} disabled={!next}>{t.advance}</Button>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-0.5 py-3">
          {fixtures.map((f) => {
            const res = resultByKey.get(`${f.round}:${f.homeTeamId}:${f.awayTeamId}`);
            const mine = f.homeTeamId === managed || f.awayTeamId === managed;
            const isNext = next?.fixture === f;
            return (
              <div
                key={`${f.competitionId}-${f.fixtureIndex}`}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-1.5 text-sm",
                  mine && "bg-surface-2",
                  isNext && "ring-1 ring-primary",
                )}
              >
                <span className="w-8 shrink-0 text-2xs uppercase text-fg-faint tabular-nums">R{f.round}</span>
                <span className="flex-1 text-right tabular-nums">{snap.clubs[f.homeTeamId]?.shortName}</span>
                <span className="w-12 shrink-0 text-center font-semibold tabular-nums">
                  {res ? `${res.hs}–${res.as}` : "–"}
                </span>
                <span className="flex-1 tabular-nums">{snap.clubs[f.awayTeamId]?.shortName}</span>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
