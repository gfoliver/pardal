import { useEffect, useRef } from "react";
import { FastForward, Pause, Play, Zap } from "lucide-react";
import type { Team } from "@fut/domain";
import { MatchEventType, type MatchResult } from "@fut/engine";
import { useApp } from "../../app/AppProviders";
import { useCareer } from "../../app/CareerProvider";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group";
import { useSpatialMatch, type Speed } from "../../hooks/useSpatialMatch";
import type { ScreenId } from "../../layout/Shell";

const KEY = new Set<MatchEventType>([MatchEventType.Goal, MatchEventType.Card, MatchEventType.Penalty, MatchEventType.HalfTime, MatchEventType.FullTime]);

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

function Live({ home, away, seed, onNavigate }: { home: Team; away: Team; seed: number; onNavigate: (s: ScreenId) => void }) {
  const { t } = useApp();
  const { commitUserMatch } = useCareer();
  const live = useSpatialMatch(home, away, seed);
  const committed = useRef(false);

  useEffect(() => {
    live.setSpeed(1); // autostart watching
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const snap = live.snapshot;
  const minute = snap?.minute ?? 0;
  const hs = snap?.homeScore ?? 0;
  const as = snap?.awayScore ?? 0;
  const feed = live.events.filter((e) => KEY.has(e.type)).slice(-8).reverse();

  const finishAndCommit = () => {
    if (!live.finished) live.finishNow();
  };
  useEffect(() => {
    if (live.finished && live.result && !committed.current) {
      committed.current = true;
      commitUserMatch(live.result as unknown as MatchResult);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.finished]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-6">
          <div className="text-xs uppercase tracking-wide text-fg-faint tabular-nums">{minute}'</div>
          <div className="flex items-center gap-6 text-2xl font-semibold">
            <span className="w-24 text-right">{home.shortName}</span>
            <span className="tabular-nums">{hs} – {as}</span>
            <span className="w-24">{away.shortName}</span>
          </div>
          {!live.finished ? (
            <div className="flex items-center gap-2">
              <Button size="icon-sm" variant="ghost" aria-label="pause/play" onClick={() => live.setSpeed(live.speed === 0 ? 1 : 0)}>
                {live.speed === 0 ? <Play /> : <Pause />}
              </Button>
              <ToggleGroup type="single" value={String(live.speed)} onValueChange={(v) => v && live.setSpeed(Number(v) as Speed)}>
                <ToggleGroupItem value="1">1×</ToggleGroupItem>
                <ToggleGroupItem value="2">2×</ToggleGroupItem>
                <ToggleGroupItem value="4">4×</ToggleGroupItem>
              </ToggleGroup>
              <Button size="sm" variant="secondary" onClick={finishAndCommit}>
                <FastForward /> {t.quickSim}
              </Button>
            </div>
          ) : (
            <Button variant="primary" onClick={() => onNavigate("home")}>
              {t.continue}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-1 py-3 text-sm">
          {feed.length === 0 ? (
            <p className="py-4 text-center text-fg-muted"><Zap className="mr-1 inline size-3.5" />…</p>
          ) : (
            feed.map((e, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="w-8 shrink-0 text-right text-xs text-fg-faint tabular-nums">{e.minute}'</span>
                <span className="text-xs uppercase text-fg-faint">{e.type}</span>
                <span className="text-fg">{e.playerName ?? ""}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
