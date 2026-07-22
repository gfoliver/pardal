import { cn } from "../../lib/utils";
import { tierColor, tierTint } from "../../lib/ratings";

/* ---- Overall badge (FM-style, grounded in a coloured box) ----------------- */
export function Overall({ value, size = "default" }: { value: number; size?: "sm" | "default" }) {
  const color = tierColor(value);
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-sm font-bold tnum tabular-nums leading-none",
        size === "sm" ? "h-6 min-w-[26px] px-1 text-xs" : "h-7 min-w-[30px] px-1.5 text-sm",
      )}
      style={{ background: tierTint(value, 18), color, boxShadow: `inset 0 0 0 1px ${tierTint(value, 55)}` }}
    >
      {value}
    </span>
  );
}

/* ---- Attribute value cell (subtle tier tint, cohesive across a row) ------- */
export function Attr({ value }: { value: number }) {
  return (
    <span
      className="inline-flex h-6 w-7 items-center justify-center rounded-sm text-xs font-semibold tabular-nums"
      style={{ background: tierTint(value, 13), color: tierColor(value) }}
    >
      {value}
    </span>
  );
}

/* ---- Stat block (big tabular number + caps caption) ----------------------- */
export function Stat({
  value,
  label,
  color,
  className,
}: {
  value: React.ReactNode;
  label: string;
  color?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="text-2xl font-bold leading-none tracking-tight tabular-nums" style={color ? { color } : undefined}>
        {value}
      </span>
      <span className="caps text-fg-faint">{label}</span>
    </div>
  );
}
