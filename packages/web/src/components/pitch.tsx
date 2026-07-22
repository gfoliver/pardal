import { cn } from "../lib/utils";
import { groupColorVar } from "../util/pos";
import type { PosGroup } from "../data/demo";

export interface PitchSpot {
  id: number | string;
  x: number; // 0 (left) – 100 (right)
  y: number; // 0 (opponent goal, top) – 100 (own goal, bottom)
  pos: string;
  group: PosGroup;
  name: string;
  title?: string;
}

export function Pitch({
  spots,
  selectedId,
  onSelect,
  editable,
}: {
  spots: PitchSpot[];
  selectedId?: number | string | null;
  onSelect?: (id: number | string) => void;
  editable?: boolean;
}) {
  return (
    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-md border border-border-strong [background:repeating-linear-gradient(0deg,color-mix(in_srgb,var(--pitch-grass)_88%,#000)_0_8%,var(--pitch-grass)_8%_16%)]">
      {/* markings */}
      <div className="pointer-events-none absolute inset-3 rounded-[3px] border-2 border-[var(--pitch-line)]">
        <div className="absolute inset-x-0 top-1/2 border-t-2 border-[var(--pitch-line)]" />
        <div className="absolute left-1/2 top-1/2 aspect-square w-[22%] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--pitch-line)]" />
        <div className="absolute left-1/2 top-0 h-[14%] w-[46%] -translate-x-1/2 border-2 border-t-0 border-[var(--pitch-line)]" />
        <div className="absolute bottom-0 left-1/2 h-[14%] w-[46%] -translate-x-1/2 border-2 border-b-0 border-[var(--pitch-line)]" />
      </div>

      {spots.map((s) => {
        const selected = selectedId === s.id;
        return (
          <button
            key={s.id}
            type="button"
            disabled={!editable}
            onClick={() => editable && onSelect?.(s.id)}
            title={s.title}
            className={cn(
              "absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 border-0 bg-transparent p-0",
              editable && "cursor-pointer",
            )}
            style={{ left: `${s.x}%`, top: `${s.y}%` }}
          >
            <span
              className={cn(
                "grid size-9 place-items-center rounded-md text-2xs font-bold text-[#04140e] shadow-md transition-transform",
                "ring-1 ring-white/70",
                editable && "group-hover:scale-105",
                selected && "outline outline-2 outline-white",
              )}
              style={{ background: groupColorVar(s.group) }}
            >
              {s.pos}
            </span>
            <span className="whitespace-nowrap text-2xs font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.85)]">
              {s.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
