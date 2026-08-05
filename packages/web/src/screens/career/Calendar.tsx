import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { daysFromCivil, weekday, SEASON_YEAR_DAYS } from "@fut/career";
import { useApp } from "../../app/AppProviders";
import { useCareer } from "../../app/CareerProvider";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { cn } from "../../lib/utils";

const WEEKDAYS: Record<string, string[]> = {
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  "pt-BR": ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"],
};

interface Cell {
  hasUser: boolean;
  opp?: string;
  venue?: "H" | "A";
  result?: string;
  win?: boolean | null;
  aiCount: number;
}

export function Calendar() {
  const { t, locale } = useApp();
  const { career } = useCareer();
  if (!career) return null;
  const snap = career.snapshot();
  const managed = snap.managedClubId;
  const season = snap.currentDate.season;
  const startEpoch = career.startEpochDay;
  const todayEpoch = startEpoch + season * SEASON_YEAR_DAYS + snap.currentDate.dayOfSeason;
  const todayCivil = career.civilDate();

  const [ym, setYm] = useState<{ year: number; month: number }>({ year: todayCivil.year, month: todayCivil.month });

  // Fixtures of the CURRENT season, keyed by real epoch day.
  const byEpoch = new Map<number, Cell>();
  for (const comp of snap.competitions) {
    const resultByKey = new Map<string, { hs: number; as: number }>();
    for (const r of comp.results) resultByKey.set(`${r.round}:${r.homeTeamId}:${r.awayTeamId}`, { hs: r.homeScore, as: r.awayScore });
    for (const f of comp.fixtures) {
      const epoch = startEpoch + season * SEASON_YEAR_DAYS + f.day;
      const cell = byEpoch.get(epoch) ?? { hasUser: false, aiCount: 0 };
      const res = resultByKey.get(`${f.round}:${f.homeTeamId}:${f.awayTeamId}`);
      if (f.homeTeamId === managed || f.awayTeamId === managed) {
        const home = f.homeTeamId === managed;
        cell.hasUser = true;
        cell.opp = snap.clubs[home ? f.awayTeamId : f.homeTeamId]?.shortName;
        cell.venue = home ? "H" : "A";
        if (res) {
          cell.result = `${res.hs}–${res.as}`;
          const my = home ? res.hs : res.as, other = home ? res.as : res.hs;
          cell.win = my === other ? null : my > other;
        }
      } else cell.aiCount += 1;
      byEpoch.set(epoch, cell);
    }
  }

  const firstEpoch = daysFromCivil(ym.year, ym.month, 1);
  const nextMonth = ym.month === 12 ? { year: ym.year + 1, month: 1 } : { year: ym.year, month: ym.month + 1 };
  const daysInMonth = daysFromCivil(nextMonth.year, nextMonth.month, 1) - firstEpoch;
  const lead = weekday(firstEpoch);
  const prev = () => setYm(ym.month === 1 ? { year: ym.year - 1, month: 12 } : { year: ym.year, month: ym.month - 1 });
  const next = () => setYm(ym.month === 12 ? { year: ym.year + 1, month: 1 } : { year: ym.year, month: ym.month + 1 });

  return (
    <div className="flex flex-col gap-6">
      {/* Wraps, and the month label is sized by its content.
          `w-40` was a fixed 160px, so the title and the navigator together needed 370px and a 320px
          phone scrolled sideways to reach the "next month" arrow. A minimum keeps the label from
          jumping about as the month name changes length, which is what the fixed width was for. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t.calendar}</h1>
        <div className="flex items-center gap-2">
          <Button size="icon-sm" variant="ghost" onClick={prev}><ChevronLeft /></Button>
          <span className="min-w-[8.5rem] text-center text-sm font-semibold capitalize">{new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(ym.year, ym.month - 1, 1)))}</span>
          <Button size="icon-sm" variant="ghost" onClick={next}><ChevronRight /></Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-3">
          <div className="mb-1.5 grid grid-cols-7 gap-1.5">
            {(WEEKDAYS[locale] ?? WEEKDAYS.en)!.map((d) => (
              <div key={d} className="text-center text-2xs font-bold uppercase tracking-caps text-fg-faint">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: lead }, (_, i) => <div key={`b${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const epoch = firstEpoch + i;
              const cell = byEpoch.get(epoch);
              const isToday = epoch === todayEpoch;
              const upcoming = cell?.hasUser && !cell.result && epoch >= todayEpoch;
              return (
                <div key={day} className={cn("flex min-h-[64px] flex-col rounded-md border p-1.5 text-xs", "border-hairline", isToday && "ring-1 ring-primary", cell?.hasUser && "bg-surface-2")}>
                  <span className={cn("text-2xs tabular-nums", isToday ? "font-bold text-primary" : "text-fg-faint")}>{day}</span>
                  {cell?.hasUser ? (
                    <div className="mt-auto flex flex-col">
                      <span className={cn("font-semibold", upcoming && "text-primary")}>{cell.venue === "A" ? "@" : "v"} {cell.opp}</span>
                      {cell.result && <span className={cn("tabular-nums", cell.win === true ? "text-[var(--pos-mid)]" : cell.win === false ? "text-danger" : "text-fg-muted")}>{cell.result}</span>}
                    </div>
                  ) : cell?.aiCount ? (
                    <span className="mt-auto text-2xs text-fg-faint">•</span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
