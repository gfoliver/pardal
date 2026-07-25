import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { useFormat } from "../../lib/format";
import { cn } from "../../lib/utils";

/** Parse "2.5m", "500k", "1,2M", "2000000" → integer, or null if unparseable. */
export function parseMoney(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/[$r\s]/g, "").replace(",", ".");
  if (s === "") return 0;
  const m = s.match(/^([0-9]*\.?[0-9]+)([kmb])?$/);
  if (!m) return null;
  let n = parseFloat(m[1]!);
  const unit = m[2];
  if (unit === "k") n *= 1e3;
  else if (unit === "m") n *= 1e6;
  else if (unit === "b") n *= 1e9;
  return Math.round(n);
}

/** Compact editable text for a value, e.g. 2500000 → "2.5M". */
function compact(n: number): string {
  if (n >= 1e6) return `${trim(n / 1e6)}M`;
  if (n >= 1e3) return `${trim(n / 1e3)}K`;
  return String(Math.round(n));
}
const trim = (x: number) => String(Math.round(x * 100) / 100);


export interface MoneyInputProps {
  value: number;
  onValue: (v: number) => void;
  /** Step for the +/- buttons (defaults to 10% of the value, min 50k). */
  step?: number;
  min?: number;
  max?: number;
  /** Flag over-budget in red when value exceeds this. */
  budget?: number;
}

/**
 * A visual money input for fees/wages: type "2.5m" / "500k" / a raw number,
 * nudge with +/- (in millions/thousands), and see the exact amount formatted
 * below. Reused by transfers and contracts.
 */
export function MoneyInput({ value, onValue, step, min = 0, max, budget }: MoneyInputProps) {
  const fmt = useFormat();
  // `value` is in the save's BASE currency; the field edits DISPLAY units so the
  // number you type matches the currency you picked, then converts back on write.
  const [text, setText] = useState(() => compact(fmt.toDisplay(value)));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(compact(fmt.toDisplay(value)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused, fmt.currencySymbol]);

  const st = step ?? Math.max(50_000, Math.round(value * 0.1));
  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min, n));
  const nudge = (dir: number) => onValue(clamp(value + dir * st));
  const over = budget != null && value > budget;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-stretch gap-1.5">
        <button type="button" onClick={() => nudge(-1)} className="grid w-9 place-items-center rounded-md border border-border-strong text-fg-muted hover:bg-surface-2"><Minus className="size-4" /></button>
        <div className="relative flex-1">
          <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-sm text-fg-faint">{fmt.currencySymbol}</span>
          <input
            className={cn(
              "h-9 w-full rounded-md border bg-transparent pl-8 pr-3 text-right text-sm font-semibold tabular-nums text-fg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              over ? "border-danger" : "border-border-strong",
            )}
            value={text}
            onFocus={() => setFocused(true)}
            onBlur={() => { setFocused(false); setText(compact(fmt.toDisplay(value))); }}
            onChange={(e) => {
              setText(e.target.value);
              const n = parseMoney(e.target.value);
              if (n != null) onValue(clamp(fmt.toBase(n))); // typed in display units → store base
            }}
          />
        </div>
        <button type="button" onClick={() => nudge(1)} className="grid w-9 place-items-center rounded-md border border-border-strong text-fg-muted hover:bg-surface-2"><Plus className="size-4" /></button>
      </div>
      <div className={cn("text-right text-xs tabular-nums", over ? "text-danger" : "text-fg-faint")}>{fmt.money(value)}</div>
    </div>
  );
}
