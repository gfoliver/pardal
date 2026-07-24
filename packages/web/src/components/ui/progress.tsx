import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "../../lib/utils";

export type MeterTone = "auto" | "good" | "warn" | "bad" | "neutral";

export interface MeterProps {
  value: number;
  max?: number;
  /** "auto" colours by fill ratio (bad→warn→good). */
  tone?: MeterTone;
  label?: string;
  className?: string;
}

const TONE: Record<Exclude<MeterTone, "auto">, string> = {
  good: "bg-[var(--pos-mid)]",
  warn: "bg-gold",
  bad: "bg-danger",
  neutral: "bg-primary",
};

function autoTone(ratio: number): keyof typeof TONE {
  if (ratio >= 0.66) return "good";
  if (ratio >= 0.33) return "warn";
  return "bad";
}

/** A thin labelled progress/meter bar (fitness, confidence, contract length…),
 *  built on Radix Progress for correct a11y semantics. */
export function Meter({ value, max = 100, tone = "neutral", label, className }: MeterProps) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const key = tone === "auto" ? autoTone(ratio) : tone;
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <ProgressPrimitive.Root
        value={ratio * 100}
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2"
      >
        <ProgressPrimitive.Indicator
          className={cn("h-full rounded-full transition-transform", TONE[key])}
          style={{ transform: `translateX(-${(1 - ratio) * 100}%)`, width: "100%" }}
        />
      </ProgressPrimitive.Root>
      {label != null && <span className="w-10 shrink-0 text-right text-xs tabular-nums text-fg-muted">{label}</span>}
    </div>
  );
}
