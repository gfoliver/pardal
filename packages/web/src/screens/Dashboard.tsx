import { FastForward, Play } from "lucide-react";
import { useApp } from "../app/AppProviders";
import { PageHeader } from "../components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Avatar } from "../components/ui/avatar";
import { Overall, Stat } from "../components/ui/game";
import { Separator } from "../components/ui/separator";
import { MY_FORM, NEXT, MY_SQUAD, STANDINGS } from "../lib/engine/world";
import { groupColorVar } from "../util/pos";
import type { ScreenId } from "../layout/Shell";

const FORM_STYLE: Record<string, string> = {
  W: "bg-[color-mix(in_srgb,var(--brand-emerald)_90%,#000)] text-[#04140e]",
  D: "bg-gold text-[#04140e]",
  L: "bg-danger text-white",
};

export function Dashboard({ onNavigate }: { onNavigate: (s: ScreenId) => void }) {
  const { t } = useApp();
  const top = [...MY_SQUAD].sort((a, b) => b.overall - a.overall).slice(0, 5);
  const you = STANDINGS.find((r) => r.isYou)!;

  return (
    <>
      <PageHeader kicker={NEXT.home} title={t.dashboard} meta={NEXT.competition} />

      {/* Matchday hero */}
      <Card className="relative mb-4 overflow-hidden">
        <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-[var(--brand-emerald)] to-[var(--brand-lime)]" />
        <div
          className="absolute inset-0 opacity-60"
          style={{ background: "radial-gradient(80% 120% at 100% 0%, var(--primary-soft), transparent 55%)" }}
        />
        <div className="relative flex flex-wrap items-center justify-between gap-6 p-6">
          <div className="flex flex-col gap-4">
            <span className="caps text-primary">{t.nextMatch}</span>
            <div className="flex items-center gap-6">
              <div className="flex flex-col gap-1">
                <span className="caps text-fg-faint">{t.home}</span>
                <span className="serif text-3xl font-semibold leading-none">{NEXT.home}</span>
              </div>
              <span className="serif text-xl italic text-fg-faint">vs</span>
              <div className="flex flex-col gap-1">
                <span className="caps text-fg-faint">{t.away}</span>
                <span className="serif text-3xl font-semibold leading-none">{NEXT.away}</span>
              </div>
            </div>
            <span className="text-sm text-fg-muted">{NEXT.venue}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => onNavigate("match")}>
              <FastForward /> {t.quickSim}
            </Button>
            <Button variant="primary" onClick={() => onNavigate("match")}>
              <Play /> {t.play}
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {/* Form */}
        <Card>
          <CardHeader><CardTitle>{t.form}</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-1.5">
                {MY_FORM.map((r, i) => (
                  <span
                    key={i}
                    className={`grid size-8 place-items-center rounded-sm text-sm font-bold tabular-nums ${FORM_STYLE[r]}`}
                  >
                    {t[r === "W" ? "won" : r === "D" ? "drawn" : "lost"]}
                  </span>
                ))}
              </div>
              <Stat value={`${you.pos}${ordinal(you.pos)}`} label={t.leaguePosition} />
            </div>
            <Separator />
            <div className="flex items-center gap-8">
              <Stat value={you.pts} label={t.points} />
              <Stat value={`+${you.gf - you.ga}`} label="GD" color="var(--brand-emerald)" />
              <Stat value={you.played} label="Played" />
            </div>
          </CardContent>
        </Card>

        {/* League position */}
        <Card>
          <CardHeader action={<Button size="sm" variant="ghost" onClick={() => onNavigate("league")}>{t.viewAll}</Button>}>
            <CardTitle>{t.leaguePosition}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <tbody>
                {STANDINGS.slice(0, 5).map((r) => (
                  <tr key={r.pos} className={cn2(r.isYou)}>
                    <td className="w-9 px-4 py-2 text-center font-semibold tabular-nums text-fg-faint">{r.pos}</td>
                    <td className={`px-1 py-2 ${r.isYou ? "font-semibold text-fg" : "text-fg-muted"}`}>{r.team}</td>
                    <td className="w-12 px-4 py-2 text-right text-base font-bold tabular-nums">{r.pts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Top performers */}
        <Card>
          <CardHeader action={<Button size="sm" variant="ghost" onClick={() => onNavigate("squad")}>{t.viewAll}</Button>}>
            <CardTitle>{t.topPerformers}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {top.map((p, i) => (
              <div
                key={p.id}
                className={`flex items-center gap-3 px-4 py-2.5 ${i < top.length - 1 ? "border-b border-hairline" : ""}`}
              >
                <Avatar name={p.name} tone={groupColorVar(p.group)} size="sm" />
                <div className="min-w-0 leading-tight">
                  <div className="serif text-base font-semibold">{p.name}</div>
                  <div className="text-2xs text-fg-faint">{p.role}</div>
                </div>
                <span className="ml-auto"><Overall value={p.overall} size="sm" /></span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Squad overview */}
        <Card>
          <CardHeader action={<Button size="sm" variant="ghost" onClick={() => onNavigate("squad")}>{t.viewAll}</Button>}>
            <CardTitle>{t.squadOverview}</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            {(["GK", "DEF", "MID", "ATT"] as const).map((g) => {
              const members = MY_SQUAD.filter((s) => s.group === g);
              const avg = Math.round(members.reduce((a, b) => a + b.overall, 0) / members.length);
              return <Stat key={g} value={avg} label={`${g} · ${members.length}`} color={groupColorVar(g)} />;
            })}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function cn2(isYou?: boolean): string {
  return isYou
    ? "bg-primary-soft"
    : "border-t border-hairline first:border-t-0";
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] ?? s[v] ?? s[0]!;
}
