import { useMemo, useState } from "react";
import { ArrowRightLeft, FastForward, Pause, Play, RotateCcw, Zap } from "lucide-react";
import { MatchRules, Mentality, Position, SubstitutionRules } from "@fut/domain";
import {
  ManualCoachController,
  MatchEventType,
  MatchSimulator,
  possessionPercent,
  type LivePlayer,
  type MatchResult,
} from "@fut/engine";
import { getCatalog } from "@fut/i18n";
import { useApp } from "../app/AppProviders";
import { PageHeader } from "../components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "../components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { useLiveMatch, type Speed } from "../hooks/useLiveMatch";
import { useMatchMotion } from "../hooks/useMatchMotion";
import { MY_CLUB, NEXT, shirtOf, teamById } from "../lib/engine/world";
import { cn } from "../lib/utils";
import { toast } from "sonner";

const HOME = MY_CLUB;
const AWAY = teamById(NEXT.awayId)!;
const sim = new MatchSimulator();

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
  MatchEventType.Substitution,
  MatchEventType.TacticChange,
  MatchEventType.HalfTime,
  MatchEventType.FullTime,
]);

type Mode = "pre" | "watch" | "quick";

export function Match() {
  const { t, locale } = useApp();
  const [seed, setSeed] = useState(7);
  const [mode, setMode] = useState<Mode>("pre");
  const [quick, setQuick] = useState<MatchResult | null>(null);
  const live = useLiveMatch(HOME, AWAY, seed);

  const startWatch = () => { setMode("watch"); };
  const startQuick = () => {
    setQuick(
      sim.simulate({
        home: HOME, away: AWAY, seed,
        matchRules: MatchRules.league(),
        substitutionRules: SubstitutionRules.brasileirao(),
        homeController: new ManualCoachController(),
      }),
    );
    setMode("quick");
  };
  const newMatch = () => { setSeed((s) => s + 1); setQuick(null); setMode("pre"); };

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
        <Card className="relative overflow-hidden">
          <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-[var(--brand-emerald)] to-[var(--brand-lime)]" />
          <div className="flex flex-col items-center gap-6 px-6 py-12 text-center">
            <span className="caps text-primary">{NEXT.competition}</span>
            <div className="flex items-center gap-6">
              <Crest short={HOME.shortName} name={HOME.name} />
              <span className="serif text-2xl italic text-fg-faint">vs</span>
              <Crest short={AWAY.shortName} name={AWAY.name} />
            </div>
            <span className="text-sm text-fg-muted">{NEXT.venue}</span>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={startQuick}><Zap /> {t.quickSim}</Button>
              <Button variant="primary" onClick={startWatch}><Play /> {t.watchMatch}</Button>
            </div>
          </div>
        </Card>
      )}

      {shownResult && <MatchReport result={shownResult} locale={locale} onRewatch={mode === "watch" ? undefined : startWatch} />}

      {mode === "watch" && !live.finished && <LiveView live={live} locale={locale} t={t} />}
    </>
  );
}

/* ---------------------------------------------------------------- Live view */
function LiveView({ live, locale, t }: { live: ReturnType<typeof useLiveMatch>; locale: "en" | "pt-BR"; t: ReturnType<typeof useApp>["t"] }) {
  const snap = live.snapshot;
  const cat = getCatalog(locale);
  const ctx = { teamName: (id: string | undefined) => (id === HOME.id ? HOME.name : id === AWAY.id ? AWAY.name : "") };
  if (!snap) return null;

  const feed = live.events
    .filter((e) => KEY_EVENTS.has(e.type))
    .map((e, i) => ({ key: i, minute: e.minute, teamId: e.teamId, text: cat.renderEvent(e, ctx) }))
    .filter((e) => e.text)
    .slice(-14)
    .reverse();

  return (
    <div className="flex flex-col gap-4">
      {/* Scoreboard + controls */}
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
              {snap.status === "halftime" ? "HT" : `${snap.minute}'`}
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

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card><CardContent><LivePitch players={snap.players} /></CardContent></Card>

        <div className="flex flex-col gap-4">
          <ManagePanel live={live} t={t} />
          <Card>
            <CardHeader><CardTitle>{cat.phrase("timeline")}</CardTitle></CardHeader>
            <CardContent className="flex max-h-[280px] flex-col gap-0 overflow-y-auto p-0">
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
    </div>
  );
}

/* ------------------------------------------------------------- Manage panel */
function ManagePanel({ live, t }: { live: ReturnType<typeof useLiveMatch>; t: ReturnType<typeof useApp>["t"] }) {
  const [outId, setOutId] = useState("");
  const [inId, setInId] = useState("");
  const onPitch = live.onPitch();
  const bench = live.bench();
  const canSub = live.canSubstitute();

  const doSub = () => {
    if (!outId || !inId) return;
    live.substitute(outId, inId);
    const inP = bench.find((b) => b.id === inId);
    const outP = onPitch.find((p) => p.id === outId);
    toast.success(t.substitution, { description: `${inP?.name} ↔ ${outP?.name}` });
    setOutId(""); setInId("");
  };

  return (
    <Card>
      <CardHeader><CardTitle>{t.manage}</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span className="caps text-fg-faint">{t.mentality}</span>
          <ToggleGroup
            type="single"
            defaultValue="balanced"
            onValueChange={(v) => {
              if (!v) return;
              const m = v === "defensive" ? Mentality.Defensive : v === "attacking" ? Mentality.Attacking : Mentality.Balanced;
              live.changeMentality(m);
              toast(t.tacticChange, { description: t.tacticChangeHint });
            }}
            className="w-full"
          >
            <ToggleGroupItem value="defensive" className="flex-1">Def</ToggleGroupItem>
            <ToggleGroupItem value="balanced" className="flex-1">Bal</ToggleGroupItem>
            <ToggleGroupItem value="attacking" className="flex-1">Att</ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="flex flex-col gap-2">
          <span className="caps text-fg-faint">{t.substitution}</span>
          <div className="flex items-center gap-2">
            <Select value={outId} onValueChange={setOutId}>
              <SelectTrigger className="flex-1"><SelectValue placeholder={t.playerOut} /></SelectTrigger>
              <SelectContent>
                {onPitch.map((p) => <SelectItem key={p.id} value={p.id}>{POS_SHORT[p.pos as Position]} · {p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <ArrowRightLeft className="size-4 shrink-0 text-fg-faint" />
            <Select value={inId} onValueChange={setInId}>
              <SelectTrigger className="flex-1"><SelectValue placeholder={t.playerIn} /></SelectTrigger>
              <SelectContent>
                {bench.map((p) => <SelectItem key={p.id} value={p.id}>{POS_SHORT[p.pos as Position]} · {p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button variant="secondary" size="sm" disabled={!canSub || !outId || !inId} onClick={doSub}>
            {canSub ? t.makeSub : t.noSubsLeft}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* --------------------------------------------------------------- Live pitch */
// Inner padding (%) so even edge zones sit comfortably inside the pitch lines.
const FIELD_PAD = 8;
const toField = (v: number) => FIELD_PAD + (v / 100) * (100 - 2 * FIELD_PAD);

function LivePitch({ players }: { players: readonly LivePlayer[] }) {
  const motion = useMatchMotion(players);
  return (
    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-md border border-border-strong [background:repeating-linear-gradient(0deg,color-mix(in_srgb,var(--pitch-grass)_88%,#000)_0_8%,var(--pitch-grass)_8%_16%)]">
      <div className="pointer-events-none absolute inset-3 rounded-[3px] border-2 border-[var(--pitch-line)]">
        <div className="absolute inset-x-0 top-1/2 border-t-2 border-[var(--pitch-line)]" />
        <div className="absolute left-1/2 top-1/2 aspect-square w-[22%] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--pitch-line)]" />
        <div className="absolute left-1/2 top-0 h-[13%] w-[44%] -translate-x-1/2 border-2 border-t-0 border-[var(--pitch-line)]" />
        <div className="absolute bottom-0 left-1/2 h-[13%] w-[44%] -translate-x-1/2 border-2 border-b-0 border-[var(--pitch-line)]" />
      </div>

      {motion.players.map((p) => (
        <div
          key={p.id}
          className="absolute z-10 grid size-[22px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-[10px] font-bold tabular-nums text-[#04140e] will-change-transform"
          style={{
            left: `${toField(p.x)}%`,
            top: `${toField(p.y)}%`,
            background: p.teamId === HOME.id ? "var(--pos-mid)" : "var(--pos-att)",
            boxShadow: "0 1px 3px rgba(0,0,0,0.55)",
          }}
          title={`${shirtOf(p.id)} (${POS_SHORT[p.pos]})`}
        >
          {shirtOf(p.id)}
        </div>
      ))}

      <div
        className="absolute z-20 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#04140e] bg-white will-change-transform"
        style={{ left: `${toField(motion.ball.x)}%`, top: `${toField(motion.ball.y)}%`, boxShadow: "0 0 6px 1px rgba(255,255,255,0.75)" }}
      />
    </div>
  );
}

/* ------------------------------------------------------------- Match report */
function MatchReport({ result, locale, onRewatch }: { result: MatchResult; locale: "en" | "pt-BR"; onRewatch?: () => void }) {
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
            <Button variant="ghost" size="sm" onClick={onRewatch}><Play /> Watch this match</Button>
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
            <StatRow label={cat.label("passAccuracy")} home={acc(result, "home")} away={acc(result, "away")} suffix="%" />
            <StatRow label={cat.label("corners")} home={result.stats.home.corners} away={result.stats.away.corners} />
            <StatRow label={cat.label("fouls")} home={result.stats.home.fouls} away={result.stats.away.fouls} />
            <StatRow label={cat.label("yellowCards")} home={result.stats.home.yellowCards} away={result.stats.away.yellowCards} />
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

function acc(r: MatchResult, side: "home" | "away"): number {
  const s = r.stats[side];
  return s.passes > 0 ? Math.round((s.passesCompleted / s.passes) * 100) : 0;
}
