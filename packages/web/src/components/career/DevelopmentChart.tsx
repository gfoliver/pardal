import type { PlayerSeasonView } from "@fut/career";
import { useApp } from "../../app/AppProviders";
import { EstimateText } from "./Estimate";

/**
 * A player's rating across the seasons he has played, at the fidelity we have earned.
 *
 * Deliberately a step/point plot rather than a smooth curve: development is computed once per season
 * (`progressSeason` runs at the rollover), so there is exactly one real measurement per year.
 * Interpolating between them would draw a line through data that was never sampled.
 *
 * Every season arrives as an `Estimate`, and this draws the uncertainty instead of hiding it: a shaded
 * band between the low and high, the scout's best guess as the line through it, and a figure underneath
 * only where there is no uncertainty left. It used to receive raw rows and print exact ratings for a
 * player nobody had watched — a whole career's numbers on a screen whose every other field said "?".
 *
 * The façade returns nothing at all below the first rung of knowledge, so this component never has to
 * decide whether it is allowed to draw; if it has rows, they are rows we are entitled to.
 */
export function DevelopmentChart({ history }: { history: readonly PlayerSeasonView[] }) {
  const { t } = useApp();
  if (history.length === 0) {
    return <p className="py-6 text-center text-sm text-fg-muted">{t.noHistory}</p>;
  }

  const w = 100;
  const h = 40;
  const pad = 4;
  // Scaled to the BANDS, not to the midpoints, or a wide band would be drawn clipped at the edges.
  const lo = Math.max(0, Math.min(...history.map((s) => s.overall.low)) - 4);
  const hi = Math.min(99, Math.max(...history.map((s) => s.overall.high)) + 4);
  const span = Math.max(1, hi - lo);
  const x = (i: number) => (history.length === 1 ? w / 2 : pad + (i / (history.length - 1)) * (w - pad * 2));
  const y = (v: number) => h - pad - ((v - lo) / span) * (h - pad * 2);

  const mid = history.map((s, i) => `${x(i)},${y(s.overall.mid)}`).join(" ");
  // The band as one closed shape: along the highs, back along the lows.
  const band = [
    ...history.map((s, i) => `${x(i)},${y(s.overall.high)}`),
    ...[...history].reverse().map((s, i) => `${x(history.length - 1 - i)},${y(s.overall.low)}`),
  ].join(" ");
  const uncertain = history.some((s) => !s.overall.exact);

  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full" preserveAspectRatio="none" role="img" aria-label={t.developmentTitle}>
        {uncertain && history.length > 1 && <polygon points={band} fill="var(--primary)" opacity={0.16} />}
        {/* A single season cannot draw a band as a polygon, so it gets a vertical whisker instead. */}
        {uncertain && history.length === 1 && (
          <line x1={x(0)} x2={x(0)} y1={y(history[0]!.overall.high)} y2={y(history[0]!.overall.low)} stroke="var(--primary)" strokeWidth={1.2} opacity={0.4} vectorEffect="non-scaling-stroke" />
        )}
        {history.length > 1 && <polyline points={mid} fill="none" stroke="var(--primary)" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />}
        {history.map((s, i) => (
          <circle key={s.season} cx={x(i)} cy={y(s.overall.mid)} r={1.6} fill="var(--primary)" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div className="flex justify-between text-2xs tabular-nums text-fg-faint">
        {history.map((s) => (
          <span key={s.season} className="flex flex-col items-center gap-0.5">
            {/* `EstimateText` is the one place that decides between a figure and a band, so a chart
                cannot disagree with the attribute panel about what we are allowed to state. */}
            <span className="font-semibold text-fg-muted"><EstimateText e={s.overall} /></span>
            <span>{s.age}y</span>
            <span>{s.appearances}·{s.goals}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
