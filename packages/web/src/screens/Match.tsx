import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { MatchRules, SubstitutionRules } from "@fut/domain";
import { MatchEventType, MatchSimulator, possessionPercent, type MatchResult } from "@fut/engine";
import { getCatalog, type StatKey } from "@fut/i18n";
import { useApp } from "../app/AppProviders";
import { PageHeader } from "../components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { MY_CLUB, NEXT, teamById } from "../lib/engine/world";

const sim = new MatchSimulator();
const HOME = MY_CLUB;
const AWAY = teamById(NEXT.awayId)!;

const KEY_EVENTS = new Set<MatchEventType>([
  MatchEventType.Goal,
  MatchEventType.Card,
  MatchEventType.Penalty,
  MatchEventType.Substitution,
  MatchEventType.HalfTime,
  MatchEventType.FullTime,
]);

export function Match() {
  const { t, locale } = useApp();
  const [seed, setSeed] = useState(7);

  // Deterministic: the same seed always yields the same match. Locale is NOT a
  // dependency — switching language re-renders the narration, never re-simulates.
  const result = useMemo<MatchResult>(
    () =>
      sim.simulate({
        home: HOME,
        away: AWAY,
        seed,
        matchRules: MatchRules.league(),
        substitutionRules: SubstitutionRules.brasileirao(),
      }),
    [seed],
  );

  const cat = getCatalog(locale);
  const ctx = { teamName: (id: string | undefined) => (id === HOME.id ? HOME.name : id === AWAY.id ? AWAY.name : "") };
  const poss = possessionPercent(result.stats.home, result.stats.away);

  const narrated = result.timeline
    .filter((e) => KEY_EVENTS.has(e.type))
    .map((e, i) => ({ key: i, minute: e.minute, teamId: e.teamId, text: cat.renderEvent(e, ctx) }))
    .filter((e) => e.text);

  return (
    <>
      <PageHeader
        kicker={NEXT.competition}
        title={t.matchTitle}
        meta={`${t.matchSubtitle} · seed ${seed}`}
        action={
          <Button variant="secondary" onClick={() => setSeed((s) => s + 1)}>
            <RotateCcw /> {t.play}
          </Button>
        }
      />

      {/* Scoreboard */}
      <Card className="relative mb-4 overflow-hidden">
        <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-[var(--brand-emerald)] to-[var(--brand-lime)]" />
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 p-6">
          <TeamSide name={HOME.name} short={HOME.shortName} align="right" win={result.homeScore > result.awayScore} />
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-baseline gap-3 text-5xl font-bold tabular-nums">
              <span>{result.homeScore}</span>
              <span className="text-fg-faint">:</span>
              <span>{result.awayScore}</span>
            </div>
            <Badge variant="muted">FT</Badge>
          </div>
          <TeamSide name={AWAY.name} short={AWAY.shortName} align="left" win={result.awayScore > result.homeScore} />
        </div>
      </Card>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {/* Stats */}
        <Card>
          <CardHeader><CardTitle>{cat.phrase("statistics")}</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3.5">
            <StatRow label={cat.label("possession")} home={poss.home} away={poss.away} suffix="%" />
            <StatRow label={cat.label("shots")} home={result.stats.home.shots} away={result.stats.away.shots} />
            <StatRow label={cat.label("shotsOnTarget")} home={result.stats.home.shotsOnTarget} away={result.stats.away.shotsOnTarget} />
            <StatRow label={cat.label("passAccuracy")} home={passAcc(result, "home")} away={passAcc(result, "away")} suffix="%" />
            <StatRow label={cat.label("corners")} home={result.stats.home.corners} away={result.stats.away.corners} />
            <StatRow label={cat.label("fouls")} home={result.stats.home.fouls} away={result.stats.away.fouls} />
            <StatRow label={cat.label("yellowCards")} home={result.stats.home.yellowCards} away={result.stats.away.yellowCards} />
          </CardContent>
        </Card>

        {/* Timeline */}
        <Card>
          <CardHeader><CardTitle>{cat.phrase("timeline")}</CardTitle></CardHeader>
          <CardContent className="flex max-h-[420px] flex-col gap-0 overflow-y-auto p-0">
            {narrated.map((e, i) => (
              <div
                key={e.key}
                className={`flex items-start gap-3 px-4 py-2.5 ${i < narrated.length - 1 ? "border-b border-hairline" : ""}`}
              >
                <span className="mt-px w-8 shrink-0 text-right text-xs font-bold tabular-nums text-fg-faint">
                  {e.minute}'
                </span>
                <span
                  className="mt-1.5 size-1.5 shrink-0 rounded-full"
                  style={{ background: e.teamId === HOME.id ? "var(--pos-mid)" : e.teamId === AWAY.id ? "var(--pos-att)" : "var(--text-faint)" }}
                />
                <span className="text-sm leading-snug">{e.text}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function TeamSide({ name, short, align, win }: { name: string; short: string; align: "left" | "right"; win: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <span className="grid size-11 shrink-0 place-items-center rounded-md bg-surface-3 font-display text-lg font-bold text-fg">
        {short[0]}
      </span>
      <div className="min-w-0">
        <div className={`serif text-xl font-semibold leading-tight ${win ? "text-primary" : ""}`}>{name}</div>
        <div className="text-2xs uppercase tracking-caps text-fg-faint">{short}</div>
      </div>
    </div>
  );
}

function StatRow({ label, home, away, suffix = "" }: { label: string; home: number; away: number; suffix?: string }) {
  const total = home + away || 1;
  const homePct = Math.round((home / total) * 100);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-sm font-semibold tabular-nums">
        <span>{home}{suffix}</span>
        <span className="text-2xs font-semibold uppercase tracking-caps text-fg-faint">{label}</span>
        <span>{away}{suffix}</span>
      </div>
      <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full">
        <div className="rounded-l-full bg-pos-mid" style={{ width: `${homePct}%` }} />
        <div className="flex-1 rounded-r-full bg-pos-att" />
      </div>
    </div>
  );
}

function passAcc(r: MatchResult, side: "home" | "away"): number {
  const s = r.stats[side];
  return s.passes > 0 ? Math.round((s.passesCompleted / s.passes) * 100) : 0;
}
