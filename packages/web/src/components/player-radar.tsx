import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "./ui/chart";

const config = {
  value: { label: "Rating", color: "var(--chart-1)" },
} satisfies ChartConfig;

export interface RadarAxis {
  axis: string;
  /** The best guess. The SHAPE is drawn from these. */
  value: number;
  /**
   * The band around the guess, when there is one.
   *
   * Both absent means the value is certain and may be stated as a figure. Present means the hover shows a
   * RANGE — the shape can be a single line through the midpoints without the tooltip pretending each one
   * was measured. Drawing the guess and reading out the guess are different claims, and only the second
   * one was a lie.
   */
  low?: number;
  high?: number;
}

/**
 * The hover: which axis, and what we can honestly say about it.
 *
 * A whole custom `content` rather than a `formatter` on the shared `ChartTooltipContent`, and the reason
 * is a silent failure mode. That component only calls a formatter when `item.value !== undefined &&
 * item.name` — and if the name were ever empty it would fall through to its own default, which prints
 * `item.value.toLocaleString()`. That default is exactly the bug being fixed: the midpoint, stated as a
 * measurement. A formatter that can be skipped is a fix that can be skipped, so there is nothing to skip.
 */
function AxisTooltip({ active, payload }: { active?: boolean; payload?: readonly { payload?: RadarAxis }[] }) {
  const point = active ? payload?.[0]?.payload : undefined;
  if (!point) return null;
  const r = (n: number) => Math.round(n);
  // A band only counts as one once it is wider than the rounding, or "72–72" would be a figure wearing a
  // range's clothes.
  const banded = point.low !== undefined && point.high !== undefined && r(point.high) > r(point.low);
  return (
    <div className="flex items-center gap-3 rounded-md border border-border-strong bg-elevated px-2.5 py-1.5 text-xs shadow-lg">
      {/* Named, because "62–78" alone is a number floating with no idea which axis it belongs to. */}
      <span className="font-medium text-fg">{point.axis}</span>
      <span className="tabular-nums text-fg-muted">
        {banded ? `${r(point.low!)}–${r(point.high!)}` : r(point.value)}
      </span>
    </div>
  );
}

/** Attribute radar over any set of axes. Decoupled from domain types — callers
 *  pass the axis/value pairs directly (5 for FIFA-style, 6 for FootSim-style). */
export function PlayerRadar({ data }: { data: RadarAxis[] }) {
  return (
    <ChartContainer config={config} className="mx-auto aspect-square max-h-[220px] w-full">
      <RadarChart data={data} outerRadius="72%">
        <ChartTooltip cursor={false} content={<AxisTooltip />} />
        <PolarGrid gridType="polygon" className="stroke-border" />
        <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11, fontWeight: 600 }} />
        <PolarRadiusAxis domain={[0, 99]} tick={false} axisLine={false} tickCount={4} />
        <Radar
          dataKey="value"
          stroke="var(--color-value)"
          fill="var(--color-value)"
          fillOpacity={0.35}
          strokeWidth={2}
          dot={{ r: 2.5, fillOpacity: 1 }}
        />
      </RadarChart>
    </ChartContainer>
  );
}
