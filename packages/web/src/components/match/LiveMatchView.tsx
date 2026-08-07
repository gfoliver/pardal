import { memo, useEffect, useRef, useState } from "react";
import { ArrowLeftRight, CornerDownRight, FastForward, Flag, Goal, Pause, Play, Target, Timer, TriangleAlert, Users, X } from "lucide-react";
import { Position, type Team } from "@fut/domain";
import type { ClubKit } from "@fut/competition";
import { CardColor, MatchEventType, penaltyKickOf, possessionPercent, type MatchEvent, type PenaltyKick, type TeamStats } from "@fut/engine";
import { getCatalog } from "@fut/i18n";
import {
  FIELD,
  pitchGeometry,
  type PitchArc,
  type PitchRect,
  type SpatialPlayerView,
  type SpatialSnapshot,
} from "@fut/spatial";
import { useApp } from "../../app/AppProviders";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Crest } from "../ui/crest";
import { Overall } from "../ui/game";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { InjuryMark } from "./InjuryMark";
import { PenaltyDialog } from "./PenaltyKickView";
import type { SpatialController, Speed } from "../../hooks/useSpatialMatch";
import type { UIStrings } from "../../i18n/strings";
import { cn } from "../../lib/utils";
import { inkOn } from "../../lib/kits";

export type Shirt = (id: string) => number | string;

const POS_SHORT: Record<Position, string> = {
  [Position.Goalkeeper]: "GK", [Position.CentreBack]: "CB", [Position.FullBack]: "FB", [Position.WingBack]: "WB",
  [Position.DefensiveMidfielder]: "DM", [Position.CentralMidfielder]: "CM", [Position.AttackingMidfielder]: "AM",
  [Position.Winger]: "WG", [Position.Striker]: "ST",
};

/**
 * Which side of a comparison a thing belongs to, as a colour.
 *
 * Deliberately NOT the kit. A kit says who a team is and is used wherever a team is being identified —
 * the scoreboard mark, the lineup shirts, the chips on the pitch. These two say which END of a two-sided
 * bar or which margin of the feed a row belongs to, and they have to stay legible against every kit in
 * the dataset, including two navy sides playing each other. Mixing the two roles is how a stat bar ends
 * up in a colour the eye cannot match to anything.
 */
const HOME_CHANNEL = "var(--pos-mid)";
const AWAY_CHANNEL = "var(--pos-att)";

/**
 * Regulation length, for the clock's progress line only.
 *
 * A presentation constant, not a rule: the engine owns the real clock and stoppage runs past this, which
 * is why the bar is clamped rather than allowed to overflow. It is NOT read from `MatchProtocol` on
 * purpose — that pins the inputs of a MULTIPLAYER match, and a career match must not start depending on
 * the protocol for how to draw a progress bar.
 */
const REGULATION_MINUTES = 90;

/** How many narrated lines the feed keeps on screen at once. See `useNarratedFeed` for the cost. */
const FEED_LIMIT = 60;

/**
 * The timeline's views, in the data grid's filter vocabulary: a chip each, a count on each, one active
 * at a time, and an X on anything that is not the default.
 *
 * The sets are drawn from what the SPATIAL engine actually emits, which is a smaller list than
 * `MatchEventType`: it never emits Kickoff, Pass, Tackle, FreeKick, ShootoutKick or ExtraTimeStart, and
 * the ThrowIn and GoalKick it does emit have no narration in the catalogue. Widening a filter to admit
 * those would produce a chip that always counts zero.
 *
 * `key` is the default so the screen is no noisier than it was, with one addition: an Injury now earns a
 * line. It halts the match on the managed side and was the one consequential event with no trace at all
 * in the scrollback.
 */
type FeedFilter = "key" | "goals" | "chances" | "cards" | "all";

const FEED_FILTERS: readonly FeedFilter[] = ["key", "goals", "chances", "cards", "all"];

const FILTER_TYPES: Record<Exclude<FeedFilter, "all">, ReadonlySet<MatchEventType>> = {
  key: new Set([
    MatchEventType.Goal,
    MatchEventType.Card,
    MatchEventType.Penalty,
    MatchEventType.Substitution,
    MatchEventType.Injury,
    MatchEventType.HalfTime,
    MatchEventType.FullTime,
  ]),
  goals: new Set([MatchEventType.Goal]),
  chances: new Set([MatchEventType.Goal, MatchEventType.Shot, MatchEventType.Penalty, MatchEventType.Corner, MatchEventType.Offside]),
  cards: new Set([MatchEventType.Card, MatchEventType.Foul]),
};

/** A shot is ordinarily too small to report — a penalty missed never is. */
const isPenaltyShot = (e: MatchEvent): boolean => e.type === MatchEventType.Shot && Boolean(e.params?.penalty);

const inFilter = (f: FeedFilter, e: MatchEvent): boolean =>
  f === "all" || FILTER_TYPES[f].has(e.type) || (f === "key" && isPenaltyShot(e));

const filterLabel = (f: FeedFilter, t: UIStrings): string =>
  f === "key" ? t.liveFeedKey : f === "goals" ? t.liveFeedGoals : f === "chances" ? t.liveFeedChances : f === "cards" ? t.liveFeedCards : t.liveFeedAll;

interface FeedRow {
  /** Index in the match's own event list — a stable React key for as long as the feed only appends. */
  index: number;
  text: string;
  event: MatchEvent;
  kick: PenaltyKick | null;
}

/**
 * The match, narrated once.
 *
 * The feed is rebuilt on every state push from the simulation — about twelve a second — and the previous
 * version re-narrated the WHOLE match each time, then threw away all but the last sixteen lines. That is
 * hundreds of wasted string builds a second competing with the sim for the frame budget, and it got worse
 * the longer the match ran.
 *
 * So narration is incremental: only events past the high-water mark are rendered, and the result is kept
 * in a ref. This is a pure DERIVED CACHE and nothing else — it is a function of `events` alone, so a
 * remount simply rebuilds it. That is exactly what makes it safe next to `usePenaltyReplay` and
 * `useEventBanner`, whose watermarks mean "already seen by this manager" and must NOT be rebuilt on a
 * remount. Do not be tempted to fold the three together: two of them are memory, this one is arithmetic.
 */
function useNarratedFeed(events: readonly MatchEvent[], locale: "en" | "pt-BR", home: Team, away: Team): readonly FeedRow[] {
  const cache = useRef<{ key: string; read: number; rows: FeedRow[] }>({ key: "", read: 0, rows: [] });
  // Narration bakes in the locale and both team names, so any of them changing invalidates every line.
  const key = `${locale}|${home.id}|${home.name}|${away.id}|${away.name}`;
  const c = cache.current;
  if (c.key !== key || events.length < c.read) {
    // A shorter feed means a different match, exactly as in `usePenaltyReplay`.
    c.key = key;
    c.read = 0;
    c.rows = [];
  }
  if (events.length > c.read) {
    const cat = getCatalog(locale);
    const ctx = { teamName: (id: string | undefined) => (id === home.id ? home.name : id === away.id ? away.name : "") };
    for (let i = c.read; i < events.length; i++) {
      const e = events[i]!;
      const text = cat.renderEvent(e, ctx);
      // The catalogue returns null for what it will not narrate (throw-ins, goal kicks). Those never
      // reach a row, so a filter's count is a count of lines the manager could actually read.
      if (text) c.rows.push({ index: i, text, event: e, kick: penaltyKickOf(e) });
    }
    c.read = events.length;
  }
  return c.rows;
}

/** The full FM-style live match view: a broadcast scoreboard over a rendered pitch, with
 *  stats, a filterable commentary feed and both line-ups. Team/shirt-agnostic (career or
 *  exhibition) via props. */
export function LiveMatchView({ live, home, away, shirt, locale, kits, crests }: {
  live: SpatialController;
  home: Team;
  away: Team;
  shirt: Shirt;
  locale: "en" | "pt-BR";
  kits: { home: ClubKit; away: ClubKit };
  /** Club artwork, where the caller has it. Absent, a side is marked by its kit colour and short code. */
  crests?: { home?: string; away?: string };
}) {
  const snap = live.snapshot;
  const cat = getCatalog(locale);
  const { t } = useApp();
  const banner = useEventBanner(live.events, t);
  const penalty = usePenaltyReplay(live);
  const [filter, setFilter] = useState<FeedFilter>("key");
  const rows = useNarratedFeed(live.events, locale, home, away);
  if (!snap) return null;

  const ballOwner = snap.players.find((p) => p.hasBall)?.id;

  const counts: Record<FeedFilter, number> = { key: 0, goals: 0, chances: 0, cards: 0, all: rows.length };
  for (const r of rows) {
    if (inFilter("key", r.event)) counts.key++;
    if (inFilter("goals", r.event)) counts.goals++;
    if (inFilter("chances", r.event)) counts.chances++;
    if (inFilter("cards", r.event)) counts.cards++;
  }

  // Newest first, and we stop at the cap rather than filtering the whole match and slicing the tail —
  // under "All" late in a game that is the difference between scanning a dozen events and scanning four
  // hundred, twelve times a second.
  const feed: FeedRow[] = [];
  for (let i = rows.length - 1; i >= 0 && feed.length < FEED_LIMIT; i--) {
    const r = rows[i]!;
    if (inFilter(filter, r.event)) feed.push(r);
  }

  return (
    <div className="flex flex-col gap-4">
      <Scoreboard live={live} snap={snap} home={home} away={away} kits={kits} crests={crests} t={t} />

      {/* The pitch stands upright and the two lineups moved BELOW the timeline.
          Flanking the pitch with them only worked on a wide screen: on a phone the
          three stacked into home lineup, pitch, away lineup, so the match itself sat
          in the middle of a long scroll with the timeline somewhere past the bottom.
          Now the order is the order of what you care about — the pitch, what just
          happened, then who is on the field. */}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,26rem)]">
        <Card>
          <CardContent className="relative p-2 sm:p-3">
            <SpatialPitch snap={snap} homeId={home.id} shirt={shirt} kits={kits} />
            {banner && <EventBanner banner={banner} />}
          </CardContent>
        </Card>
        <div className="flex flex-col gap-4">
          <LiveStats stats={live.stats} cat={cat} />
          <Card>
            <CardHeader><CardTitle>{cat.phrase("timeline")}</CardTitle></CardHeader>
            {/* The grid's chip vocabulary, ported: a rounded-md bordered pill, tinted when it is what
                you are looking at, carrying its own count, and clearable back to the default. */}
            <div className="flex flex-wrap gap-1.5 border-b border-hairline px-2.5 py-2">
              {FEED_FILTERS.map((f) => (
                <FeedChip
                  key={f}
                  label={filterLabel(f, t)}
                  count={counts[f]}
                  active={filter === f}
                  onSelect={() => setFilter(f)}
                  // Only a non-default view can be cleared — an X on "Key" would undo nothing.
                  onClear={filter === f && f !== "key" ? () => setFilter("key") : undefined}
                  clearLabel={t.clearFilters}
                />
              ))}
            </div>
            <CardContent className="flex max-h-[360px] flex-col gap-0 overflow-y-auto p-0">
              {feed.length === 0 && (
                <div className="m-2.5 rounded-lg border border-dashed border-border py-10 text-center text-sm text-fg-muted">
                  {t.liveNoEvents}
                </div>
              )}
              {feed.map((r, i) => {
                const Row = r.kick ? "button" : "div";
                const channel = r.event.teamId === home.id ? HOME_CHANNEL : r.event.teamId === away.id ? AWAY_CHANNEL : "var(--text-faint)";
                return (
                  <Row
                    key={r.index}
                    // A spot kick is the one timeline entry with a picture behind
                    // it, so it's the one you can click to see again.
                    {...(r.kick ? { onClick: () => penalty.show(r.event), title: t.pkReplay } : {})}
                    className={cn(
                      "flex items-start gap-2.5 px-2.5 py-1.5 text-left",
                      i < feed.length - 1 && "border-b border-hairline",
                      r.kick && "transition-colors hover:bg-surface-2",
                    )}
                  >
                    <span className="mt-0.5 w-6 shrink-0 text-right text-xs font-bold tabular-nums text-fg-faint">{r.event.minute}'</span>
                    <span className="mt-0.5 grid size-4 shrink-0 place-items-center" style={{ color: channel }}>
                      <EventIcon event={r.event} />
                    </span>
                    <span className="min-w-0 flex-1 text-sm leading-snug text-fg">{r.text}</span>
                  </Row>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Both sides, side by side, under everything else. */}
      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
        <LineupColumn team={home} side="home" ballOwnerId={ballOwner} shirt={shirt} kit={kits.home} crest={crests?.home} live={live} t={t} />
        <LineupColumn team={away} side="away" ballOwnerId={ballOwner} shirt={shirt} kit={kits.away} crest={crests?.away} live={live} t={t} />
      </div>

      {penalty.event && penalty.kick && (
        <PenaltyDialog
          open
          onOpenChange={(o) => !o && penalty.close()}
          kick={penalty.kick}
          taker={penalty.event.playerName}
          minute={penalty.event.minute}
          // The kick is against the OTHER side, so the figure in goal wears their kit.
          keeperKit={penalty.event.teamId === home.id ? kits.away : kits.home}
        />
      )}
    </div>
  );
}

/* ---- scoreboard ----------------------------------------------------------- */

/**
 * A side's mark: its crest where the dataset has one, and its kit where it does not.
 *
 * The fallback is not a grey box with initials. On this screen the kit IS how you tell the two apart —
 * it is what the chips on the pitch and the shirt discs in the line-ups are drawn in — so a side without
 * artwork is marked in the colour it is actually wearing, with `inkOn` picking ink that survives it.
 */
function TeamMark({ crest, kit, code, size = 30 }: { crest?: string; kit: ClubKit; code: string; size?: number }) {
  if (crest) return <Crest src={crest} size={size} />;
  return (
    <span
      className="grid shrink-0 place-items-center rounded-sm font-display font-bold ring-1 ring-black/25"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42), background: kit.primary, color: inkOn(kit.primary) }}
    >
      {code.slice(0, 3)}
    </span>
  );
}

/**
 * The broadcast bug: who, what the score is, where the clock is, and the transport.
 *
 * Every number here is `tabular-nums`, which is not decoration on a screen that repaints twelve times a
 * second — proportional digits change width as the minute ticks, and the whole centre column shuffles
 * sideways once per second for ninety minutes.
 */
function Scoreboard({ live, snap, home, away, kits, crests, t }: {
  live: SpatialController;
  snap: SpatialSnapshot;
  home: Team;
  away: Team;
  kits: { home: ClubKit; away: ClubKit };
  crests?: { home?: string; away?: string };
  t: UIStrings;
}) {
  const period =
    snap.status === "halftime" ? t.liveHalfTime
      : snap.status === "finished" ? t.fullTime
        : snap.status === "kickoff" ? t.liveKickOff
          : snap.minute <= 45 ? t.liveFirstHalf
            : t.liveSecondHalf;
  const minute = snap.status === "kickoff" ? 0 : snap.minute;
  const pct = Math.max(0, Math.min(100, (minute / REGULATION_MINUTES) * 100));

  const side = (team: Team, kit: ClubKit, crest: string | undefined, mirrored: boolean) => (
    // `justify-end` in BOTH cases, which is not a typo: the away block is `flex-row-reverse`, so its
    // main axis runs right-to-left and main-END is the left edge. Both sides therefore pack against the
    // score in the middle instead of against the outside of the card.
    <div className={cn("flex min-w-0 items-center justify-end gap-2 sm:gap-3", mirrored && "flex-row-reverse")}>
      <div className={cn("min-w-0", mirrored ? "text-left" : "text-right")}>
        <div className="serif truncate text-sm font-semibold text-fg sm:text-base">{team.shortName}</div>
        {/* The full club name only when it says something the short name did not. */}
        {team.name !== team.shortName && <div className="caps truncate text-fg-faint">{team.name}</div>}
      </div>
      <TeamMark crest={crest} kit={kit} code={team.shortName} />
      {/* Who has the ball, said on the scoreboard rather than only inferable from the pitch. */}
      <span
        className="size-1.5 shrink-0 rounded-full transition-opacity"
        style={{ background: kit.primary, opacity: snap.possessionTeamId === team.id ? 1 : 0 }}
      />
    </div>
  );

  return (
    <Card className="relative overflow-hidden">
      <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-[var(--brand-emerald)] to-[var(--brand-lime)]" />
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3 py-3.5 sm:gap-5 sm:px-4">
        {side(home, kits.home, crests?.home, false)}
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex items-baseline gap-2 sm:gap-3">
            <span className="serif text-3xl font-bold tabular-nums text-fg sm:text-4xl">{snap.homeScore}</span>
            <span className="text-xl text-fg-faint sm:text-2xl">:</span>
            <span className="serif text-3xl font-bold tabular-nums text-fg sm:text-4xl">{snap.awayScore}</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={snap.status === "halftime" ? "gold" : "primary"} className="tabular-nums">{minute}'</Badge>
            <span className="caps whitespace-nowrap text-fg-faint">{period}</span>
          </div>
        </div>
        {side(away, kits.away, crests?.away, true)}
      </div>

      {!live.finished && (
        <div className="flex flex-wrap items-center justify-center gap-2 border-t border-hairline px-3 py-2">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={live.speed === 0 ? t.livePlay : t.livePause}
            onClick={() => live.setSpeed(live.speed === 0 ? 1 : 0)}
          >
            {live.speed === 0 ? <Play /> : <Pause />}
          </Button>
          <ToggleGroup type="single" value={String(live.speed)} onValueChange={(v) => v && live.setSpeed(Number(v) as Speed)} aria-label={t.liveSpeed}>
            <ToggleGroupItem value="1" className="tabular-nums">1×</ToggleGroupItem>
            <ToggleGroupItem value="2" className="tabular-nums">2×</ToggleGroupItem>
            <ToggleGroupItem value="4" className="tabular-nums">4×</ToggleGroupItem>
          </ToggleGroup>
          <Button variant="secondary" size="sm" aria-label={t.liveSkipToEnd} title={t.liveSkipToEnd} onClick={live.finishNow}><FastForward /></Button>
        </div>
      )}

      {/* How far into the ninety we are. Clamped, because stoppage runs past it. */}
      <span className="absolute inset-x-0 bottom-0 h-0.5 bg-surface-2">
        <span className="block h-full bg-gradient-to-r from-[var(--brand-emerald)] to-[var(--brand-lime)] transition-[width] duration-200" style={{ width: `${pct}%` }} />
      </span>
    </Card>
  );
}

/**
 * Stop the match on a penalty and put the replay on screen.
 *
 * A spot kick is over in a second on the pitch view and the only thing the
 * manager can't influence, so it's the one moment worth interrupting for. The
 * clock is stopped while the replay is up and returned to the speed it was
 * running at, so pausing for it costs nothing. Fast-forwarding is exempt by
 * construction: this view isn't mounted while the match is being skipped.
 */
export function usePenaltyReplay(live: SpatialController) {
  const [event, setEvent] = useState<MatchEvent | null>(null);
  const resume = useRef<Speed>(1);
  /*
   * Seeded with the events that have ALREADY happened, not with zero.
   *
   * This view is unmounted and remounted twice during an ordinary match — the tactics board replaces
   * the whole subtree, and so does the skip progress. A watermark starting at zero therefore rescanned
   * the match from the first minute on the way back, found a penalty the manager had already watched,
   * stopped the clock and put the dialog up again. The state is per-MOUNT while the feed it tracks is
   * per-MATCH.
   *
   * Seeding is the right answer rather than moving the watermark into the controller, because "already
   * happened while I wasn't looking" is exactly what should not interrupt: the clock is stopped behind
   * the tactics board so nothing can accrue there, and a skip deliberately fast-forwards past
   * everything — a dialog per penalty skipped would be the same bug wearing a different hat.
   */
  const seen = useRef(live.events.length);

  useEffect(() => {
    if (live.events.length < seen.current) seen.current = 0; // a new match reset the feed
    for (let i = seen.current; i < live.events.length; i++) {
      const e = live.events[i]!;
      if (!penaltyKickOf(e)) continue;
      resume.current = live.speed === 0 ? 1 : live.speed;
      live.setSpeed(0);
      setEvent(e);
      break;
    }
    seen.current = live.events.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.events]);

  return {
    event,
    kick: event ? penaltyKickOf(event) : null,
    /** Replay one from the timeline — the clock is already stopped by then. */
    show: (e: MatchEvent) => {
      resume.current = live.speed === 0 ? 0 : live.speed;
      live.setSpeed(0);
      setEvent(e);
    },
    close: () => {
      setEvent(null);
      live.setSpeed(resume.current);
    },
  };
}

/* ---- line-ups ------------------------------------------------------------- */

/** Green while fresh, amber when tiring, red when he's finished. */
const staminaColor = (pct: number) => (pct > 66 ? "var(--pos-mid)" : pct > 40 ? "var(--gold)" : "var(--danger)");

/** A booking, drawn as the shape a booking actually is. */
function CardPip({ red, size = 11 }: { red?: boolean; size?: number }) {
  return (
    <span
      className="inline-block shrink-0 rounded-[1px] ring-1 ring-black/25"
      style={{ width: size * 0.72, height: size, background: red ? "var(--danger)" : "var(--gold)" }}
    />
  );
}

/**
 * A side's eleven, live.
 *
 * Reads the side from `live.shape()` rather than from the static `Team.startingXi` or from `onPitch()`.
 * `startingXi` is the kick-off eleven and stops being the eleven playing the moment anyone is
 * substituted; `onPitch()` is the right men but carries only stamina, which is why the column used to
 * look each player's rating up in `startingXi.concat(bench)` — a lookup that silently produced nothing
 * for anyone outside the matchday squad. `shape()` is the engine's own answer and carries the rating,
 * the fitness AND the bookings in one object, with nothing to fabricate.
 *
 * The bookings are the point of this rewrite. `AgentShape.booked` was already read by the in-match
 * tactics board's marker and not here, so on the watched match a man one tackle from a red looked
 * exactly like a man with a clean sheet.
 */
function LineupColumn({ team, side, ballOwnerId, shirt, kit, crest, live, t }: {
  team: Team;
  side: "home" | "away";
  ballOwnerId?: string;
  shirt: Shirt;
  kit: ClubKit;
  crest?: string;
  live: SpatialController;
  t: UIStrings;
}) {
  const color = kit.primary;
  const reverse = side === "away";
  const rows = live.shape(team.id);
  const injuredId = live.pendingInjury(team.id);
  const subsLeft = live.subsRemaining(team.id);
  return (
    <Card className="overflow-hidden">
      <div className={cn("flex items-center gap-2 border-b border-hairline px-2.5 py-2", reverse && "flex-row-reverse")}>
        <TeamMark crest={crest} kit={kit} code={team.shortName} size={22} />
        <span className="serif min-w-0 flex-1 truncate text-sm font-semibold text-fg">{team.shortName}</span>
        {/* How many changes are left — a number the manager was previously only shown once he had
            already opened the bench. */}
        <span className="caps shrink-0 whitespace-nowrap text-fg-faint">
          {t.subsLeft} <b className="tabular-nums text-fg-muted">{subsLeft}</b>
        </span>
      </div>
      <div className="flex flex-col p-1.5">
        {rows.map((r) => {
          const onBall = r.id === ballOwnerId;
          const stamina = Math.max(0, Math.min(100, Math.round(r.stamina * 100)));
          return (
            <div key={r.id} className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors", onBall && "bg-primary-soft", reverse && "flex-row-reverse text-right")}>
              <span className="grid size-6 shrink-0 place-items-center rounded-full text-2xs font-bold tabular-nums ring-1 ring-black/25" style={{ background: color, color: inkOn(color) }}>{shirt(r.id)}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{r.name}</span>
              {/* Two yellows is a red, so the second one is drawn as what it has become. */}
              {r.booked > 0 && <CardPip red={r.booked >= 2} />}
              {r.id === injuredId && <InjuryMark size={13} />}
              {/* Stamina, at a glance: a bar reads faster than a number when
                  you're scanning eleven of them for who to take off — with the
                  number beside it for the one you have picked out. */}
              <span className="hidden w-8 shrink-0 text-2xs tabular-nums text-fg-muted sm:inline" style={{ textAlign: reverse ? "left" : "right" }}>{stamina}%</span>
              <span className="h-1 w-8 shrink-0 overflow-hidden rounded-full bg-surface-3" title={`${t.condition} ${stamina}%`}>
                <span className="block h-full rounded-full" style={{ width: `${stamina}%`, background: staminaColor(stamina) }} />
              </span>
              <span className="caps hidden shrink-0 text-fg-faint sm:inline">{POS_SHORT[r.fielded]}</span>
              <Overall value={r.overall} size="sm" />
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ---- feed ----------------------------------------------------------------- */

function FeedChip({ label, count, active, onSelect, onClear, clearLabel }: {
  label: string;
  count: number;
  active: boolean;
  onSelect: () => void;
  onClear?: () => void;
  clearLabel: string;
}) {
  return (
    <span className={cn("inline-flex items-center overflow-hidden rounded-md border text-xs", active ? "border-[var(--primary-line)] bg-primary-soft" : "border-border")}>
      <button
        type="button"
        onClick={onSelect}
        className={cn("flex items-center gap-1.5 px-2 py-1 font-medium outline-none", active ? "text-fg hover:bg-[var(--primary-wash)]" : "text-fg-muted hover:bg-surface-2")}
      >
        {label}
        <span className="tabular-nums text-fg-faint">{count}</span>
      </button>
      {onClear && (
        <button
          type="button"
          aria-label={`${clearLabel}: ${label}`}
          onClick={onClear}
          className="grid h-full w-5 place-items-center text-fg-muted hover:bg-[var(--primary-wash)] hover:text-fg"
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}

/** The mark in the feed's margin, coloured by the side it belongs to. */
function EventIcon({ event }: { event: MatchEvent }) {
  switch (event.type) {
    case MatchEventType.Goal:
      return <Goal className="size-3.5" />;
    case MatchEventType.Card:
      return <CardPip red={event.params?.color === CardColor.Red} size={10} />;
    case MatchEventType.Penalty:
    case MatchEventType.Shot:
      return <Target className="size-3.5" />;
    case MatchEventType.Substitution:
      return <ArrowLeftRight className="size-3.5" />;
    case MatchEventType.Foul:
      return <TriangleAlert className="size-3.5" />;
    case MatchEventType.Offside:
      return <Flag className="size-3.5" />;
    case MatchEventType.Corner:
      return <CornerDownRight className="size-3.5" />;
    case MatchEventType.Injury:
      return <InjuryMark size={12} />;
    case MatchEventType.TacticChange:
      return <Users className="size-3.5" />;
    default:
      return <Timer className="size-3.5" />;
  }
}

/* ---- the shout over the pitch --------------------------------------------- */

type Banner = { key: number; title: string; sub?: string; tone: "goal" | "gold" | "danger" | "info" | "neutral" };

/**
 * What is worth shouting, and in the manager's language.
 *
 * The titles used to be hardcoded `("GOAL!", "GOL!")` pairs chosen by a boolean — the one place in the
 * app where a user-facing string was written inline instead of looked up, which is how the Portuguese
 * half stayed invisible to anyone adding a third locale. They are `t.*` keys now, like every other label
 * on the screen. The narration in the FEED still comes from `@fut/i18n`, which is the right split: that
 * catalogue renders structured EVENTS, this is interface chrome.
 */
function bannerFor(e: MatchEvent, i: number, t: UIStrings): Banner | null {
  switch (e.type) {
    case MatchEventType.Goal: return { key: i, title: t.liveGoalCry, tone: "goal" };
    case MatchEventType.Penalty: return { key: i, title: t.livePenaltyCry, tone: "gold" };
    case MatchEventType.Shot:
      // Only a penalty earns a banner; an ordinary shot would fire one a minute.
      if (!e.params?.penalty) return null;
      return e.params?.saved
        ? { key: i, title: t.liveSavedCry, sub: t.livePenaltyWord, tone: "gold" }
        : { key: i, title: t.liveMissedCry, sub: t.livePenaltyWord, tone: "neutral" };
    // A red card turns the match, so it gets the same treatment a goal does. A yellow does not.
    case MatchEventType.Card:
      return e.params?.color === CardColor.Red ? { key: i, title: t.liveRedCardCry, sub: e.playerName, tone: "danger" } : null;
    case MatchEventType.Injury: return { key: i, title: t.liveInjuryCry, sub: e.playerName, tone: "danger" };
    case MatchEventType.Offside: return { key: i, title: t.liveOffsideCry, tone: "neutral" };
    case MatchEventType.Corner: return { key: i, title: t.liveCornerCry, tone: "info" };
    case MatchEventType.HalfTime: return { key: i, title: t.liveHalfTime, tone: "info" };
    case MatchEventType.FullTime: return { key: i, title: t.fullTime, tone: "info" };
    default: return null;
  }
}

function useEventBanner(events: readonly MatchEvent[], t: UIStrings): Banner | null {
  const [banner, setBanner] = useState<Banner | null>(null);
  // Seeded with what already happened, for the reason spelled out in `usePenaltyReplay`: coming back
  // from the tactics board is a remount, and a zero watermark flashed "GOAL!" for a goal from the
  // twelfth minute.
  const seen = useRef(events.length);
  useEffect(() => {
    if (events.length < seen.current) seen.current = 0;
    for (let i = events.length - 1; i >= seen.current; i--) {
      const b = bannerFor(events[i]!, i, t);
      if (b) { setBanner(b); break; }
    }
    seen.current = events.length;
  }, [events, t]);
  useEffect(() => {
    if (!banner) return;
    const id = setTimeout(() => setBanner(null), 2600);
    return () => clearTimeout(id);
  }, [banner]);
  return banner;
}

function EventBanner({ banner }: { banner: Banner }) {
  const tone = {
    goal: "bg-gradient-to-br from-[var(--brand-emerald)] to-[var(--brand-lime)] text-[var(--text-on-accent)]",
    gold: "bg-gold text-[var(--text-on-accent)]",
    danger: "bg-danger text-[var(--text-on-accent)]",
    // Black overlays, so white type is the readable choice rather than a lapse. The ring is a
    // `color-mix` and not `ring-[var(--brand-emerald)]/40`: Tailwind cannot compute an alpha from a
    // `var()`, so that modifier emitted no CSS at all and the ring was simply absent.
    info: "bg-black/80 text-white ring-1 ring-[color-mix(in_srgb,var(--brand-emerald)_45%,transparent)]",
    neutral: "bg-black/80 text-white ring-1 ring-white/15",
  }[banner.tone];
  return (
    <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
      <div key={banner.key} className={cn("animate-in fade-in zoom-in-95 rounded-xl px-10 py-4 text-center shadow-2xl backdrop-blur-sm duration-slow", tone)}>
        <div className="serif text-3xl font-bold tracking-wide">{banner.title}</div>
        {banner.sub && <div className="mt-0.5 caps opacity-90">{banner.sub}</div>}
      </div>
    </div>
  );
}

/* ---- statistics ----------------------------------------------------------- */

/**
 * Both sides of everything the engine counts.
 *
 * `TeamStats` has always tracked fouls, offsides, corners and both card counts, and none of them had
 * ever been on screen — the panel showed five of the eleven numbers being kept. They are all here now,
 * in the two-sided comparison bars a broadcast uses.
 *
 * Shared with the full-time summary, which is why it takes `stats` and a catalogue and nothing about
 * kits: the same panel has to read identically in both places.
 */
export function LiveStats({ stats, cat }: { stats: { home: TeamStats; away: TeamStats } | null; cat: ReturnType<typeof getCatalog> }) {
  if (!stats) return null;
  const poss = possessionPercent(stats.home, stats.away);
  // Undefined, not 0. Before a side's first pass there is no accuracy to report, and printing "0%"
  // says a team has misplaced every ball it has touched.
  const pa = (s: TeamStats) => (s.passes > 0 ? Math.round((s.passesCompleted / s.passes) * 100) : undefined);
  return (
    <Card>
      <CardHeader><CardTitle>{cat.phrase("statistics")}</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-3">
        <StatRow label={cat.label("possession")} home={poss.home} away={poss.away} suffix="%" />
        <StatRow label={cat.label("shots")} home={stats.home.shots} away={stats.away.shots} />
        <StatRow label={cat.label("shotsOnTarget")} home={stats.home.shotsOnTarget} away={stats.away.shotsOnTarget} />
        <StatRow label={cat.label("passAccuracy")} home={pa(stats.home)} away={pa(stats.away)} suffix="%" />
        <StatRow label={cat.label("tackles")} home={stats.home.tackles} away={stats.away.tackles} />
        <StatRow label={cat.label("fouls")} home={stats.home.fouls} away={stats.away.fouls} />
        <StatRow label={cat.label("offsides")} home={stats.home.offsides} away={stats.away.offsides} />
        <StatRow label={cat.label("corners")} home={stats.home.corners} away={stats.away.corners} />
        {/* Cards get counts and no bar. A bar invites you to read a share, and nobody wants to know
            what percentage of the afternoon's bookings were theirs. */}
        <div className="flex flex-col gap-2 border-t border-hairline pt-3">
          <DisciplineRow label={cat.label("yellowCards")} home={stats.home.yellowCards} away={stats.away.yellowCards} />
          <DisciplineRow label={cat.label("redCards")} home={stats.home.redCards} away={stats.away.redCards} red />
        </div>
      </CardContent>
    </Card>
  );
}

function StatRow({ label, home, away, suffix = "" }: { label: string; home?: number; away?: number; suffix?: string }) {
  const known = home !== undefined && away !== undefined;
  const total = known ? home + away : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className={cn("text-xs font-semibold tabular-nums", known ? "text-fg" : "text-fg-faint")}>{known ? `${home}${suffix}` : "—"}</span>
        <span className="caps text-fg-faint">{label}</span>
        <span className={cn("text-xs font-semibold tabular-nums", known ? "text-fg" : "text-fg-faint")}>{known ? `${away}${suffix}` : "—"}</span>
      </div>
      {/* An empty track when nothing has happened yet — a full-width bar split 50/50 would claim two
          sides are level at something neither has done. */}
      <div className="flex h-1 gap-0.5 overflow-hidden rounded-full bg-surface-2">
        {total > 0 && (
          <>
            <div className="rounded-l-full" style={{ width: `${(home! / total) * 100}%`, background: HOME_CHANNEL }} />
            <div className="ml-auto rounded-r-full" style={{ width: `${(away! / total) * 100}%`, background: AWAY_CHANNEL }} />
          </>
        )}
      </div>
    </div>
  );
}

function DisciplineRow({ label, home, away, red }: { label: string; home: number; away: number; red?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5">
        <CardPip red={red} size={10} />
        <span className="text-xs font-semibold tabular-nums text-fg">{home}</span>
      </span>
      <span className="caps text-fg-faint">{label}</span>
      <span className="flex items-center gap-1.5">
        <span className="text-xs font-semibold tabular-nums text-fg">{away}</span>
        <CardPip red={red} size={10} />
      </span>
    </div>
  );
}

// --- pitch (engine geometry, one projection places players + ball) ----------
const PITCH = pitchGeometry();
const L = PITCH.length;
const W = PITCH.width;
const GD = FIELD.GOAL_DEPTH;
const PAD = 4;
const projX = (x: number): number => x;
const projY = (y: number): number => y;
function projectRect(r: PitchRect) { return { x: r.x, y: r.y, width: r.w, height: r.h }; }
function arcPath(a: PitchArc, steps = 22): string {
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const t = a.a0 + ((a.a1 - a.a0) * i) / steps;
    d += `${i === 0 ? "M" : "L"}${projX(a.cx + a.r * Math.cos(t)).toFixed(2)} ${projY(a.cy + a.r * Math.sin(t)).toFixed(2)}`;
  }
  return d;
}
const LINE = "var(--pitch-line)";
const STRIPES = 14;
/**
 * The pitch is DRAWN in engine coordinates — 105 long by 68 across, i.e. landscape —
 * and stood upright ON A PHONE ONLY by one matrix, rather than every rect, circle and
 * arc being re-derived. A phone has height to spare and almost no width, so a landscape
 * pitch wasted most of the screen and left the players tiny. A desktop has the opposite
 * problem, so from `lg` up the pitch stays landscape, which is also how the engine and
 * every football broadcast read it.
 *
 * `matrix(0 -1 1 0 0 L)` maps engine (x, y) to screen (y, L - x): the length runs
 * DOWN the screen with the home goal at the bottom, which is how the tactics board
 * reads. Anything with text inside has to be counter-rotated (see `UPRIGHT`), or the
 * shirt numbers come out lying on their side — so the two always travel together.
 */
const ROTATE = `matrix(0 -1 1 0 0 ${L})`;
/** The inverse rotation, for labels that must stay readable. */
const UPRIGHT = "matrix(0 1 -1 0 0 0)";
const VB_PORTRAIT = { x: -PAD, y: -(GD + PAD), w: W + 2 * PAD, h: L + 2 * (GD + PAD) };
const VB_LANDSCAPE = { x: -(GD + PAD), y: -PAD, w: L + 2 * (GD + PAD), h: W + 2 * PAD };
/** The breakpoint the Shell already uses to divide phone from desktop. */
const LANDSCAPE_FROM = "(min-width: 1024px)";
const ARC_PATHS = PITCH.arcs.map((a) => arcPath(a));

/**
 * Every painted line, once. Drawn twice by the caller — a dark pass under a light one — which is what
 * makes the markings sit ON the grass instead of floating over it. Extracted rather than duplicated so
 * the two passes cannot drift apart.
 */
function MarkingShapes() {
  return (
    <>
      <rect {...projectRect(PITCH.boundary)} />
      {PITCH.lines.map(([a, b], i) => (<line key={`l${i}`} x1={projX(a.x)} y1={projY(a.y)} x2={projX(b.x)} y2={projY(b.y)} />))}
      {PITCH.areas.map((r, i) => (<rect key={`a${i}`} {...projectRect(r)} />))}
      {PITCH.circles.map((c, i) => (<circle key={`c${i}`} cx={projX(c.c.x)} cy={projY(c.c.y)} r={c.r} />))}
      {ARC_PATHS.map((d, i) => (<path key={`arc${i}`} d={d} />))}
    </>
  );
}

/**
 * Static for the whole match, and `memo`'d for it.
 *
 * This is not a micro-optimisation. Positions are pushed about twelve times a second, and without the
 * memo every stripe, line, arc, spot and net thread below would be reconciled on each of those pushes
 * while the simulation is trying to use the same frame. `ARC_PATHS` is precomputed at module level for
 * the same reason. Anything added here must be genuinely constant — the moment it takes a prop that
 * changes during play, the memo stops holding and the cost comes back.
 */
const PitchMarkings = memo(function PitchMarkings() {
  return (
    <>
      <defs>
        {/* Stadium light: brighter down the middle, falling off to the corners. This is what stops a
            flat fill from reading as green paper. */}
        <radialGradient id="fut-pitch-light" cx="50%" cy="45%" r="72%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.11" />
          <stop offset="55%" stopColor="#ffffff" stopOpacity="0.03" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.26" />
        </radialGradient>
        {/* `userSpaceOnUse` in ENGINE metres, so the mesh is the same gauge in both orientations. */}
        <pattern id="fut-pitch-net" width="0.9" height="0.9" patternUnits="userSpaceOnUse">
          <path d="M0 0 H0.9 M0 0 V0.9" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth={0.07} />
        </pattern>
        <radialGradient id="fut-ball" cx="34%" cy="30%" r="78%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="68%" stopColor="#e6edf3" />
          <stop offset="100%" stopColor="#93a5b4" />
        </radialGradient>
      </defs>

      {Array.from({ length: STRIPES }, (_, i) => (
        <rect key={`s${i}`} x={(i * L) / STRIPES} y={0} width={L / STRIPES} height={W} fill={i % 2 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)"} />
      ))}
      {/* Covers pitch AND the goal margins in both orientations: under `ROTATE` this exact rect maps
          onto `VB_PORTRAIT`, which is why one rect serves both viewBoxes. */}
      <rect x={-(GD + PAD)} y={-PAD} width={L + 2 * (GD + PAD)} height={W + 2 * PAD} fill="url(#fut-pitch-light)" />

      {/* A dark halo, not a drop shadow. A shadow would need an offset, and an offset is a SCREEN
          direction that this component cannot know without taking the orientation as a prop and losing
          its memo. A halo is symmetric and therefore orientation-free. */}
      <g fill="none" stroke="rgba(0,0,0,0.34)" strokeWidth={0.66} strokeLinecap="round">
        <MarkingShapes />
      </g>
      <g fill="none" stroke={LINE} strokeWidth={0.28} strokeLinecap="round">
        <MarkingShapes />
      </g>
      <g stroke={LINE} strokeWidth={0.24}>
        {PITCH.goals.map((r, i) => (<rect key={`g${i}`} {...projectRect(r)} fill="url(#fut-pitch-net)" />))}
      </g>
      <g fill={LINE}>{PITCH.spots.map((s, i) => (<circle key={`sp${i}`} cx={projX(s.x)} cy={projY(s.y)} r={0.35} />))}</g>
    </>
  );
});

function SpatialPitch({ snap, homeId, shirt, kits }: { snap: SpatialSnapshot; homeId: string; shirt: Shirt; kits: { home: ClubKit; away: ClubKit } }) {
  const portrait = !useMediaQuery(LANDSCAPE_FROM);
  const VB = portrait ? VB_PORTRAIT : VB_LANDSCAPE;
  // A chip's shadow falls DOWN THE SCREEN, and "down the screen" is a screen direction while these are
  // the engine's coordinates — the same trap as the ball's lift below, with the sign flipped.
  // Landscape: down-screen is +y. Portrait: the matrix maps screen y to L − x, so down-screen is −x.
  const shadowX = portrait ? -0.5 : 0;
  const shadowY = portrait ? 0 : 0.5;
  return (
    <div className="w-full">
      <svg viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`} className="block h-auto w-full rounded-md border border-border-strong" style={{ background: "var(--pitch-grass)" }}>
        <g transform={portrait ? ROTATE : undefined}>
        <PitchMarkings />
        {snap.players.map((p: SpatialPlayerView) => {
          const kit = p.teamId === homeId ? kits.home : kits.away;
          const ink = inkOn(kit.primary);
          return (
            // The CSS transition is what makes this look like football. React is only pushed ~12×/s
            // while the sim ticks at 100ms; the motion you see is the browser interpolating between
            // those pushes. Remove it and the players teleport twelve times a second.
            <g key={p.id} style={{ transform: `translate(${projX(p.x)}px, ${projY(p.y)}px)`, transition: "transform 90ms linear" }}>
              <title>{`${shirt(p.id)} · ${POS_SHORT[p.pos]}`}</title>
              <ellipse cx={shadowX} cy={shadowY} rx={1.75} ry={1.4} fill="#000" opacity={0.3} />
              {/* The one thing on the pitch that moves under its own steam. SMIL rather than a CSS
                  keyframe because there is nowhere in this component to declare one, and it is a single
                  node that mounts when possession changes — which is exactly when restarting it looks
                  right. */}
              {p.hasBall && (
                <circle r={2.2} fill="none" stroke="#ffffff" strokeWidth={0.2}>
                  <animate attributeName="r" values="1.9;3.2;1.9" dur="1.6s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.7;0;0.7" dur="1.6s" repeatCount="indefinite" />
                </circle>
              )}
              <circle
                r={1.72}
                fill={kit.primary}
                stroke={p.hasBall ? "#ffffff" : ink}
                strokeWidth={p.hasBall ? 0.5 : 0.24}
                strokeOpacity={p.hasBall ? 1 : 0.5}
              />
              <g transform={portrait ? UPRIGHT : undefined}>
                <text textAnchor="middle" dominantBaseline="central" fontSize={2.5} fontWeight={700} fill={ink}>{shirt(p.id)}</text>
              </g>
            </g>
          );
        })}
        {(() => {
          const bx = projX(snap.ball.x), by = projY(snap.ball.y);
          const z = snap.ball.z ?? 0, h = Math.min(z, 14);
          const lift = h * 0.65, grow = 1 + h * 0.06, shadow = 1 - h * 0.03, shadowOpacity = Math.max(0.14, 0.42 - h * 0.02);
          // A ball in the air is drawn above its own shadow, and "above" is a SCREEN
          // direction while these coordinates are the engine's. Landscape: screen-up is
          // −y. Portrait: the matrix maps screen y to L − x, so screen-up is +x. Lifting
          // along −y there would slide the ball sideways instead of into the air.
          const liftX = portrait ? lift : 0;
          const liftY = portrait ? 0 : -lift;
          return (
            <>
              <g style={{ transform: `translate(${bx}px, ${by}px)`, transition: "transform 90ms linear" }}>
                <ellipse rx={0.85 * Math.max(shadow, 0.55)} ry={0.5 * Math.max(shadow, 0.55)} fill="#000" opacity={shadowOpacity} />
              </g>
              <g style={{ transform: `translate(${bx + liftX}px, ${by + liftY}px)`, transition: "transform 90ms linear" }}>
                <circle r={0.85 * grow} fill="url(#fut-ball)" stroke="rgba(0,0,0,0.4)" strokeWidth={0.12} />
              </g>
            </>
          );
        })()}
        </g>
      </svg>
    </div>
  );
}
