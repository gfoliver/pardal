import { useEffect, useMemo, useRef, useState } from "react";
import { Mentality, type Team } from "@fut/domain";
import type { MatchResult } from "@fut/engine";
import { useApp } from "../../app/AppProviders";
import { useCareer } from "../../app/CareerProvider";
import { Button } from "../../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { LiveMatchView, type Shirt } from "../../components/match/LiveMatchView";
import { useSpatialMatch, type SpatialController } from "../../hooks/useSpatialMatch";
import { cn } from "../../lib/utils";
import { shortPlayerName } from "../../lib/names";
import type { ScreenId } from "../../layout/Shell";

const POS_SHORT: Record<string, string> = {
  goalkeeper: "GK", centreBack: "CB", fullBack: "FB", wingBack: "WB", defensiveMidfielder: "DM",
  centralMidfielder: "CM", attackingMidfielder: "AM", winger: "WG", striker: "ST",
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function CareerMatch({ onNavigate }: { onNavigate: (s: ScreenId) => void }) {
  const { t } = useApp();
  const { pendingMatch, career, commitUserMatch } = useCareer();
  if (!pendingMatch || !career) {
    return (
      <div className="grid place-items-center py-20">
        <Button variant="secondary" onClick={() => onNavigate("home")}>{t.dashboard}</Button>
      </div>
    );
  }
  return <Live home={pendingMatch.home} away={pendingMatch.away} seed={pendingMatch.seed} managedId={career.managedClubId} commit={commitUserMatch} onNavigate={onNavigate} />;
}

function shirtMap(home: Team, away: Team): Shirt {
  const map = new Map<string, number>();
  for (const team of [home, away]) [...team.startingXi, ...team.bench].forEach((p, i) => map.set(p.id, i + 1));
  return (id: string) => map.get(id) ?? "";
}

function Live({ home, away, seed, managedId, commit, onNavigate }: { home: Team; away: Team; seed: number; managedId: string; commit: (r: MatchResult) => void; onNavigate: (s: ScreenId) => void }) {
  const { t, locale } = useApp();
  const live = useSpatialMatch(home, away, seed);
  const shirt = useMemo(() => shirtMap(home, away), [home, away]);
  const committed = useRef(false);
  const [managing, setManaging] = useState(false);
  const myTeam = home.id === managedId ? home : away.id === managedId ? away : undefined;

  useEffect(() => {
    live.setSpeed(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (live.finished && live.result && !committed.current) {
      committed.current = true;
      commit(live.result as unknown as MatchResult);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.finished]);

  return (
    <div className="flex flex-col gap-4">
      {myTeam && !live.finished && (
        <div className="flex justify-end">
          <Button variant="secondary" onClick={() => { live.setSpeed(0); setManaging((m) => !m); }}>{t.manage}</Button>
        </div>
      )}
      {managing && myTeam && !live.finished && <ManagePanel live={live} team={myTeam} onClose={() => setManaging(false)} />}
      <LiveMatchView live={live} home={home} away={away} shirt={shirt} locale={locale} />
      {live.finished && (
        <div className="flex justify-center">
          <Button variant="primary" onClick={() => onNavigate("home")}>{t.continue}</Button>
        </div>
      )}
    </div>
  );
}

function ManagePanel({ live, team, onClose }: { live: SpatialController; team: Team; onClose: () => void }) {
  const { t } = useApp();
  const [outId, setOutId] = useState<string | null>(null);
  const [inId, setInId] = useState<string | null>(null);
  const [mentality, setMentality] = useState<Mentality>(team.tactics.instructions.mentality);
  const onPitch = live.onPitch(team.id);
  const bench = live.bench(team.id);
  const remaining = live.subsRemaining(team.id);

  const doSub = () => {
    if (outId && inId && live.substitute(team.id, outId, inId)) {
      setOutId(null);
      setInId(null);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-elevated p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t.manage} — {team.name}</h3>
        <span className="text-xs text-fg-muted">{t.substitution}: {remaining}</span>
      </div>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs text-fg-muted">{t.mentality}</span>
        <Select value={mentality} onValueChange={(x) => { setMentality(x as Mentality); live.setInstruction(team.id, { mentality: x as Mentality }); }}>
          <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.values(Mentality).map((m) => <SelectItem key={m} value={m}>{cap(m)}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="mb-1 text-2xs uppercase text-fg-faint">{t.playerOut}</div>
          <div className="flex max-h-52 flex-col gap-0.5 overflow-y-auto">
            {onPitch.map((p) => (
              <button
                key={p.id}
                onClick={() => setOutId(p.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const inbound = e.dataTransfer.getData("text/plain");
                  if (inbound && live.substitute(team.id, p.id, inbound)) { setOutId(null); setInId(null); }
                }}
                className={cn("flex items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-surface-2", outId === p.id && "bg-primary-soft ring-1 ring-primary")}
              >
                <span className="w-7 text-fg-faint">{POS_SHORT[p.position] ?? p.position}</span>
                <span className="truncate text-fg">{shortPlayerName(p.name)}</span>
                <span className="ml-auto tabular-nums text-fg-faint">{Math.round(p.stamina * 100)}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1 text-2xs uppercase text-fg-faint">{t.playerIn}</div>
          <div className="flex max-h-52 flex-col gap-0.5 overflow-y-auto">
            {bench.length === 0 && <p className="px-2 py-1 text-xs text-fg-faint">{t.noSubsLeft}</p>}
            {bench.map((p) => (
              <button
                key={p.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/plain", p.id)}
                onClick={() => setInId(p.id)}
                className={cn("flex items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-surface-2 active:cursor-grabbing", inId === p.id && "bg-primary-soft ring-1 ring-primary")}
              >
                <span className="w-7 text-fg-faint">{POS_SHORT[p.position] ?? p.position}</span>
                <span className="truncate text-fg">{shortPlayerName(p.name)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onClose}>{t.cancel}</Button>
        <Button size="sm" variant="primary" disabled={!outId || !inId || remaining <= 0} onClick={doSub}>{t.makeSub}</Button>
      </div>
    </div>
  );
}
