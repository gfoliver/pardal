import type { PlayerSeason } from "@fut/career";
import { useApp } from "../../app/AppProviders";

/**
 * A player's rating across the seasons he has played for us.
 *
 * Deliberately a step/point plot rather than a smooth curve: development is
 * computed once per season (`progressSeason` runs at the rollover), so there is
 * exactly one real measurement per year. Interpolating between them would draw
 * a line through data that was never sampled.
 */
export function DevelopmentChart({ history }: { history: readonly PlayerSeason[] }) {
  const { t } = useApp();
  if (history.length === 0) {
    return <p className="py-6 text-center text-sm text-fg-muted">{t.noHistory}</p>;
  }

  const w = 100;
  const h = 40;
  const pad = 4;
  const values = history.map((s) => s.overall);
  const lo = Math.max(0, Math.min(...values) - 4);
  const hi = Math.min(99, Math.max(...values) + 4);
  const span = Math.max(1, hi - lo);
  const x = (i: number) => (history.length === 1 ? w / 2 : pad + (i / (history.length - 1)) * (w - pad * 2));
  const y = (v: number) => h - pad - ((v - lo) / span) * (h - pad * 2);

  const points = history.map((s, i) => `${x(i)},${y(s.overall)}`).join(" ");

  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full" preserveAspectRatio="none" role="img" aria-label={t.developmentTitle}>
        {history.length > 1 && <polyline points={points} fill="none" stroke="var(--primary)" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />}
        {history.map((s, i) => (
          <circle key={s.season} cx={x(i)} cy={y(s.overall)} r={1.6} fill="var(--primary)" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div className="flex justify-between text-2xs tabular-nums text-fg-faint">
        {history.map((s) => (
          <span key={s.season} className="flex flex-col items-center gap-0.5">
            <span className="font-semibold text-fg-muted">{s.overall}</span>
            <span>{s.age}y</span>
            <span>{s.appearances}·{s.goals}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
