import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "./ui/chart";
import type { DemoPlayer } from "../data/demo";

const config = {
  value: { label: "Rating", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function PlayerRadar({ player }: { player: DemoPlayer }) {
  const data = [
    { axis: "PAC", value: player.attrs.pace },
    { axis: "SHO", value: player.attrs.shooting },
    { axis: "PAS", value: player.attrs.passing },
    { axis: "DEF", value: player.attrs.defending },
    { axis: "PHY", value: player.attrs.physical },
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
