import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "./ui/chart";

const config = {
  value: { label: "Rating", color: "var(--chart-1)" },
} satisfies ChartConfig;

export interface RadarAttrs {
  pace: number;
  shooting: number;
  passing: number;
  defending: number;
  physical: number;
}

/** FIFA-style five-axis attribute radar. Decoupled from any domain type —
 *  callers pass the five summary values directly. */
export function PlayerRadar({ attrs }: { attrs: RadarAttrs }) {
  const data = [
    { axis: "PAC", value: attrs.pace },
    { axis: "SHO", value: attrs.shooting },
    { axis: "PAS", value: attrs.passing },
    { axis: "DEF", value: attrs.defending },
    { axis: "PHY", value: attrs.physical },
  ];

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
