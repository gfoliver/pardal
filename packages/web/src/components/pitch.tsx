import { useRef, useState, type ReactNode } from "react";
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

/**
 * The markings, at real proportions.
 *
 * SVG rather than nested bordered divs, and the reason is the penalty arc: a CSS box cannot draw the
 * sixty-degree slice of a circle that pokes out of the box, so the old pitch simply had no arcs, no
 * six-yard boxes, no spots and no corners — four lines and a circle. Drawn in a 300×400 viewBox that
 * matches the container's own 3:4, so `preserveAspectRatio` keeps every circle round.
 *
 * The distances are the laws of the game scaled onto that box (a 68×105m pitch): a penalty area is
 * 40.32m of 68 wide and 16.5m of 105 deep, the arc is a 9.15m radius off the spot, and so on. Getting
 * these wrong is the difference between a pitch and a diagram of one.
 */
function Markings() {
  return (
    <svg
      viewBox="0 0 300 400"
      className="pointer-events-none absolute inset-0 h-full w-full"
      fill="none"
      stroke="var(--pitch-line)"
      strokeWidth="2"
      aria-hidden
    >
      {/* One shadow under every line, so the paint sits ON the grass instead of floating over it. */}
      <g style={{ filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.45))" }}>
        <rect x="10" y="10" width="280" height="380" rx="1" />
        <line x1="10" y1="200" x2="290" y2="200" />
        <circle cx="150" cy="200" r="38" />
        <circle cx="150" cy="200" r="2.5" fill="var(--pitch-line)" stroke="none" />

        {/* Top half: penalty area, six-yard box, spot, arc, goal. */}
        <rect x="67" y="10" width="166" height="60" />
        <rect x="112" y="10" width="76" height="20" />
        <circle cx="150" cy="50" r="2.5" fill="var(--pitch-line)" stroke="none" />
        <path d="M117.7 70 A 38 38 0 0 0 182.3 70" />
        <rect x="135" y="2" width="30" height="8" />

        {/* Bottom half, mirrored. */}
        <rect x="67" y="330" width="166" height="60" />
        <rect x="112" y="370" width="76" height="20" />
        <circle cx="150" cy="350" r="2.5" fill="var(--pitch-line)" stroke="none" />
        <path d="M117.7 330 A 38 38 0 0 1 182.3 330" />
        <rect x="135" y="390" width="30" height="8" />

        {/* Corners. */}
        <path d="M16 10 A 6 6 0 0 1 10 16" />
        <path d="M284 10 A 6 6 0 0 0 290 16" />
        <path d="M10 384 A 6 6 0 0 1 16 390" />
        <path d="M284 390 A 6 6 0 0 1 290 384" />
      </g>
    </svg>
  );
}

export function Pitch({
  spots,
  selectedId,
  onSelect,
  editable,
  onDropOnSpot,
  onMoveSpot,
  moveMode,
  wrapSpot,
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
  /** Wrap each shirt (e.g. in a context-menu trigger) — see `DataTable.rowWrapper`. */
  wrapSpot?: (spot: PitchSpot, rendered: ReactNode) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  /**
   * The shirt a drag is currently hovering, so the drop target says so before the drop.
   *
   * Without it the gesture was blind: you picked a shirt up, let go over another, and only the result
   * told you which one you had actually hit — on a board where the shirts are 38px and overlap.
   */
  const [dragOver, setDragOver] = useState<number | string | null>(null);

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
      {/* Corner-to-centre falloff, the cheapest thing that stops a flat green rectangle reading as
          paper. Multiply, so it darkens the mown stripes rather than washing a grey film over them. */}
      <div
        className="pointer-events-none absolute inset-0 mix-blend-multiply"
        style={{ background: "radial-gradient(120% 90% at 50% 42%, rgba(255,255,255,0.10) 0%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.38) 100%)" }}
      />
      <Markings />

      {spots.map((s) => {
        const selected = selectedId === s.id;
        const over = dragOver === s.id;
        const spot = (
          <button
            key={s.id}
            type="button"
            disabled={!editable}
            onClick={() => editable && onSelect?.(s.id)}
            onPointerDown={startMove(s.id)}
            draggable={Boolean(editable && onDropOnSpot && !moveMode)}
            onDragStart={(e) => e.dataTransfer.setData("text/plain", String(s.id))}
            onDragOver={(e) => {
              if (!onDropOnSpot) return;
              e.preventDefault();
              setDragOver(s.id);
            }}
            onDragLeave={() => setDragOver((cur) => (cur === s.id ? null : cur))}
            onDragEnd={() => setDragOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(null);
              const from = e.dataTransfer.getData("text/plain");
              if (from) onDropOnSpot?.(from, s.id);
            }}
            className={cn(
              "absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 rounded-md border-0 bg-transparent p-0 transition-transform",
              editable && (moveMode ? "cursor-grab active:cursor-grabbing active:scale-105" : "cursor-pointer hover:scale-105"),
            )}
            style={{ left: `${toLeft(s.x)}%`, top: `${toTop(s.y)}%`, touchAction: moveMode ? "none" : undefined }}
          >
            {s.marker ?? (
              <span
                className={cn(
                  "grid size-9 place-items-center rounded-md text-2xs font-bold text-[var(--text-on-accent)] shadow-md transition-transform",
                  "ring-1 ring-white/70",
                  selected && "outline outline-2 outline-white",
                )}
                style={{ background: groupColorVar(s.group) }}
              >
                {s.pos}
              </span>
            )}
            {s.marker && selected && <span className="pointer-events-none absolute -inset-1 rounded-md outline outline-2 outline-white" />}
            {/* The two drag states are drawn differently on purpose: a dashed halo means "this one can
                be dragged somewhere", a solid accent ring means "let go and it lands HERE". */}
            {moveMode && editable && (
              <span className="pointer-events-none absolute -inset-1.5 rounded-lg border border-dashed border-white/45" />
            )}
            {over && (
              <span className="pointer-events-none absolute -inset-1.5 rounded-lg border-2 border-primary bg-primary-soft" />
            )}
            {/* A nameplate rather than bare text: white-on-grass with a shadow was legible on the dark
                mown stripe and barely so on the light one. The name is truncated to keep shirts from
                overlapping; the tooltip (via `title`) carries the full "name · rating". */}
            <span className="max-w-[84px] truncate rounded-[3px] bg-black/55 px-1 py-px text-2xs font-semibold text-white">
              {s.name}
            </span>
          </button>
        );
        const tipped = s.title ? <Abbrev key={s.id} full={s.title} asChild>{spot}</Abbrev> : spot;
        // The wrapper goes OUTSIDE the tooltip: a context-menu trigger has to own
        // the outermost node to catch the right-click, and both use `asChild`.
        return wrapSpot ? <span key={s.id} className="contents">{wrapSpot(s, tipped)}</span> : tipped;
      })}
    </div>
  );
}
