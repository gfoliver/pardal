import { Plus } from "lucide-react";
import { cn } from "../../lib/utils";

/**
 * The medical cross that marks a hurt player: white on red, the shorthand every
 * football screen uses. Shared because it has to read identically wherever the
 * player appears — the pitch marker, the lineup column and the bench list all
 * refer to the same man.
 */
export function InjuryMark({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn("inline-grid shrink-0 place-items-center rounded-sm bg-danger text-white", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label="injured"
    >
      <Plus strokeWidth={4} style={{ width: size * 0.75, height: size * 0.75 }} />
    </span>
  );
}
