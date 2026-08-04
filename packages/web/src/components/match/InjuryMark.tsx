import { Plus } from "lucide-react";
import { cn } from "../../lib/utils";

/**
 * The medical cross that marks a hurt player — the shorthand every football
 * screen uses. Shared because it has to read identically wherever the player
 * appears: the pitch marker, the lineup column and the bench list all refer to
 * the same man.
 *
 * Drawn in dark ink rather than the conventional white, because `--danger` is a
 * light salmon and a white cross on it measures 2.9:1 — under the 3:1 an icon
 * needs. Dark ink measures 7:1, and matches how every other saturated pill in
 * the app (position badges, form chips, shirt numbers) is inked.
 */
export function InjuryMark({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn("inline-grid shrink-0 place-items-center rounded-sm bg-danger text-ink", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label="injured"
    >
      <Plus strokeWidth={4} style={{ width: size * 0.75, height: size * 0.75 }} />
    </span>
  );
}
