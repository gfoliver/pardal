import { useEffect, useMemo, useRef, useState } from "react";
import type { Team } from "@fut/domain";
import type { ClubKit } from "@fut/competition";
import type { MatchResult } from "@fut/engine";
import { useApp } from "../../app/AppProviders";
import { useCareer } from "../../app/CareerProvider";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Crest } from "../../components/ui/crest";
import { TeamShirt } from "../../components/ui/team-shirt";
import { LiveMatchView, type Shirt } from "../../components/match/LiveMatchView";
import { Pitch, type PitchSpot } from "../../components/pitch";
import { cap, groupOf, SlotMarker, usePosLabels } from "../../components/tactics/pieces";
import { MatchSummary } from "./MatchSummary";
import { MatchTactics } from "./MatchTactics";
import { useSpatialMatch } from "../../hooks/useSpatialMatch";
import { shirtMap } from "../../lib/lineup";
import { matchKits } from "../../lib/kits";
import { shortNamesFor } from "../../lib/names";
import type { ScreenId } from "../../layout/Shell";

export function CareerMatch({ onNavigate }: { onNavigate: (s: ScreenId, param?: string) => void }) {
  const { t } = useApp();
  const { pendingMatch, career, commitUserMatch, refreshPendingTeams, matchLive, beginMatch } = useCareer();
  // Preparation first: the manager confirms the lineup before kick-off. Seeded
  // from the lock so a remount while the match is live can never drop the
  // manager back onto the team sheet of a game already in play.
  const [kickedOff, setKickedOff] = useState(matchLive);
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
          beginMatch(); // locks the rest of the app until full time
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
      crests={{ home: career.clubCrest(match.home.id), away: career.clubCrest(match.away.id) }}
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
  const { shortPos } = usePosLabels();
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
      pos: shortPos(s.position),
      group: groupOf(s.position),
      name: s.player ? short.get(s.player.playerId) ?? s.player.name : "—",
      title: s.player ? `${s.player.name} · ${s.player.overall}` : undefined,
      marker: <SlotMarker kit={myKit} pos={shortPos(s.position)} overall={s.player?.overall} fitness={s.player?.fitness} />,
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
        {/* Two crests, two shirts, two names and a "vs" do not fit across a phone —
            the away crest was pushed off the right edge. The row is a three-column
            grid now so each side gets half of whatever there is, the names truncate
            instead of shoving, and the shirts (decoration beside the crest) drop out
            under `sm`. */}
        <CardContent className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 py-4 sm:gap-6">
          <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-3">
            <Crest src={career.clubCrest(homeId)} code={career.clubShort(homeId)} size={32} />
            <span className="truncate font-semibold">{career.clubNickname(homeId)}</span>
            <span className="hidden shrink-0 sm:block"><TeamShirt kit={kits.home} size={30} /></span>
          </div>
          <span className="shrink-0 text-sm text-fg-faint">vs</span>
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <span className="hidden shrink-0 sm:block"><TeamShirt kit={kits.away} size={30} /></span>
            <span className="truncate font-semibold">{career.clubNickname(awayId)}</span>
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
                  <span className="w-8 text-2xs uppercase text-fg-faint">{shortPos(p.position)}</span>
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

function Live({
  home,
  away,
  seed,
  round,
  kits,
  crests,
  managedId,
  commit,
  onNavigate,
}: {
  home: Team;
  away: Team;
  seed: number;
  round: number;
  kits: { home: ClubKit; away: ClubKit };
  /** Club artwork for the scoreboard and the line-up headers. */
  crests: { home?: string; away?: string };
  managedId: string;
  commit: (r: MatchResult) => void;
  onNavigate: (s: ScreenId, param?: string) => void;
}) {
  const { t, locale } = useApp();
  // The manager is watching, so his own bench is his to use — the engine only
  // manages the opposition here.
  const live = useSpatialMatch(home, away, seed, managedId);
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

  // An injury on our side stops the match and puts the manager in front of the
  // bench — the engine deliberately doesn't pick the replacement for him.
  const injuredId = myTeam ? live.pendingInjury(myTeam.id) : undefined;
  useEffect(() => {
    if (injuredId) setManaging(true);
  }, [injuredId]);

  // The tactics board takes over the screen (the match is paused behind it), so
  // it has the same room to work in as the squad-tactics screen.
  if (managing && myTeam && !live.finished) {
    return (
      <MatchTactics
        live={live}
        team={myTeam}
        kit={myTeam.id === home.id ? kits.home : kits.away}
        minute={live.snapshot?.minute ?? 0}
        score={{ home: live.snapshot?.homeScore ?? 0, away: live.snapshot?.awayScore ?? 0 }}
        injuredId={injuredId}
        // Can't walk away from an injury without resolving it — either bring
        // someone on, or say plainly that you'll play a man down.
        onClose={injuredId ? undefined : () => { setManaging(false); live.setSpeed(1); }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {myTeam && !live.finished && !live.skipping && (
        <div className="flex items-center justify-end gap-3">
          <Button variant="secondary" onClick={() => { live.setSpeed(0); setManaging(true); }}>{t.manage}</Button>
        </div>
      )}
      {live.finished && live.result ? (
        <MatchSummary report={live.result} round={round} kits={kits} onNavigate={onNavigate} />
      ) : live.skipping ? (
        // Skipping ahead: drop the pitch entirely. Re-rendering it every slice
        // competed with the simulation for the frame budget and crawled.
        <SkipProgress home={home} away={away} kits={kits} minute={live.snapshot?.minute ?? 0} homeScore={live.snapshot?.homeScore ?? 0} awayScore={live.snapshot?.awayScore ?? 0} />
      ) : (
        <LiveMatchView live={live} home={home} away={away} shirt={shirt} locale={locale} kits={kits} crests={crests} />
      )}
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
