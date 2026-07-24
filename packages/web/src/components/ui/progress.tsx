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

/** A thin labelled progress/meter bar (fitness, confidence, contract length…). */
export function Meter({ value, max = 100, tone = "neutral", label, className }: MeterProps) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const key = tone === "auto" ? autoTone(ratio) : tone;
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div className={cn("h-full rounded-full transition-[width]", TONE[key])} style={{ width: `${ratio * 100}%` }} />
      </div>
      {label != null && <span className="w-10 shrink-0 text-right text-xs tabular-nums text-fg-muted">{label}</span>}
    </div>
  );
}
