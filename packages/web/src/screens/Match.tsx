import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { FastForward, Pause, Play, RotateCcw, Zap } from "lucide-react";
import { Formation, MarkingScheme, Mentality, Position, type Team, type TeamInstructions } from "@fut/domain";
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
import { useApp } from "../app/AppProviders";
import { PageHeader } from "../components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "../components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Slider } from "../components/ui/slider";
import {
  simulateSpatial,
  useSpatialMatch,
  type SpatialController,
  type SpatialReport,
  type Speed,
} from "../hooks/useSpatialMatch";
import { buildClubWith, MY_CLUB, NEXT, shirtOf, teamById } from "../lib/engine/world";
import { cn } from "../lib/utils";

const HOME = MY_CLUB;
const AWAY = teamById(NEXT.awayId)!;

const POS_SHORT: Record<Position, string> = {
  [Position.Goalkeeper]: "GK",
  [Position.CentreBack]: "CB",
  [Position.FullBack]: "FB",
  [Position.WingBack]: "WB",
  [Position.DefensiveMidfielder]: "DM",
  [Position.CentralMidfielder]: "CM",
  [Position.AttackingMidfielder]: "AM",
  [Position.Winger]: "WG",
  [Position.Striker]: "ST",
};

const KEY_EVENTS = new Set<MatchEventType>([
  MatchEventType.Goal,
  MatchEventType.Card,
  MatchEventType.Penalty,
  MatchEventType.HalfTime,
  MatchEventType.FullTime,
]);

type Mode = "pre" | "watch" | "quick";

/** Editable tactic set-up for one side (sliders are 0–100 in the UI). */
interface SideSetup {
  formation: Formation;
  mentality: Mentality;
  lineHeight: number;
  pressing: number;
  width: number;
  directness: number;
  tempo: number;
  marking: MarkingScheme;
}
interface Setup {
  home: SideSetup;
  away: SideSetup;
}

const DEFAULT_SETUP: Setup = {
  home: { formation: Formation.F433, mentality: Mentality.Defensive, lineHeight: 18, pressing: 20, width: 45, directness: 85, tempo: 50, marking: MarkingScheme.Zonal },
  away: { formation: Formation.F442, mentality: Mentality.Attacking, lineHeight: 85, pressing: 92, width: 62, directness: 32, tempo: 62, marking: MarkingScheme.Man },
};

const instr = (s: SideSetup): Partial<TeamInstructions> => ({
  mentality: s.mentality,
  lineHeight: s.lineHeight / 100,
  pressing: s.pressing / 100,
  width: s.width / 100,
  directness: s.directness / 100,
  tempo: s.tempo / 100,
  markingScheme: s.marking,
});

function buildTeams(setup: Setup): { home: Team; away: Team } {
  return {
    home: buildClubWith(HOME.id, { formation: setup.home.formation, instructions: instr(setup.home) }),
    away: buildClubWith(AWAY.id, { formation: setup.away.formation, instructions: instr(setup.away) }),
  };
}

export function Match() {
  const { t, locale } = useApp();
  const [seed, setSeed] = useState(7);
  const [mode, setMode] = useState<Mode>("pre");
  const [setup, setSetup] = useState<Setup>(DEFAULT_SETUP);
  const [teams, setTeams] = useState(() => buildTeams(DEFAULT_SETUP));
  const [quick, setQuick] = useState<SpatialReport | null>(null);
  const live = useSpatialMatch(teams.home, teams.away, seed);

  const startWatch = () => {
    setTeams(buildTeams(setup));
    setMode("watch");
  };
  const startQuick = () => {
    const t2 = buildTeams(setup);
    setTeams(t2);
    setQuick(simulateSpatial(t2.home, t2.away, seed));
    setMode("quick");
  };
  const newMatch = () => {
    setSeed((s) => s + 1);
    setQuick(null);
    setMode("pre");
  };

  const shownResult = mode === "quick" ? quick : live.finished ? live.result : null;

  return (
    <>
      <PageHeader
        kicker={NEXT.competition}
        title={t.matchTitle}
        meta={`${HOME.name} vs ${AWAY.name} · seed ${seed}`}
        action={<Button variant="secondary" onClick={newMatch}><RotateCcw /> {t.newMatch}</Button>}
      />

      {mode === "pre" && (
        <div className="flex flex-col gap-4">
          <Card className="relative overflow-hidden">
            <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-[var(--brand-emerald)] to-[var(--brand-lime)]" />
            <div className="flex flex-wrap items-center justify-between gap-4 p-6">
              <div className="flex items-center gap-6">
                <Crest short={HOME.shortName} name={HOME.name} sm />
                <span className="serif text-xl italic text-fg-faint">vs</span>
                <Crest short={AWAY.shortName} name={AWAY.name} sm />
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={startQuick}><Zap /> {t.quickSim}</Button>
                <Button variant="primary" onClick={startWatch}><Play /> {t.watchMatch}</Button>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TeamSetup title={HOME.name} tone="var(--pos-mid)" side={setup.home} onChange={(s) => setSetup((p) => ({ ...p, home: s }))} t={t} />
            <TeamSetup title={AWAY.name} tone="var(--pos-att)" side={setup.away} onChange={(s) => setSetup((p) => ({ ...p, away: s }))} t={t} />
          </div>
        </div>
      )}

      {shownResult && <MatchReport result={shownResult} locale={locale} t={t} onRewatch={mode === "quick" ? startWatch : undefined} />}

      {mode === "watch" && !live.finished && <LiveView live={live} home={teams.home} away={teams.away} locale={locale} t={t} />}
    </>
  );
}

/* ---------------------------------------------------------- Team setup panel */
const FORMATIONS = Object.values(Formation);
const MENTALITIES: { v: Mentality; label: string }[] = [
  { v: Mentality.VeryDefensive, label: "Very defensive" },
  { v: Mentality.Defensive, label: "Defensive" },
  { v: Mentality.Balanced, label: "Balanced" },
  { v: Mentality.Attacking, label: "Attacking" },
  { v: Mentality.VeryAttacking, label: "Very attacking" },
];
const SLIDERS: { key: keyof SideSetup; labelKey: "lineHeight" | "pressing" | "widthInstr" | "directness" | "tempo" }[] = [
  { key: "lineHeight", labelKey: "lineHeight" },
  { key: "pressing", labelKey: "pressing" },
  { key: "width", labelKey: "widthInstr" },
  { key: "directness", labelKey: "directness" },
  { key: "tempo", labelKey: "tempo" },
];

function TeamSetup({ title, tone, side, onChange, t }: { title: string; tone: string; side: SideSetup; onChange: (s: SideSetup) => void; t: ReturnType<typeof useApp>["t"] }) {
  const set = <K extends keyof SideSetup>(k: K, v: SideSetup[K]) => onChange({ ...side, [k]: v });
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0 pb-3">
        <span className="size-3 rounded-full" style={{ background: tone }} />
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Labeled label={t.formation}>
            <Select value={side.formation} onValueChange={(v) => set("formation", v as Formation)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{FORMATIONS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
            </Select>
          </Labeled>
          <Labeled label={t.mentality}>
            <Select value={side.mentality} onValueChange={(v) => set("mentality", v as Mentality)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{MENTALITIES.map((m) => <SelectItem key={m.v} value={m.v}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </Labeled>
        </div>

        {SLIDERS.map(({ key, labelKey }) => (
          <div key={key}>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="caps text-fg-faint">{t[labelKey]}</span>
              <span className="text-sm font-bold tabular-nums">{side[key] as number}</span>
            </div>
            <Slider value={[side[key] as number]} min={0} max={100} step={1} onValueChange={([v]) => set(key, v! as never)} />
          </div>
        ))}

        <Labeled label={t.marking}>
          <ToggleGroup type="single" value={side.marking} onValueChange={(v) => v && set("marking", v as MarkingScheme)}>
            <ToggleGroupItem value={MarkingScheme.Zonal}>Zonal</ToggleGroupItem>
            <ToggleGroupItem value={MarkingScheme.Man}>Man</ToggleGroupItem>
          </ToggleGroup>
        </Labeled>
      </CardContent>
    </Card>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="caps text-fg-faint">{label}</span>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- Live view */
function LiveView({ live, home, away, locale, t }: { live: SpatialController; home: Team; away: Team; locale: "en" | "pt-BR"; t: ReturnType<typeof useApp>["t"] }) {
  const snap = live.snapshot;
  const cat = getCatalog(locale);
  const ctx = { teamName: (id: string | undefined) => (id === HOME.id ? HOME.name : id === AWAY.id ? AWAY.name : "") };
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
            <span className="serif text-lg font-semibold">{HOME.shortName}</span>
            <span className="serif text-3xl font-bold tabular-nums">{snap.homeScore} : {snap.awayScore}</span>
            <span className="serif text-lg font-semibold">{AWAY.shortName}</span>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={snap.status === "halftime" ? "gold" : "primary"}>
              {snap.status === "halftime" ? "HT" : snap.status === "kickoff" ? "0'" : `${snap.minute}'`}
            </Badge>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon-sm" aria-label="pause/play" onClick={() => live.setSpeed(live.speed === 0 ? 1 : 0)}>
                {live.speed === 0 ? <Play /> : <Pause />}
              </Button>
              <ToggleGroup type="single" value={String(live.speed)} onValueChange={(v) => v && live.setSpeed(Number(v) as Speed)}>
                <ToggleGroupItem value="1">1×</ToggleGroupItem>
                <ToggleGroupItem value="2">2×</ToggleGroupItem>
                <ToggleGroupItem value="4">4×</ToggleGroupItem>
              </ToggleGroup>
              <Button variant="secondary" size="sm" onClick={live.finishNow}><FastForward /> {t.finish}</Button>
            </div>
          </div>
        </div>
      </Card>

      {/* FM-style match day: a team's line-up down each side, the pitch centred
          (~50% width) with stats + timeline stacked beneath it. */}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(190px,1fr)_2.2fr_minmax(190px,1fr)]">
        <LineupColumn team={home} side="home" ballOwnerId={ballOwner} />

        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="relative p-2 sm:p-3">
              <SpatialPitch snap={snap} />
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
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full" style={{ background: e.teamId === HOME.id ? "var(--pos-mid)" : e.teamId === AWAY.id ? "var(--pos-att)" : "var(--text-faint)" }} />
                    <span className="text-sm leading-snug">{e.text}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>

        <LineupColumn team={away} side="away" ballOwnerId={ballOwner} />
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- Lineup column */
function LineupColumn({ team, side, ballOwnerId }: { team: Team; side: "home" | "away"; ballOwnerId?: string }) {
  const color = side === "home" ? "var(--pos-mid)" : "var(--pos-att)";
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
            <div
              key={p.id}
              className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors", onBall && "bg-surface-2", reverse && "flex-row-reverse text-right")}
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-full text-2xs font-bold tabular-nums text-[#04140e]" style={{ background: color }}>
                {shirtOf(p.id)}
              </span>
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

/* --------------------------------------------------------------- Event banner */
type Banner = { key: number; title: string; sub?: string; tone: "goal" | "gold" | "info" | "neutral" };

const teamName = (id?: string) => (id === HOME.id ? HOME.name : id === AWAY.id ? AWAY.name : "");

function bannerFor(e: MatchEvent, i: number, pt: boolean): Banner | null {
  const t = (en: string, ptText: string) => (pt ? ptText : en);
  switch (e.type) {
    case MatchEventType.Goal:
      return { key: i, title: t("GOAL!", "GOL!"), sub: teamName(e.teamId), tone: "goal" };
    case MatchEventType.Penalty:
      return { key: i, title: t("PENALTY", "PÊNALTI"), sub: teamName(e.teamId), tone: "gold" };
    case MatchEventType.Offside:
      return { key: i, title: t("Offside", "Impedimento"), sub: teamName(e.teamId), tone: "neutral" };
    case MatchEventType.Corner:
      return { key: i, title: t("Corner", "Escanteio"), sub: teamName(e.teamId), tone: "info" };
    case MatchEventType.Foul:
      return { key: i, title: t("Foul", "Falta"), sub: teamName(e.teamId), tone: "neutral" };
    case MatchEventType.HalfTime:
      return { key: i, title: t("Half-time", "Intervalo"), tone: "info" };
    case MatchEventType.FullTime:
      return { key: i, title: t("Full-time", "Fim de jogo"), tone: "info" };
    default:
      return null;
  }
}

/** Surface the newest banner-worthy event for a couple of seconds. */
function useEventBanner(events: readonly MatchEvent[], locale: "en" | "pt-BR"): Banner | null {
  const [banner, setBanner] = useState<Banner | null>(null);
  const seen = useRef(0);
  useEffect(() => {
    if (events.length < seen.current) seen.current = 0; // match reset
    for (let i = events.length - 1; i >= seen.current; i--) {
      const b = bannerFor(events[i]!, i, locale === "pt-BR");
      if (b) {
        setBanner(b);
        break;
      }
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

/* ----------------------------------------------------------- Live stats panel */
function LiveStats({ stats, cat }: { stats: { home: TeamStats; away: TeamStats } | null; cat: ReturnType<typeof getCatalog> }) {
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

/* --------------------------------------------------------------- Spatial pitch */
// The pitch is drawn straight from the engine's geometry (metres). A single
// projection maps engine coordinates → SVG user units, and the SAME projection
// places players and the ball, so the display is exactly faithful to the
// engine's coordinates and proportions. Landscape view: home defends the left
// (attacks +x → toward the right), away the right.
const PITCH = pitchGeometry();
const L = PITCH.length; // 105
const W = PITCH.width; // 68
const GD = FIELD.GOAL_DEPTH;
const PAD = 4; // metres of grass margin around the pitch

/** Engine metres → SVG user units (metres). Landscape: x→right, y→down. */
const projX = (x: number, _y: number): number => x;
const projY = (_x: number, y: number): number => y;

/** Project an axis-aligned engine rect to an SVG rect (still axis-aligned). */
function projectRect(r: PitchRect) {
  return { x: r.x, y: r.y, width: r.w, height: r.h };
}

/** Sample an arc into an SVG polyline path in projected coordinates. */
function arcPath(a: PitchArc, steps = 22): string {
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const t = a.a0 + ((a.a1 - a.a0) * i) / steps;
    const ex = a.cx + a.r * Math.cos(t);
    const ey = a.cy + a.r * Math.sin(t);
    d += `${i === 0 ? "M" : "L"}${projX(ex, ey).toFixed(2)} ${projY(ex, ey).toFixed(2)}`;
  }
  return d;
}

const LINE = "var(--pitch-line)";
const STRIPES = 14;
const VB = { x: -(GD + PAD), y: -PAD, w: L + 2 * (GD + PAD), h: W + 2 * PAD };
const ARC_PATHS = PITCH.arcs.map((a) => arcPath(a)); // precomputed once — markings never move

/**
 * Static pitch markings. Memoised with no props so it renders ONCE — the match
 * loop repaints players/ball every frame, and re-drawing the (unchanging)
 * markings + sampled arc paths each frame would swamp the renderer.
 */
const PitchMarkings = memo(function PitchMarkings() {
  return (
    <>
      {Array.from({ length: STRIPES }, (_, i) => (
        <rect
          key={`s${i}`}
          x={(i * L) / STRIPES}
          y={0}
          width={L / STRIPES}
          height={W}
          fill={i % 2 ? "rgba(255,255,255,0.045)" : "rgba(0,0,0,0.05)"}
        />
      ))}
      <g fill="none" stroke={LINE} strokeWidth={0.28} strokeLinecap="round">
        <rect {...projectRect(PITCH.boundary)} />
        {PITCH.lines.map(([a, b], i) => (
          <line key={`l${i}`} x1={projX(a.x, a.y)} y1={projY(a.x, a.y)} x2={projX(b.x, b.y)} y2={projY(b.x, b.y)} />
        ))}
        {PITCH.areas.map((r, i) => (
          <rect key={`a${i}`} {...projectRect(r)} />
        ))}
        {PITCH.circles.map((c, i) => (
          <circle key={`c${i}`} cx={projX(c.c.x, c.c.y)} cy={projY(c.c.x, c.c.y)} r={c.r} />
        ))}
        {ARC_PATHS.map((d, i) => (
          <path key={`arc${i}`} d={d} />
        ))}
        {PITCH.goals.map((r, i) => (
          <rect key={`g${i}`} {...projectRect(r)} fill="rgba(255,255,255,0.07)" />
        ))}
      </g>
      <g fill={LINE}>
        {PITCH.spots.map((s, i) => (
          <circle key={`sp${i}`} cx={projX(s.x, s.y)} cy={projY(s.x, s.y)} r={0.35} />
        ))}
      </g>
    </>
  );
});

function SpatialPitch({ snap }: { snap: SpatialSnapshot }) {
  return (
    <div className="w-full">
      <svg
        viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}
        className="block h-auto w-full rounded-md border border-border-strong"
        style={{ background: "var(--pitch-grass)" }}
      >
        <PitchMarkings />

        {/* Players */}
        {snap.players.map((p: SpatialPlayerView) => (
          <g
            key={p.id}
            style={{ transform: `translate(${projX(p.x, p.y)}px, ${projY(p.x, p.y)}px)`, transition: "transform 90ms linear" }}
          >
            <title>{`${shirtOf(p.id)} · ${POS_SHORT[p.pos]}`}</title>
            <circle
              r={1.7}
              fill={p.teamId === HOME.id ? "var(--pos-mid)" : "var(--pos-att)"}
              stroke={p.hasBall ? "#fff" : "rgba(0,0,0,0.5)"}
              strokeWidth={p.hasBall ? 0.55 : 0.25}
            />
            <text textAnchor="middle" dominantBaseline="central" fontSize={2.5} fontWeight={700} fill="#04140e">
              {shirtOf(p.id)}
            </text>
          </g>
        ))}

        {/* Ball */}
        <g style={{ transform: `translate(${projX(snap.ball.x, snap.ball.y)}px, ${projY(snap.ball.x, snap.ball.y)}px)`, transition: "transform 90ms linear" }}>
          <circle r={0.85} fill="#fff" stroke="#04140e" strokeWidth={0.2} />
        </g>
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------- Match report */
function MatchReport({ result, locale, t, onRewatch }: { result: SpatialReport; locale: "en" | "pt-BR"; t: ReturnType<typeof useApp>["t"]; onRewatch?: () => void }) {
  const cat = getCatalog(locale);
  const ctx = { teamName: (id: string | undefined) => (id === HOME.id ? HOME.name : id === AWAY.id ? AWAY.name : "") };
  const poss = possessionPercent(result.stats.home, result.stats.away);
  const feed = result.timeline
    .filter((e) => KEY_EVENTS.has(e.type))
    .map((e, i) => ({ key: i, minute: e.minute, teamId: e.teamId, text: cat.renderEvent(e, ctx) }))
    .filter((e) => e.text);

  return (
    <div className="flex flex-col gap-4">
      <Card className="relative overflow-hidden">
        <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-[var(--brand-emerald)] to-[var(--brand-lime)]" />
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 p-6">
          <TeamSide name={result.homeTeamName} short={HOME.shortName} align="right" win={result.homeScore > result.awayScore} />
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-baseline gap-3 text-5xl font-bold tabular-nums">
              <span>{result.homeScore}</span><span className="text-fg-faint">:</span><span>{result.awayScore}</span>
            </div>
            <Badge variant="muted">FT</Badge>
          </div>
          <TeamSide name={result.awayTeamName} short={AWAY.shortName} align="left" win={result.awayScore > result.homeScore} />
        </div>
        {onRewatch && (
          <div className="flex justify-center border-t border-hairline p-3">
            <Button variant="ghost" size="sm" onClick={onRewatch}><Play /> {t.watchMatch}</Button>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{cat.phrase("statistics")}</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3.5">
            <StatRow label={cat.label("possession")} home={poss.home} away={poss.away} suffix="%" />
            <StatRow label={cat.label("shots")} home={result.stats.home.shots} away={result.stats.away.shots} />
            <StatRow label={cat.label("shotsOnTarget")} home={result.stats.home.shotsOnTarget} away={result.stats.away.shotsOnTarget} />
            <StatRow label={cat.label("passAccuracy")} home={pa(result, "home")} away={pa(result, "away")} suffix="%" />
            <StatRow label={cat.label("corners")} home={result.stats.home.corners} away={result.stats.away.corners} />
            <StatRow label={cat.label("tackles")} home={result.stats.home.tackles} away={result.stats.away.tackles} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{cat.phrase("timeline")}</CardTitle></CardHeader>
          <CardContent className="flex max-h-[420px] flex-col gap-0 overflow-y-auto p-0">
            {feed.map((e, i) => (
              <div key={e.key} className={cn("flex items-start gap-3 px-4 py-2.5", i < feed.length - 1 && "border-b border-hairline")}>
                <span className="mt-px w-8 shrink-0 text-right text-xs font-bold tabular-nums text-fg-faint">{e.minute}'</span>
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full" style={{ background: e.teamId === HOME.id ? "var(--pos-mid)" : e.teamId === AWAY.id ? "var(--pos-att)" : "var(--text-faint)" }} />
                <span className="text-sm leading-snug">{e.text}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TeamSide({ name, short, align, win }: { name: string; short: string; align: "left" | "right"; win: boolean }) {
  return (
    <div className={cn("flex items-center gap-3", align === "right" && "flex-row-reverse text-right")}>
      <Crest short={short} name={name} sm />
      <div className="min-w-0">
        <div className={cn("serif text-xl font-semibold leading-tight", win && "text-primary")}>{name}</div>
        <div className="text-2xs uppercase tracking-caps text-fg-faint">{short}</div>
      </div>
    </div>
  );
}

function Crest({ short, name, sm }: { short: string; name: string; sm?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className={cn("grid place-items-center rounded-md bg-surface-3 font-display font-bold text-fg", sm ? "size-11 text-lg" : "size-16 text-2xl")}>
        {short[0]}
      </span>
      {!sm && <span className="serif text-xl font-semibold">{name}</span>}
    </div>
  );
}

function StatRow({ label, home, away, suffix = "" }: { label: string; home: number; away: number; suffix?: string }) {
  const total = home + away || 1;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-sm font-semibold tabular-nums">
        <span>{home}{suffix}</span>
        <span className="text-2xs font-semibold uppercase tracking-caps text-fg-faint">{label}</span>
        <span>{away}{suffix}</span>
      </div>
      <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full">
        <div className="rounded-l-full bg-pos-mid" style={{ width: `${Math.round((home / total) * 100)}%` }} />
        <div className="flex-1 rounded-r-full bg-pos-att" />
      </div>
    </div>
  );
}

function pa(r: SpatialReport, side: "home" | "away"): number {
  const s = r.stats[side];
  return s.passes > 0 ? Math.round((s.passesCompleted / s.passes) * 100) : 0;
}
