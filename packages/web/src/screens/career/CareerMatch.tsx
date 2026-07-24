import { useEffect, useMemo, useRef } from "react";
import type { Team } from "@fut/domain";
import type { MatchResult } from "@fut/engine";
import { useApp } from "../../app/AppProviders";
import { useCareer } from "../../app/CareerProvider";
import { Button } from "../../components/ui/button";
import { LiveMatchView, type Shirt } from "../../components/match/LiveMatchView";
import { useSpatialMatch } from "../../hooks/useSpatialMatch";
import type { ScreenId } from "../../layout/Shell";

export function CareerMatch({ onNavigate }: { onNavigate: (s: ScreenId) => void }) {
  const { t } = useApp();
  const { pendingMatch } = useCareer();
  if (!pendingMatch) {
    return (
      <div className="grid place-items-center py-20">
        <Button variant="secondary" onClick={() => onNavigate("home")}>{t.dashboard}</Button>
      </div>
    );
  }
  return <Live home={pendingMatch.home} away={pendingMatch.away} seed={pendingMatch.seed} onNavigate={onNavigate} />;
}

/** Build shirt numbers deterministically from each team's XI+bench order. */
function shirtMap(home: Team, away: Team): Shirt {
  const map = new Map<string, number>();
  for (const team of [home, away]) {
    [...team.startingXi, ...team.bench].forEach((p, i) => map.set(p.id, i + 1));
  }
  return (id: string) => map.get(id) ?? "";
}

function Live({ home, away, seed, onNavigate }: { home: Team; away: Team; seed: number; onNavigate: (s: ScreenId) => void }) {
  const { t, locale } = useApp();
  const { commitUserMatch } = useCareer();
  const live = useSpatialMatch(home, away, seed);
  const shirt = useMemo(() => shirtMap(home, away), [home, away]);
  const committed = useRef(false);

  useEffect(() => {
    live.setSpeed(1); // autostart watching
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (live.finished && live.result && !committed.current) {
      committed.current = true;
      commitUserMatch(live.result as unknown as MatchResult);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.finished]);

  return (
    <div className="flex flex-col gap-4">
      <LiveMatchView live={live} home={home} away={away} shirt={shirt} locale={locale} />
      {live.finished && (
        <div className="flex justify-center">
          <Button variant="primary" onClick={() => onNavigate("home")}>{t.continue}</Button>
        </div>
      )}
    </div>
  );
}
