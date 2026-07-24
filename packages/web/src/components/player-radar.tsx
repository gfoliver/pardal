import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "./ui/chart";

const config = {
  value: { label: "Rating", color: "var(--chart-1)" },
} satisfies ChartConfig;

export interface RadarAxis {
  axis: string;
  value: number;
}

/** Attribute radar over any set of axes. Decoupled from domain types — callers
 *  pass the axis/value pairs directly (5 for FIFA-style, 6 for FootSim-style). */
export function PlayerRadar({ data }: { data: RadarAxis[] }) {
  return (
    <ChartContainer config={config} className="mx-auto aspect-square max-h-[220px] w-full">
      <RadarChart data={data} outerRadius="72%">
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
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
