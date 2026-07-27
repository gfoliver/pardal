import { useRef, type ReactNode } from "react";
import { Abbrev } from "./ui/abbrev";
import { cn } from "../lib/utils";
import { groupColorVar } from "../util/pos";
import type { PosGroup } from "../lib/engine/world";

export interface PitchSpot {
  id: number | string;
  x: number; // 0 (left) – 100 (right)
  y: number; // 0 (opponent goal, top) – 100 (own goal, bottom)
  pos: string;
  group: PosGroup;
  name: string;
  title?: string;
  /** Optional custom marker (e.g. a TeamShirt) drawn instead of the pos chip. */
  marker?: ReactNode;
}

/** Percent inset of the plot area on each axis (keeps labels off the touchline). */
const PLOT_X = 9;
const PLOT_Y = 7;

const toLeft = (x: number) => PLOT_X + (x / 100) * (100 - PLOT_X * 2);
const toTop = (y: number) => PLOT_Y + (y / 100) * (100 - PLOT_Y * 2);
/** Inverse of the plot transform: client fraction → spot coordinate (0–100). */
const fromLeft = (f: number) => ((f * 100 - PLOT_X) / (100 - PLOT_X * 2)) * 100;
const fromTop = (f: number) => ((f * 100 - PLOT_Y) / (100 - PLOT_Y * 2)) * 100;
const clamp = (v: number) => Math.max(0, Math.min(100, v));

export function Pitch({
  spots,
  selectedId,
  onSelect,
  editable,
  onDropOnSpot,
  onMoveSpot,
  moveMode,
}: {
  spots: PitchSpot[];
  selectedId?: number | string | null;
  onSelect?: (id: number | string) => void;
  editable?: boolean;
  /** Drag a spot (or an external draggable) onto another spot: swap/assign. */
  onDropOnSpot?: (fromId: string, toId: number | string) => void;
  /** Drag a spot to a new pitch coordinate (0–100 each axis). */
  onMoveSpot?: (id: number | string, x: number, y: number) => void;
  /** When true, dragging repositions the slot instead of swapping players. */
  moveMode?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  /** Pointer-drag a slot to new coordinates (works with mouse + touch). */
  const startMove = (id: number | string) => (e: React.PointerEvent) => {
    if (!moveMode || !onMoveSpot || !ref.current) return;
    e.preventDefault();
    const box = ref.current.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      onMoveSpot(id, clamp(fromLeft((ev.clientX - box.left) / box.width)), clamp(fromTop((ev.clientY - box.top) / box.height)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      ref={ref}
      className="relative aspect-[3/4] w-full overflow-hidden rounded-md border border-border-strong [background:repeating-linear-gradient(0deg,color-mix(in_srgb,var(--pitch-grass)_88%,#000)_0_8%,var(--pitch-grass)_8%_16%)]"
    >
      {/* markings */}
      <div className="pointer-events-none absolute inset-3 rounded-[3px] border-2 border-[var(--pitch-line)]">
        <div className="absolute inset-x-0 top-1/2 border-t-2 border-[var(--pitch-line)]" />
        <div className="absolute left-1/2 top-1/2 aspect-square w-[22%] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--pitch-line)]" />
        <div className="absolute left-1/2 top-0 h-[14%] w-[46%] -translate-x-1/2 border-2 border-t-0 border-[var(--pitch-line)]" />
        <div className="absolute bottom-0 left-1/2 h-[14%] w-[46%] -translate-x-1/2 border-2 border-b-0 border-[var(--pitch-line)]" />
      </div>

      {spots.map((s) => {
        const selected = selectedId === s.id;
        const spot = (
          <button
            key={s.id}
            type="button"
            disabled={!editable}
            onClick={() => editable && onSelect?.(s.id)}
            onPointerDown={startMove(s.id)}
            draggable={Boolean(editable && onDropOnSpot && !moveMode)}
            onDragStart={(e) => e.dataTransfer.setData("text/plain", String(s.id))}
            onDragOver={(e) => onDropOnSpot && e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const from = e.dataTransfer.getData("text/plain");
              if (from) onDropOnSpot?.(from, s.id);
            }}
            className={cn(
              "absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 border-0 bg-transparent p-0",
              editable && (moveMode ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"),
            )}
            style={{ left: `${toLeft(s.x)}%`, top: `${toTop(s.y)}%`, touchAction: moveMode ? "none" : undefined }}
          >
            {s.marker ?? (
              <span
                className={cn(
                  "grid size-9 place-items-center rounded-md text-2xs font-bold text-[#04140e] shadow-md transition-transform",
                  "ring-1 ring-white/70",
                  selected && "outline outline-2 outline-white",
                )}
                style={{ background: groupColorVar(s.group) }}
              >
                {s.pos}
              </span>
            )}
            {s.marker && selected && <span className="pointer-events-none absolute -inset-1 rounded-md outline outline-2 outline-white" />}
            {/* The name is truncated to keep shirts from overlapping; the tooltip
                (via `title`) carries the full "name · rating". */}
            <span className="max-w-[84px] truncate text-2xs font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.85)]">
              {s.name}
            </span>
          </button>
        );
        return s.title ? <Abbrev key={s.id} full={s.title} asChild>{spot}</Abbrev> : spot;
      })}
    </div>
  );
}
