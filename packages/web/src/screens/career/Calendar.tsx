import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useApp } from "../../app/AppProviders";
import { useCareer } from "../../app/CareerProvider";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { cn } from "../../lib/utils";

const DAYS_PER_MONTH = 30;

interface DayCell {
  hasUser: boolean;
  opp?: string;
  venue?: "H" | "A";
  result?: string;
  win?: boolean | null;
  aiCount: number;
}

export function Calendar() {
  const { t } = useApp();
  const { career } = useCareer();
  if (!career) return null;
  const snap = career.snapshot();
  const managed = snap.managedClubId;
  const today = snap.currentDate.dayOfSeason;
  const months = Math.max(1, Math.ceil(snap.totalDays / DAYS_PER_MONTH));
  const [month, setMonth] = useState(Math.floor(today / DAYS_PER_MONTH));

  // Build a per-day view from every competition's dated fixtures + results.
  const byDay = new Map<number, DayCell>();
  for (const comp of snap.competitions) {
    const resultByKey = new Map<string, { hs: number; as: number }>();
    for (const r of comp.results) resultByKey.set(`${r.round}:${r.homeTeamId}:${r.awayTeamId}`, { hs: r.homeScore, as: r.awayScore });
    for (const f of comp.fixtures) {
      const cell = byDay.get(f.day) ?? { hasUser: false, aiCount: 0 };
      const res = resultByKey.get(`${f.round}:${f.homeTeamId}:${f.awayTeamId}`);
      if (f.homeTeamId === managed || f.awayTeamId === managed) {
        const home = f.homeTeamId === managed;
        cell.hasUser = true;
        cell.opp = snap.clubs[home ? f.awayTeamId : f.homeTeamId]?.shortName;
        cell.venue = home ? "H" : "A";
        if (res) {
          cell.result = `${res.hs}–${res.as}`;
          const my = home ? res.hs : res.as;
          const other = home ? res.as : res.hs;
          cell.win = my === other ? null : my > other;
        }
      } else {
        cell.aiCount += 1;
      }
      byDay.set(f.day, cell);
    }
  }

  const start = month * DAYS_PER_MONTH;
  const cells = Array.from({ length: DAYS_PER_MONTH }, (_, i) => start + i);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t.calendar}</h1>
        <div className="flex items-center gap-2">
          <Button size="icon-sm" variant="ghost" disabled={month === 0} onClick={() => setMonth((m) => m - 1)}><ChevronLeft /></Button>
          <span className="w-24 text-center text-sm font-semibold tabular-nums">{t.calendar} {month + 1}/{months}</span>
          <Button size="icon-sm" variant="ghost" disabled={month >= months - 1} onClick={() => setMonth((m) => m + 1)}><ChevronRight /></Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-3">
          <div className="grid grid-cols-7 gap-1.5">
            {cells.map((day) => {
              const cell = byDay.get(day);
              const isToday = day === today;
              const upcomingUser = cell?.hasUser && !cell.result && day >= today;
              return (
                <div
                  key={day}
                  className={cn(
                    "flex min-h-[68px] flex-col rounded-md border p-1.5 text-xs",
                    day >= snap.totalDays ? "border-transparent opacity-30" : "border-hairline",
                    isToday && "ring-1 ring-primary",
                    cell?.hasUser ? "bg-surface-2" : "",
                  )}
                >
                  <span className="text-2xs text-fg-faint tabular-nums">{day + 1}</span>
                  {cell?.hasUser ? (
                    <div className="mt-auto flex flex-col">
                      <span className={cn("font-semibold", upcomingUser && "text-primary")}>
                        {cell.venue === "A" ? "@" : "v"} {cell.opp}
                      </span>
                      {cell.result && (
                        <span className={cn("tabular-nums", cell.win === true ? "text-[var(--pos-mid)]" : cell.win === false ? "text-danger" : "text-fg-muted")}>
                          {cell.result}
                        </span>
                      )}
                    </div>
                  ) : cell?.aiCount ? (
                    <span className="mt-auto text-2xs text-fg-faint">• {cell.aiCount}</span>
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
