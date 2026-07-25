import { memo, useEffect, useRef, useState } from "react";
import { FastForward, Pause, Play } from "lucide-react";
import { Position, type Team } from "@fut/domain";
import type { ClubKit } from "@fut/competition";
import { MatchEventType, possessionPercent, type MatchEvent, type TeamStats } from "@fut/engine";
import { getCatalog } from "@fut/i18n";
import {
  FIELD,
  pitchGeometry,
  type PitchArc,
  type PitchRect,
  type SpatialPlayerView,
  type SpatialSnapshot,
} from "@fut/spatial";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import type { SpatialController, Speed } from "../../hooks/useSpatialMatch";
import { cn } from "../../lib/utils";
import { inkOn } from "../../lib/kits";

export type Shirt = (id: string) => number | string;

const POS_SHORT: Record<Position, string> = {
  [Position.Goalkeeper]: "GK", [Position.CentreBack]: "CB", [Position.FullBack]: "FB", [Position.WingBack]: "WB",
  [Position.DefensiveMidfielder]: "DM", [Position.CentralMidfielder]: "CM", [Position.AttackingMidfielder]: "AM",
  [Position.Winger]: "WG", [Position.Striker]: "ST",
};
const KEY_EVENTS = new Set<MatchEventType>([MatchEventType.Goal, MatchEventType.Card, MatchEventType.Penalty, MatchEventType.HalfTime, MatchEventType.FullTime]);

/** The full FM-style live match view: lineups flanking a rendered pitch, with
 *  stats + timeline. Team/shirt-agnostic (career or exhibition) via props. */
export function LiveMatchView({ live, home, away, shirt, locale, kits }: { live: SpatialController; home: Team; away: Team; shirt: Shirt; locale: "en" | "pt-BR"; kits: { home: ClubKit; away: ClubKit } }) {
  const snap = live.snapshot;
  const cat = getCatalog(locale);
  const ctx = { teamName: (id: string | undefined) => (id === home.id ? home.name : id === away.id ? away.name : "") };
  const banner = useEventBanner(live.events, locale);
  if (!snap) return null;

  const ballOwner = snap.players.find((p) => p.hasBall)?.id;
  const feed = live.events
    .filter((e) => KEY_EVENTS.has(e.type))
    .map((e, i) => ({ key: i, minute: e.minute, teamId: e.teamId, text: cat.renderEvent(e, ctx) }))
    .filter((e) => e.text)
    .slice(-16)
    .reverse();

  return (
    <div className="flex flex-col gap-4">
      <Card className="relative overflow-hidden">
        <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-[var(--brand-emerald)] to-[var(--brand-lime)]" />
        <div className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div className="flex items-center gap-4">
            <span className="serif text-lg font-semibold">{home.shortName}</span>
            <span className="serif text-3xl font-bold tabular-nums">{snap.homeScore} : {snap.awayScore}</span>
            <span className="serif text-lg font-semibold">{away.shortName}</span>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={snap.status === "halftime" ? "gold" : "primary"}>
              {snap.status === "halftime" ? "HT" : snap.status === "kickoff" ? "0'" : `${snap.minute}'`}
            </Badge>
            {!live.finished && (
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon-sm" aria-label="pause/play" onClick={() => live.setSpeed(live.speed === 0 ? 1 : 0)}>
                  {live.speed === 0 ? <Play /> : <Pause />}
                </Button>
                <ToggleGroup type="single" value={String(live.speed)} onValueChange={(v) => v && live.setSpeed(Number(v) as Speed)}>
                  <ToggleGroupItem value="1">1×</ToggleGroupItem>
                  <ToggleGroupItem value="2">2×</ToggleGroupItem>
                  <ToggleGroupItem value="4">4×</ToggleGroupItem>
                </ToggleGroup>
                <Button variant="secondary" size="sm" onClick={live.finishNow}><FastForward /></Button>
              </div>
            )}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(190px,1fr)_2.2fr_minmax(190px,1fr)]">
        <LineupColumn team={home} side="home" ballOwnerId={ballOwner} shirt={shirt} kit={kits.home} />
        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="relative p-2 sm:p-3">
              <SpatialPitch snap={snap} homeId={home.id} shirt={shirt} kits={kits} />
              {banner && <EventBanner banner={banner} />}
            </CardContent>
          </Card>
          <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
            <LiveStats stats={live.stats} cat={cat} />
            <Card>
              <CardHeader><CardTitle>{cat.phrase("timeline")}</CardTitle></CardHeader>
              <CardContent className="flex max-h-[360px] flex-col gap-0 overflow-y-auto p-0">
                {feed.length === 0 && <p className="p-4 text-sm text-fg-muted">…</p>}
                {feed.map((e, i) => (
                  <div key={e.key} className={cn("flex items-start gap-3 px-4 py-2", i < feed.length - 1 && "border-b border-hairline")}>
                    <span className="mt-px w-7 shrink-0 text-right text-xs font-bold tabular-nums text-fg-faint">{e.minute}'</span>
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full" style={{ background: e.teamId === home.id ? "var(--pos-mid)" : e.teamId === away.id ? "var(--pos-att)" : "var(--text-faint)" }} />
                    <span className="text-sm leading-snug">{e.text}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
        <LineupColumn team={away} side="away" ballOwnerId={ballOwner} shirt={shirt} kit={kits.away} />
      </div>
    </div>
  );
}

function LineupColumn({ team, side, ballOwnerId, shirt, kit }: { team: Team; side: "home" | "away"; ballOwnerId?: string; shirt: Shirt; kit: ClubKit }) {
  const color = kit.primary;
  const reverse = side === "away";
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-hairline px-3 py-2.5" style={reverse ? { flexDirection: "row-reverse" } : undefined}>
        <span className="grid size-7 place-items-center rounded-sm bg-surface-3 font-display text-xs font-bold" style={{ color }}>{team.shortName[0]}</span>
        <span className="serif text-sm font-semibold">{team.shortName}</span>
      </div>
      <div className="flex flex-col p-1.5">
        {team.startingXi.map((p) => {
          const onBall = p.id === ballOwnerId;
          return (
            <div key={p.id} className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors", onBall && "bg-surface-2", reverse && "flex-row-reverse text-right")}>
              <span className="grid size-6 shrink-0 place-items-center rounded-full text-2xs font-bold tabular-nums ring-1 ring-black/25" style={{ background: color, color: inkOn(color) }}>{shirt(p.id)}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
              <span className="hidden text-2xs font-semibold uppercase tracking-caps text-fg-faint sm:inline">{POS_SHORT[p.position]}</span>
              <span className="w-5 shrink-0 text-center text-xs font-bold tabular-nums text-primary">{Math.round(p.overall())}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

type Banner = { key: number; title: string; sub?: string; tone: "goal" | "gold" | "info" | "neutral" };

function bannerFor(e: MatchEvent, i: number, pt: boolean): Banner | null {
  const tt = (en: string, ptText: string) => (pt ? ptText : en);
  switch (e.type) {
    case MatchEventType.Goal: return { key: i, title: tt("GOAL!", "GOL!"), tone: "goal" };
    case MatchEventType.Penalty: return { key: i, title: tt("PENALTY", "PÊNALTI"), tone: "gold" };
    case MatchEventType.Offside: return { key: i, title: tt("Offside", "Impedimento"), tone: "neutral" };
    case MatchEventType.Corner: return { key: i, title: tt("Corner", "Escanteio"), tone: "info" };
    case MatchEventType.HalfTime: return { key: i, title: tt("Half-time", "Intervalo"), tone: "info" };
    case MatchEventType.FullTime: return { key: i, title: tt("Full-time", "Fim de jogo"), tone: "info" };
    default: return null;
  }
}

function useEventBanner(events: readonly MatchEvent[], locale: "en" | "pt-BR"): Banner | null {
  const [banner, setBanner] = useState<Banner | null>(null);
  const seen = useRef(0);
  useEffect(() => {
    if (events.length < seen.current) seen.current = 0;
    for (let i = events.length - 1; i >= seen.current; i--) {
      const b = bannerFor(events[i]!, i, locale === "pt-BR");
      if (b) { setBanner(b); break; }
    }
    seen.current = events.length;
  }, [events, locale]);
  useEffect(() => {
    if (!banner) return;
    const id = setTimeout(() => setBanner(null), 2600);
    return () => clearTimeout(id);
  }, [banner]);
  return banner;
}

function EventBanner({ banner }: { banner: Banner }) {
  const tone = {
    goal: "bg-gradient-to-br from-[var(--brand-emerald)] to-[var(--brand-lime)] text-[#04140e]",
    gold: "bg-amber-400 text-[#1a1204]",
    info: "bg-black/80 text-white ring-1 ring-[var(--brand-emerald)]/40",
    neutral: "bg-black/80 text-white ring-1 ring-white/15",
  }[banner.tone];
  return (
    <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
      <div key={banner.key} className={cn("animate-in fade-in zoom-in-95 rounded-xl px-10 py-4 text-center shadow-2xl backdrop-blur-sm duration-200", tone)}>
        <div className="serif text-3xl font-bold tracking-wide">{banner.title}</div>
        {banner.sub && <div className="mt-0.5 text-xs font-semibold uppercase tracking-caps opacity-90">{banner.sub}</div>}
      </div>
    </div>
  );
}

export function LiveStats({ stats, cat }: { stats: { home: TeamStats; away: TeamStats } | null; cat: ReturnType<typeof getCatalog> }) {
  if (!stats) return null;
  const poss = possessionPercent(stats.home, stats.away);
  const pa = (s: TeamStats) => (s.passes > 0 ? Math.round((s.passesCompleted / s.passes) * 100) : 0);
  return (
    <Card>
      <CardHeader><CardTitle>{cat.phrase("statistics")}</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-3.5">
        <StatRow label={cat.label("possession")} home={poss.home} away={poss.away} suffix="%" />
        <StatRow label={cat.label("shots")} home={stats.home.shots} away={stats.away.shots} />
        <StatRow label={cat.label("shotsOnTarget")} home={stats.home.shotsOnTarget} away={stats.away.shotsOnTarget} />
        <StatRow label={cat.label("passAccuracy")} home={pa(stats.home)} away={pa(stats.away)} suffix="%" />
        <StatRow label={cat.label("tackles")} home={stats.home.tackles} away={stats.away.tackles} />
      </CardContent>
    </Card>
  );
}

function StatRow({ label, home, away, suffix = "" }: { label: string; home: number; away: number; suffix?: string }) {
  const total = home + away || 1;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs tabular-nums">
        <span className="font-semibold">{home}{suffix}</span>
        <span className="text-fg-faint">{label}</span>
        <span className="font-semibold">{away}{suffix}</span>
      </div>
      <div className="flex h-1 gap-0.5 overflow-hidden rounded-full">
        <div className="rounded-l-full bg-[var(--pos-mid)]" style={{ width: `${(home / total) * 100}%` }} />
        <div className="rounded-r-full bg-[var(--pos-att)]" style={{ width: `${(away / total) * 100}%` }} />
      </div>
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
const VB = { x: -(GD + PAD), y: -PAD, w: L + 2 * (GD + PAD), h: W + 2 * PAD };
const ARC_PATHS = PITCH.arcs.map((a) => arcPath(a));

const PitchMarkings = memo(function PitchMarkings() {
  return (
    <>
      {Array.from({ length: STRIPES }, (_, i) => (
        <rect key={`s${i}`} x={(i * L) / STRIPES} y={0} width={L / STRIPES} height={W} fill={i % 2 ? "rgba(255,255,255,0.045)" : "rgba(0,0,0,0.05)"} />
      ))}
      <g fill="none" stroke={LINE} strokeWidth={0.28} strokeLinecap="round">
        <rect {...projectRect(PITCH.boundary)} />
        {PITCH.lines.map(([a, b], i) => (<line key={`l${i}`} x1={projX(a.x)} y1={projY(a.y)} x2={projX(b.x)} y2={projY(b.y)} />))}
        {PITCH.areas.map((r, i) => (<rect key={`a${i}`} {...projectRect(r)} />))}
        {PITCH.circles.map((c, i) => (<circle key={`c${i}`} cx={projX(c.c.x)} cy={projY(c.c.y)} r={c.r} />))}
        {ARC_PATHS.map((d, i) => (<path key={`arc${i}`} d={d} />))}
        {PITCH.goals.map((r, i) => (<rect key={`g${i}`} {...projectRect(r)} fill="rgba(255,255,255,0.07)" />))}
      </g>
      <g fill={LINE}>{PITCH.spots.map((s, i) => (<circle key={`sp${i}`} cx={projX(s.x)} cy={projY(s.y)} r={0.35} />))}</g>
    </>
  );
});

function SpatialPitch({ snap, homeId, shirt, kits }: { snap: SpatialSnapshot; homeId: string; shirt: Shirt; kits: { home: ClubKit; away: ClubKit } }) {
  return (
    <div className="w-full">
      <svg viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`} className="block h-auto w-full rounded-md border border-border-strong" style={{ background: "var(--pitch-grass)" }}>
        <PitchMarkings />
        {snap.players.map((p: SpatialPlayerView) => (
          <g key={p.id} style={{ transform: `translate(${projX(p.x)}px, ${projY(p.y)}px)`, transition: "transform 90ms linear" }}>
            <title>{`${shirt(p.id)} · ${POS_SHORT[p.pos]}`}</title>
            <circle r={1.7} fill={(p.teamId === homeId ? kits.home : kits.away).primary} stroke={p.hasBall ? "#fff" : "rgba(0,0,0,0.55)"} strokeWidth={p.hasBall ? 0.55 : 0.3} />
            <text textAnchor="middle" dominantBaseline="central" fontSize={2.5} fontWeight={700} fill={inkOn((p.teamId === homeId ? kits.home : kits.away).primary)}>{shirt(p.id)}</text>
          </g>
        ))}
        {(() => {
          const bx = projX(snap.ball.x), by = projY(snap.ball.y);
          const z = snap.ball.z ?? 0, h = Math.min(z, 14);
          const lift = h * 0.65, grow = 1 + h * 0.06, shadow = 1 - h * 0.03, shadowOpacity = Math.max(0.14, 0.42 - h * 0.02);
          return (
            <>
              <g style={{ transform: `translate(${bx}px, ${by}px)`, transition: "transform 90ms linear" }}>
                <ellipse rx={0.85 * Math.max(shadow, 0.55)} ry={0.5 * Math.max(shadow, 0.55)} fill="#000" opacity={shadowOpacity} />
              </g>
              <g style={{ transform: `translate(${bx}px, ${by - lift}px)`, transition: "transform 90ms linear" }}>
                <circle r={0.85 * grow} fill="#fff" stroke="#04140e" strokeWidth={0.2} />
              </g>
            </>
          );
        })()}
      </svg>
    </div>
  );
}
