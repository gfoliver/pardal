import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClubKit, ClubKits, TeamData } from "@fut/competition";
import type { SavedTactic } from "@fut/career";
import { buildTeam, MatchProtocol, type MatchRecord } from "@fut/protocol";
import type { Team } from "@fut/domain";
import { useApp } from "../../app/AppProviders";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Input, Label } from "../../components/ui/input";
import { LoadingScreen } from "../../components/ui/spinner";
import { LiveMatchView } from "../../components/match/LiveMatchView";
import { matchKits } from "../../lib/kits";
import { shirtMap } from "../../lib/lineup";
import type { UILocale } from "../../i18n/strings";
import { useSpatialMatch } from "../../hooks/useSpatialMatch";
import { DEFAULT_DATASET_ID, datasetInfos, loadDataset } from "../../lib/career/dataset";
import { ApiError, MatchApi, localSessionStore, type MatchView } from "../../lib/mp/api";
import { defaultTacticFor, rosterClubOf, teamInputOf, viewOf } from "../../lib/mp/friendly";
import type { TacticsEditor } from "../../lib/tactics/editor";
import { TacticsBoard } from "../career/Tactics";
import { withFormation, withInstructions, withMentality, withPlayerInSlot, withRole, withSlotFielded, withSlotPosition } from "@fut/career";

/**
 * An online friendly, end to end: choose a club, seal a line-up, watch the match.
 *
 * The shape of the screen follows the protocol rather than the other way round, and two of its states
 * exist BECAUSE of the protocol rather than for the look of it:
 *
 *  - waiting for an opponent, because a seed cannot be drawn until both line-ups are sealed;
 *  - sealed-and-waiting, because a line-up is one-shot and there is genuinely nothing left to do.
 *
 * The board here is the career's board — `TacticsBoard` over a `TacticsEditor` backed by a tactic in
 * memory. Nothing about a career is loaded, and no rule is reimplemented: every edit is the same function
 * the career's reducer calls.
 *
 * WHAT THIS DOES NOT DO YET, so nobody has to discover it: the result is simulated and shown, and the
 * report is not yet sent — attestation is the next task, and until it lands a friendly is a shared match
 * rather than a recorded one.
 */

/**
 * Where the API lives.
 *
 * Empty in development ON PURPOSE: `vite.config.ts` forwards `/auth` and `/match` to a locally running
 * Worker, so a same-origin path is right there and no variable has to be set. A production build sets
 * `VITE_API_URL`, because then the API is a different origin with no dev server in front of it.
 *
 * The failure this used to produce is worth remembering: with neither the variable nor the proxy, the
 * client posted to the dev server, which knows nothing of `/auth/guest` and answered 404 — indistinguishable
 * on screen from the server rejecting a sign-in.
 */
const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

const BENCH_SIZE = 5;

type Phase =
  | { kind: "lobby" }
  | { kind: "picking"; mode: "host" | "join"; code: string }
  | { kind: "lineup"; view: MatchView; club: TeamData }
  | { kind: "watching"; record: MatchRecord; home: Team; away: Team };

export function Friendly({ onExit }: { onExit: () => void }) {
  const { t, locale } = useApp();
  const api = useMemo(() => new MatchApi({ baseUrl: BASE_URL, store: localSessionStore() }), []);
  const [phase, setPhase] = useState<Phase>({ kind: "lobby" });
  const [clubs, setClubs] = useState<readonly TeamData[] | null>(null);
  const [kits, setKits] = useState<Record<string, ClubKits | undefined>>({});
  const [contentHash, setContentHash] = useState<string>("");
  const [tactic, setTactic] = useState<SavedTactic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");

  // The dataset, which is both the club list and the roster the fixture is played from.
  useEffect(() => {
    setContentHash(datasetInfos().find((d) => d.id === DEFAULT_DATASET_ID)?.contentHash ?? "");
    void loadDataset(DEFAULT_DATASET_ID).then((ds) => {
      setClubs(ds?.league().teams ?? []);
      setKits(Object.fromEntries((ds?.world()?.clubs ?? []).map((c) => [c.id, c.kits])));
    });
  }, []);

  const say = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError) {
        if (e.failure.kind === "quota") return setError(t.friendlyQuota);
        if (e.failure.kind === "offline") return setError(t.friendlyOffline);
        /*
         * A 404 from an endpoint that certainly exists means the request never reached the API — the dev
         * proxy has nothing behind it, or a build shipped without `VITE_API_URL`. Named separately because
         * "not found" against a route the server does define sends whoever reads it hunting in the wrong
         * place entirely.
         */
        if (e.failure.kind === "refused" && e.failure.code === "404") return setError(t.friendlyNoApi);
        return setError(e.failure.kind === "refused" ? (e.failure.detail ?? e.failure.code) : e.failure.kind);
      }
      setError(String(e));
    },
    [t],
  );

  /** A guest account is enough for a friendly; a season league will want a real one. */
  const ensureSession = useCallback(async () => {
    if (!api.current) await api.signInAsGuest();
  }, [api]);

  const start = useCallback(
    async (club: TeamData, mode: "host" | "join", joinCode: string) => {
      setError(null);
      try {
        await ensureSession();
        const view = mode === "host"
          ? await api.challenge(club.id, contentHash)
          : await api.join(joinCode, club.id, contentHash);
        setTactic(defaultTacticFor(club));
        setPhase({ kind: "lineup", view, club });
      } catch (e) {
        say(e);
      }
    },
    [api, contentHash, ensureSession, say],
  );

  /*
   * Waiting for the opponent, without polling him into the ground.
   *
   * Two endpoints at ten-second intervals is 72,000 requests a day against a 100,000 free allowance, so
   * this asks when the tab is looked at and otherwise every half minute — and the client sends an ETag,
   * so an unchanged fixture costs a 304 with no body.
   */
  const pending = phase.kind === "lineup" && phase.view.state === "awaiting_lineups";
  const viewRef = useRef<MatchView | null>(null);
  viewRef.current = phase.kind === "lineup" ? phase.view : null;
  useEffect(() => {
    if (!pending) return;
    const id = viewRef.current?.matchId;
    if (!id) return;
    let live = true;
    const poll = async () => {
      if (!live || document.visibilityState !== "visible") return;
      try {
        const next = await api.match(id);
        if (!live) return;
        setPhase((p) => (p.kind === "lineup" ? { ...p, view: next } : p));
      } catch (e) {
        say(e);
      }
    };
    const timer = setInterval(poll, 30_000);
    document.addEventListener("visibilitychange", poll);
    void poll();
    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [pending, api, say]);

  const seal = useCallback(async () => {
    if (phase.kind !== "lineup" || !tactic) return;
    setError(null);
    try {
      const input = teamInputOf(phase.club, tactic, BENCH_SIZE, phase.club.coach.id);
      const next = await api.submitLineup(phase.view.matchId, input);
      setPhase({ ...phase, view: next });
    } catch (e) {
      say(e);
    }
  }, [api, phase, tactic, say]);

  /** Both line-ups in: build the two teams from the record and hand them to the engine. */
  const kickOff = useCallback(() => {
    if (phase.kind !== "lineup" || !phase.view.record || !clubs) return;
    const record = phase.view.record;
    const find = (id: string) => clubs.find((c) => c.id === id);
    const homeClub = find(record.home.clubId);
    const awayClub = find(record.away.clubId);
    if (!homeClub || !awayClub) return setError(t.friendlyOffline);
    try {
      setPhase({
        kind: "watching",
        record,
        home: buildTeam(record.home, rosterClubOf(homeClub)),
        away: buildTeam(record.away, rosterClubOf(awayClub)),
      });
    } catch (e) {
      // `buildTeam` refusing is the honest failure for a record naming players this client does not hold —
      // a dataset mismatch that got past the join check, which is worth saying rather than crashing.
      say(e);
    }
  }, [phase, clubs, say, t]);

  if (!clubs) return <LoadingScreen label={t.loadingDataset} />;

  if (phase.kind === "watching") {
    return (
      <WatchedMatch
        home={phase.home}
        away={phase.away}
        seed={phase.record.seed}
        locale={locale}
        kits={matchKits(kits[phase.home.id], kits[phase.away.id])}
      />
    );
  }

  if (phase.kind === "lineup" && tactic) {
    const sealed = phase.view.homeSubmitted && phase.view.awaySubmitted;
    /*
     * WHICH SIDE AM I. Read from the clubs rather than from "somebody has submitted": treating the
     * opponent's submission as mine disabled the seal button for a player who had not picked a team yet,
     * and left him staring at a board he could edit and not send.
     */
    const iAmHome = phase.club.id === phase.view.homeClubId;
    const mine = iAmHome ? phase.view.homeSubmitted : phase.view.awaySubmitted;
    const editor: TacticsEditor = {
      view: viewOf(phase.club, tactic, () => undefined),
      // No fit percentage: a friendly has no scouting knowledge to base one on, and the board draws
      // nothing rather than a zero — a missing measurement is not a bad fit.
      fitAt: () => undefined,
      setFormation: (f) => setTactic((x) => (x ? withFormation(x, f) : x)),
      setMentality: (m) => setTactic((x) => (x ? withMentality(x, m) : x)),
      setInstruction: (patch) => setTactic((x) => (x ? withInstructions(x, patch) : x)),
      setLineupSlot: (slot, id) => setTactic((x) => (x ? withPlayerInSlot(x, slot, id) : x)),
      setPlayerRole: (id, role) => setTactic((x) => (x ? withRole(x, id, role) : x)),
      setSlotFielded: (slot, pos) => setTactic((x) => (x ? withSlotFielded(x, slot, pos) : x)),
      setSlotPosition: (slot, depth, width) => setTactic((x) => (x ? withSlotPosition(x, slot, depth, width) : x)),
      applyPreset: () => undefined,
      autoPickLineup: () => setTactic(defaultTacticFor(phase.club)),
    };
    return (
      <div className="flex flex-col gap-3 p-3">
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 py-3">
            <div className="flex-1">
              <div className="text-sm font-semibold">{phase.club.name}</div>
              <div className="text-xs text-fg-faint">
                {phase.view.joinCode ? `${t.friendlyCode}: ${phase.view.joinCode} — ${t.friendlyCodeHint}` : null}
                {sealed
                  ? t.friendlySealed
                  : mine
                    ? t.friendlyWaitingLineup
                    : phase.view.awayClubId
                      ? null
                      : t.friendlyWaitingOpponent}
              </div>
            </div>
            {phase.view.record ? (
              <Button variant="primary" onClick={kickOff}>{t.friendlyKickOff}</Button>
            ) : (
              <Button variant="primary" disabled={mine} onClick={() => void seal()}>{t.friendlySealLineup}</Button>
            )}
          </CardContent>
        </Card>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {/* Sealed means sealed: the board stays visible to look at, and stops accepting changes. */}
        <div className={mine ? "pointer-events-none opacity-60" : undefined}>
          <TacticsBoard editor={editor} />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-3 p-4">
      <h1 className="text-lg font-semibold">{t.friendlyOnline}</h1>
      <p className="text-sm text-fg-faint">{t.friendlyOnlineHint}</p>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {phase.kind === "picking" ? (
        <>
          {phase.mode === "join" ? (
            <div>
              <Label htmlFor="code">{t.friendlyCode}</Label>
              <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={8} autoCapitalize="characters" />
            </div>
          ) : null}
          <Label>{t.friendlyPickClub}</Label>
          <div className="max-h-80 overflow-y-auto rounded-md border border-line">
            {clubs.map((c) => (
              <button
                key={c.id}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-2"
                onClick={() => void start(c, phase.mode, code)}
              >
                {c.name}
              </button>
            ))}
          </div>
          <Button variant="ghost" onClick={() => setPhase({ kind: "lobby" })}>{t.back}</Button>
        </>
      ) : (
        <>
          <Button variant="primary" onClick={() => setPhase({ kind: "picking", mode: "host", code: "" })}>
            {t.friendlyHost}
          </Button>
          <Button variant="secondary" onClick={() => setPhase({ kind: "picking", mode: "join", code: "" })}>
            {t.friendlyJoin}
          </Button>
          <Button variant="ghost" onClick={onExit}>{t.back}</Button>
        </>
      )}
    </div>
  );
}

/**
 * The match itself, on the same components the career watches with.
 *
 * A separate component because `useSpatialMatch` builds the match on mount: it must not be called until
 * both teams exist, and a hook cannot be conditional. Recomputed from the seed, never streamed — which is
 * why both players see the same game without the server simulating anything.
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
