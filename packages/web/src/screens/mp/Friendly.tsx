import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ClubKit, ClubKits, TeamData } from "@fut/competition";
import type { SavedTactic } from "@fut/career";
import { buildTeam, MatchProtocol, type MatchRecord } from "@fut/protocol";
import type { Team } from "@fut/domain";
import { useApp } from "../../app/AppProviders";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Crest } from "../../components/ui/crest";
import { Input, Label } from "../../components/ui/input";
import { LoadingScreen } from "../../components/ui/spinner";
import { LiveMatchView } from "../../components/match/LiveMatchView";
import { matchKits } from "../../lib/kits";
import { cn } from "../../lib/utils";
import { shirtMap } from "../../lib/lineup";
import type { UILocale } from "../../i18n/strings";
import { useSpatialMatch } from "../../hooks/useSpatialMatch";
import { DEFAULT_DATASET_ID, datasetInfos, loadDataset, type LeagueChoice } from "../../lib/career/dataset";
import { ApiError, MatchApi, localSessionStore, type RoomView } from "../../lib/mp/api";
import { defaultTacticFor, friendlyEditor, rosterClubOf, teamInputOf } from "../../lib/mp/friendly";
import { TacticsBoard } from "../career/Tactics";
import { ClubPicker } from "./ClubPicker";

/**
 * An online friendly, played in a ROOM.
 *
 * The room comes first and the teams are chosen inside it, in front of each other — which is the whole
 * difference from an invitation with a club baked into it. Both people see the same thing: who has
 * joined, what each has picked, who is ready. Then the host starts, and both watch.
 *
 * FOUR THINGS THE PROTOCOL DECIDES, not the layout:
 *
 *  - READY MEANS SEALED. The seed is derived from the two line-ups, so "ready" has to be the moment yours
 *    stops being editable. There is no separate flag on the server and there must not be one here.
 *  - A CLUB IS PART OF WHAT WAS SEALED, so it can be changed right up until ready and not after.
 *  - THE HOST'S START IS A SIGNAL, NOT A DECISION. Both line-ups being in already determined the match;
 *    start only says when to watch it, which is why the guest's client can act on it without asking.
 *  - THE MATCH IS RECOMPUTED FROM THE SEED, never streamed. That is what lets two browsers show the same
 *    game with a server that cannot simulate anything.
 *
 * WHAT IT STILL DOES NOT DO: the result is watched and not reported. Attestation is the next task, and
 * until it lands a friendly is a shared match rather than a recorded one.
 */

/**
 * Where the API lives.
 *
 * Empty in development on purpose: `vite.config.ts` forwards `/auth` and `/match` to a locally running
 * Worker, so a same-origin path is right and no variable has to be set. A production build sets
 * `VITE_API_URL`, because then the API is a different origin with no dev server in front of it.
 */
const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

const BENCH_SIZE = 5;
/** How often a room checks on the other side, while the tab is being looked at. */
const POLL_MS = 5_000;

export function Friendly({ code: invited, onExit }: { code?: string; onExit: () => void }) {
  const { t, locale } = useApp();
  const api = useMemo(() => new MatchApi({ baseUrl: BASE_URL, store: localSessionStore() }), []);

  const [clubs, setClubs] = useState<readonly TeamData[] | null>(null);
  const [leagues, setLeagues] = useState<readonly LeagueChoice[]>([]);
  const [kits, setKits] = useState<Record<string, ClubKits | undefined>>({});
  const [crests, setCrests] = useState<Record<string, string | undefined>>({});
  const [contentHash, setContentHash] = useState("");

  const [room, setRoom] = useState<RoomView | null>(null);
  const [tactic, setTactic] = useState<SavedTactic | null>(null);
  const [picking, setPicking] = useState(false);
  const [teams, setTeams] = useState<{ home: Team; away: Team; record: MatchRecord } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState(invited ?? "");
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  useEffect(() => {
    setContentHash(datasetInfos().find((d) => d.id === DEFAULT_DATASET_ID)?.contentHash ?? "");
    void loadDataset(DEFAULT_DATASET_ID).then((ds) => {
      setClubs(ds?.league().teams ?? []);
      setLeagues(ds?.leagues() ?? []);
      setKits(Object.fromEntries((ds?.world()?.clubs ?? []).map((c) => [c.id, c.kits])));
      setCrests(Object.fromEntries((ds?.world()?.clubs ?? []).map((c) => [c.id, c.crest])));
    });
  }, []);

  const say = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError) {
        if (e.failure.kind === "quota") return setError(t.friendlyQuota);
        if (e.failure.kind === "offline") return setError(t.friendlyOffline);
        if (e.failure.kind === "refused" && e.failure.code === "404") return setError(t.friendlyNoApi);
        return setError(e.failure.kind === "refused" ? (e.failure.detail ?? e.failure.code) : e.failure.kind);
      }
      setError(String(e));
    },
    [t],
  );

  const ensureSession = useCallback(async () => {
    if (!api.current) await api.signInAsGuest();
  }, [api]);

  const openRoom = useCallback(async () => {
    setError(null);
    try {
      await ensureSession();
      setRoom(await api.createRoom(contentHash));
    } catch (e) {
      say(e);
    }
  }, [api, contentHash, ensureSession, say]);

  const enterRoom = useCallback(
    async (code: string) => {
      setError(null);
      try {
        await ensureSession();
        setRoom(await api.join(code, contentHash));
      } catch (e) {
        say(e);
      }
    },
    [api, contentHash, ensureSession, say],
  );

  /*
   * An invite link joins on arrival, ONCE — guarded by a ref rather than by a dependency, because a
   * failed join (a full room, a stale code) must not retry on every render and burn the rate limit.
   */
  const tried = useRef(false);
  useEffect(() => {
    if (!invited || tried.current || contentHash === "") return;
    tried.current = true;
    void enterRoom(invited);
  }, [invited, contentHash, enterRoom]);

  /*
   * The room, kept fresh while anything is still to happen.
   *
   * Stops the moment the match starts: from then on both clients are simulating the same record and have
   * nothing left to ask. It also polls on `visibilitychange`, so a tab brought back to the front catches
   * up at once instead of after the interval.
   */
  const watching = teams !== null;
  const roomId = room?.matchId;
  useEffect(() => {
    if (!roomId || watching) return;
    let live = true;
    const poll = async () => {
      if (!live || document.visibilityState !== "visible") return;
      try {
        const next = await api.match(roomId);
        if (live) setRoom(next);
      } catch (e) {
        say(e);
      }
    };
    const timer = setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", poll);
    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [roomId, watching, api, say]);

  const myClubId = room ? (room.you === "home" ? room.homeClubId : room.awayClubId) : null;
  const myClub = useMemo(() => clubs?.find((c) => c.id === myClubId) ?? null, [clubs, myClubId]);
  const iAmReady = room ? (room.you === "home" ? room.homeReady : room.awayReady) : false;
  const bothReady = Boolean(room?.homeReady && room?.awayReady);

  const chooseClub = useCallback(
    async (club: TeamData) => {
      if (!room) return;
      setError(null);
      try {
        setRoom(await api.chooseClub(room.matchId, club.id));
        setTactic(defaultTacticFor(club));
        setPicking(false);
      } catch (e) {
        say(e);
      }
    },
    [api, room, say],
  );

  const markReady = useCallback(async () => {
    if (!room || !myClub || !tactic) return;
    setError(null);
    try {
      setRoom(await api.submitLineup(room.matchId, teamInputOf(myClub, tactic, BENCH_SIZE, myClub.coach.id)));
    } catch (e) {
      say(e);
    }
  }, [api, room, myClub, tactic, say]);

  const start = useCallback(async () => {
    if (!room) return;
    setError(null);
    try {
      setRoom(await api.start(room.matchId));
    } catch (e) {
      say(e);
    }
  }, [api, room, say]);

  /*
   * KICK-OFF IS DRIVEN BY THE ROOM, not by the button.
   *
   * The host's press sets `startedAt`; both clients — his own included — react to SEEING it. That is what
   * makes the guest's match begin on its own, which it never did while the only path to the pitch was a
   * button the guest was never shown.
   */
  useEffect(() => {
    if (!room?.startedAt || !room.record || teams || !clubs) return;
    const record = room.record;
    const home = clubs.find((c) => c.id === record.home.clubId);
    const away = clubs.find((c) => c.id === record.away.clubId);
    if (!home || !away) {
      setError(t.friendlyOffline);
      return;
    }
    try {
      setTeams({
        record,
        home: buildTeam(record.home, rosterClubOf(home)),
        away: buildTeam(record.away, rosterClubOf(away)),
      });
    } catch (e) {
      // `buildTeam` refusing means the record names players this client does not hold — a dataset mismatch
      // that got past the join check, which is worth saying rather than crashing.
      say(e);
    }
  }, [room, teams, clubs, say, t]);

  const share = useCallback(
    async (what: "code" | "link") => {
      if (!room?.joinCode) return;
      const text = what === "code" ? room.joinCode : `${location.origin}/friendly/${room.joinCode}`;
      try {
        await navigator.clipboard.writeText(text);
        setCopied(what);
        setTimeout(() => setCopied(null), 2000);
      } catch {
        // Clipboard refused (an insecure origin, a denied permission). The code is on screen and
        // selectable, so this is a convenience that failed rather than a task that did.
      }
    },
    [room],
  );

  if (!clubs) return <LoadingScreen label={t.loadingDataset} />;

  if (teams) {
    return (
      <WatchedMatch
        home={teams.home}
        away={teams.away}
        seed={teams.record.seed}
        locale={locale}
        kits={matchKits(kits[teams.home.id], kits[teams.away.id])}
      />
    );
  }

  // ----------------------------------------------------------------- lobby
  if (!room) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-3 p-4">
        <h1 className="text-lg font-semibold">{t.friendlyOnline}</h1>
        <p className="text-sm text-fg-faint">{t.friendlyOnlineHint}</p>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button variant="primary" size="lg" onClick={() => void openRoom()}>
          {t.friendlyCreateRoom}
        </Button>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label htmlFor="code">{t.friendlyRoomCode}</Label>
            <Input
              id="code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={8}
              autoCapitalize="characters"
              placeholder="ABC234"
            />
          </div>
          <Button variant="secondary" disabled={joinCode.trim().length < 4} onClick={() => void enterRoom(joinCode)}>
            {t.friendlyJoin}
          </Button>
        </div>
        <Button variant="ghost" onClick={onExit}>
          {t.back}
        </Button>
      </div>
    );
  }

  // ------------------------------------------------------------------ room
  const opponentClubId = room.you === "home" ? room.awayClubId : room.homeClubId;
  const opponentClub = clubs.find((c) => c.id === opponentClubId) ?? null;
  const opponentReady = room.you === "home" ? room.awayReady : room.homeReady;
  const opponentJoined = room.you === "home" ? room.awayJoined : room.homeJoined;
  const iAmHost = room.you === room.owner;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-3 p-3">
      {room.joinCode ? (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 py-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-fg-faint">{t.friendlyRoomCode}</div>
              {/* Selectable and large: when the clipboard is refused, the fallback is reading it out. */}
              <div className="select-all font-mono text-2xl font-bold tracking-[0.2em]">{room.joinCode}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => void share("code")}>
                {copied === "code" ? t.friendlyCopied : t.friendlyCopyCode}
              </Button>
              <Button variant="secondary" onClick={() => void share("link")}>
                {copied === "link" ? t.friendlyCopied : t.friendlyCopyLink}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <SidePanel
          title={t.friendlyYou}
          club={myClub}
          crest={crests[myClubId ?? ""]}
          ready={iAmReady}
          status={iAmReady ? t.friendlyReadyYes : t.friendlyReadyNo}
          action={
            !iAmReady ? (
              <Button variant={myClub ? "secondary" : "primary"} onClick={() => setPicking(true)}>
                {myClub ? t.friendlyChangeClub : t.friendlyChooseClub}
              </Button>
            ) : null
          }
        />
        <SidePanel
          title={t.friendlyOpponent}
          club={opponentClub}
          crest={crests[opponentClubId ?? ""]}
          ready={opponentReady}
          status={!opponentJoined ? t.friendlyWaitingJoin : opponentReady ? t.friendlyReadyYes : t.friendlyReadyNo}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {!iAmReady && myClub && tactic ? (
          <Button variant="primary" onClick={() => void markReady()}>
            {t.friendlyReadyMark}
          </Button>
        ) : null}
        {bothReady && iAmHost ? (
          <Button variant="primary" onClick={() => void start()}>
            {t.friendlyStartMatch}
          </Button>
        ) : null}
        {bothReady && !iAmHost ? <span className="text-sm text-fg-faint">{t.friendlyWaitingOwner}</span> : null}
        <Button variant="ghost" onClick={onExit}>
          {t.friendlyLeaveRoom}
        </Button>
      </div>

      {picking ? (
        <Card>
          <CardContent className="py-3">
            <ClubPicker leagues={leagues} clubs={clubs} crests={crests} onPick={(c) => void chooseClub(c)} />
          </CardContent>
        </Card>
      ) : myClub && tactic ? (
        // Sealed means sealed: the board stays readable and stops accepting changes.
        <div className={iAmReady ? "pointer-events-none opacity-60" : undefined}>
          <TacticsBoard editor={friendlyEditor(myClub, tactic, setTactic)} />
        </div>
      ) : null}
    </div>
  );
}

/** One side of the room: who they are, what they picked, whether they are ready. */
function SidePanel({
  title,
  club,
  crest,
  ready,
  status,
  action,
}: {
  title: string;
  club: TeamData | null;
  crest?: string;
  ready: boolean;
  status: string;
  action?: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-3">
        <Crest src={crest} code={club?.shortName} size={40} />
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wide text-fg-faint">{title}</div>
          <div className="truncate text-sm font-semibold">{club?.name ?? "—"}</div>
          <div className={cn("text-xs", ready ? "text-primary" : "text-fg-faint")}>{status}</div>
        </div>
        {action}
      </CardContent>
    </Card>
  );
}

/**
 * The match, on the same components the career watches with.
 *
 * A separate component because `useSpatialMatch` builds the match on mount: it must not be called until
 * both teams exist, and a hook cannot be conditional.
 */
function WatchedMatch({
  home,
  away,
  seed,
  locale,
  kits,
}: {
  home: Team;
  away: Team;
  seed: number;
  locale: UILocale;
  kits: { home: ClubKit; away: ClubKit };
}) {
  // No `manualSubsTeamId`: the protocol pins it to nobody, so watching a fixture and verifying it are the
  // same match. Passing a side here would make this client's result disagree with every other client's.
  const live = useSpatialMatch(home, away, seed, MatchProtocol.manualSubsTeamId);
  const shirt = useMemo(() => shirtMap(home, away), [home, away]);
  return <LiveMatchView live={live} home={home} away={away} shirt={shirt} locale={locale} kits={kits} />;
}
