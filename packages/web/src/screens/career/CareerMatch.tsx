import { useEffect, useMemo, useRef, useState } from "react";
import { Mentality, type Position, PositionGroup, positionGroup, type Team } from "@fut/domain";
import type { ClubKit } from "@fut/competition";
import type { MatchResult } from "@fut/engine";
import { useApp } from "../../app/AppProviders";
import { useCareer } from "../../app/CareerProvider";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Crest } from "../../components/ui/crest";
import { TeamShirt } from "../../components/ui/team-shirt";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { LiveMatchView, type Shirt } from "../../components/match/LiveMatchView";
import { Pitch, type PitchSpot } from "../../components/pitch";
import { MatchSummary } from "./MatchSummary";
import { useSpatialMatch, type SpatialController } from "../../hooks/useSpatialMatch";
import { cn } from "../../lib/utils";
import { matchKits } from "../../lib/kits";
import { shortPlayerName, shortNamesFor } from "../../lib/names";
import type { PosGroup } from "../../lib/engine/world";
import type { ScreenId } from "../../layout/Shell";

const POS_SHORT: Record<string, string> = {
  goalkeeper: "GK", centreBack: "CB", fullBack: "FB", wingBack: "WB", defensiveMidfielder: "DM",
  centralMidfielder: "CM", attackingMidfielder: "AM", winger: "WG", striker: "ST",
};
const GROUP: Record<PositionGroup, PosGroup> = {
  [PositionGroup.Goalkeeper]: "GK", [PositionGroup.Defence]: "DEF", [PositionGroup.Midfield]: "MID", [PositionGroup.Attack]: "ATT",
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function CareerMatch({ onNavigate }: { onNavigate: (s: ScreenId, param?: string) => void }) {
  const { t } = useApp();
  const { pendingMatch, career, commitUserMatch, refreshPendingTeams } = useCareer();
  // Preparation first: the manager confirms the lineup before kick-off.
  const [kickedOff, setKickedOff] = useState(false);
  // Committing the result clears the staged match, so hold on to it — otherwise
  // the full-time screen would vanish the moment the result is recorded.
  const [playing, setPlaying] = useState<typeof pendingMatch>(null);
  const match = playing ?? pendingMatch;

  if (!match || !career) {
    return (
      <div className="grid place-items-center py-20">
        <Button variant="secondary" onClick={() => onNavigate("home")}>{t.dashboard}</Button>
      </div>
    );
  }

  const snap = career.snapshot();
  const kits = matchKits(snap.clubs[match.home.id]?.kits, snap.clubs[match.away.id]?.kits);

  if (!kickedOff) {
    return (
      <MatchPrep
        homeId={match.home.id}
        awayId={match.away.id}
        kits={kits}
        onNavigate={onNavigate}
        onKickOff={() => {
          refreshPendingTeams(); // honour tactics changed since the fixture was staged
          setKickedOff(true);
        }}
      />
    );
  }

  return (
    <Live
      key={match.seed}
      home={match.home}
      away={match.away}
      seed={match.seed}
      round={match.fixture.round}
      kits={kits}
      managedId={career.managedClubId}
      commit={(r) => {
        setPlaying(match); // keep the finished match on screen after it's recorded
        commitUserMatch(r);
      }}
      onNavigate={onNavigate}
    />
  );
}

/** Pre-match screen: who you're facing, your shape, XI and bench — then kick off. */
function MatchPrep({
  homeId,
  awayId,
  kits,
  onKickOff,
  onNavigate,
}: {
  homeId: string;
  awayId: string;
  kits: { home: ClubKit; away: ClubKit };
  onKickOff: () => void;
  onNavigate: (s: ScreenId, param?: string) => void;
}) {
  const { t } = useApp();
  const { career } = useCareer();
  if (!career) return null;
  const managed = career.managedClubId;
  const v = career.tacticsView(managed);
  const isHome = managed === homeId;
  const myKit = isHome ? kits.home : kits.away;
  const oppId = isHome ? awayId : homeId;
  const short = v ? shortNamesFor([...v.slots.map((s) => s.player).filter((p): p is NonNullable<typeof p> => Boolean(p)), ...v.bench]) : new Map<string, string>();

  const spots: PitchSpot[] =
    v?.slots.map((s) => ({
      id: s.slot,
      x: s.width * 100,
      y: 100 - s.depth * 100,
      pos: POS_SHORT[s.position] ?? s.position,
      group: GROUP[positionGroup(s.position as Position)],
      name: s.player ? short.get(s.player.playerId) ?? s.player.name : "—",
      title: s.player ? `${s.player.name} · ${s.player.overall}` : undefined,
      marker: <TeamShirt kit={myKit} size={38} label={POS_SHORT[s.position] ?? s.position} />,
    })) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t.matchPrep}</h1>
          <p className="text-sm text-fg-muted">{t.matchPrepHint}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => onNavigate("tactics")}>{t.editTactics}</Button>
          <Button variant="primary" onClick={onKickOff}>{t.kickOff}</Button>
        </div>
      </div>

      {/* Fixture strip: home vs away with the kits they'll actually wear */}
      <Card>
        <CardContent className="flex items-center justify-center gap-6 py-4">
          <div className="flex items-center gap-3">
            <Crest src={career.clubCrest(homeId)} code={career.clubShort(homeId)} size={32} />
            <span className="font-semibold">{career.clubNickname(homeId)}</span>
            <TeamShirt kit={kits.home} size={30} />
          </div>
          <span className="text-sm text-fg-faint">vs</span>
          <div className="flex items-center gap-3">
            <TeamShirt kit={kits.away} size={30} />
            <span className="font-semibold">{career.clubNickname(awayId)}</span>
            <Crest src={career.clubCrest(awayId)} code={career.clubShort(awayId)} size={32} />
          </div>
        </CardContent>
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <Card>
          <CardHeader><CardTitle>{t.lineups}</CardTitle></CardHeader>
          <CardContent className="p-3 sm:p-4"><div className="mx-auto max-w-md"><Pitch spots={spots} /></div></CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader><CardTitle>{t.matchSetup}</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between"><span className="text-fg-muted">{t.formation}</span><span className="font-medium">{v?.formation ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-fg-muted">{t.mentality}</span><span className="font-medium">{v ? cap(v.mentality) : "—"}</span></div>
              <div className="flex justify-between"><span className="text-fg-muted">{t.opponent}</span><span className="font-medium">{career.clubNickname(oppId)}</span></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{t.bench} · {v?.bench.length ?? 0}</CardTitle></CardHeader>
            <CardContent className="flex max-h-64 flex-col gap-1 overflow-y-auto text-sm">
              {v?.bench.slice(0, 12).map((p) => (
                <div key={p.playerId} className="flex items-center gap-2">
                  <span className="w-8 text-2xs uppercase text-fg-faint">{POS_SHORT[p.position] ?? p.position}</span>
                  <span className={p.injured ? "text-fg-faint line-through" : "text-fg"}>{short.get(p.playerId) ?? p.name}</span>
                  <span className="ml-auto tabular-nums text-fg-muted">{p.overall}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function shirtMap(home: Team, away: Team): Shirt {
  const map = new Map<string, number>();
  for (const team of [home, away]) [...team.startingXi, ...team.bench].forEach((p, i) => map.set(p.id, i + 1));
  return (id: string) => map.get(id) ?? "";
}

function Live({
  home,
  away,
  seed,
  round,
  kits,
  managedId,
  commit,
  onNavigate,
}: {
  home: Team;
  away: Team;
  seed: number;
  round: number;
  kits: { home: ClubKit; away: ClubKit };
  managedId: string;
  commit: (r: MatchResult) => void;
  onNavigate: (s: ScreenId, param?: string) => void;
}) {
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
      {myTeam && !live.finished && !live.skipping && (
        <div className="flex items-center justify-end gap-3">
          <Button variant="secondary" onClick={() => { live.setSpeed(0); setManaging((m) => !m); }}>{t.manage}</Button>
        </div>
      )}
      {managing && myTeam && !live.finished && <ManagePanel live={live} team={myTeam} onClose={() => setManaging(false)} />}
      {live.finished && live.result ? (
        <MatchSummary report={live.result} round={round} kits={kits} onNavigate={onNavigate} />
      ) : live.skipping ? (
        // Skipping ahead: drop the pitch entirely. Re-rendering it every slice
        // competed with the simulation for the frame budget and crawled.
        <SkipProgress home={home} away={away} kits={kits} minute={live.snapshot?.minute ?? 0} homeScore={live.snapshot?.homeScore ?? 0} awayScore={live.snapshot?.awayScore ?? 0} />
      ) : (
        <LiveMatchView live={live} home={home} away={away} shirt={shirt} locale={locale} kits={kits} />
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

/** Minimal skip view: score + a clock progress bar, no pitch to re-render. */
function SkipProgress({
  home,
  away,
  kits,
  minute,
  homeScore,
  awayScore,
}: {
  home: Team;
  away: Team;
  kits: { home: ClubKit; away: ClubKit };
  minute: number;
  homeScore: number;
  awayScore: number;
}) {
  const { t } = useApp();
  const pct = Math.max(0, Math.min(100, (minute / 90) * 100));
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-5 py-12">
        <div className="flex flex-wrap items-center justify-center gap-5">
          <div className="flex items-center gap-3">
            <TeamShirt kit={kits.home} size={32} />
            <span className="serif text-lg font-semibold">{home.shortName}</span>
          </div>
          <span className="serif text-3xl font-bold tabular-nums">{homeScore} : {awayScore}</span>
          <div className="flex items-center gap-3">
            <span className="serif text-lg font-semibold">{away.shortName}</span>
            <TeamShirt kit={kits.away} size={32} />
          </div>
        </div>
        <div className="flex w-full max-w-md flex-col gap-2">
          <div className="flex justify-between text-xs text-fg-muted">
            <span>{t.simulatingToEnd}</span>
            <span className="tabular-nums">{minute}'</span>
          </div>
          <span className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
            <span className="block h-full rounded-full bg-gradient-to-r from-[var(--brand-emerald)] to-[var(--brand-lime)] transition-[width] duration-200" style={{ width: `${pct}%` }} />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
