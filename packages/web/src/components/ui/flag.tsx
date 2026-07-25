import { flagCode } from "../../lib/flags";
import { cn } from "../../lib/utils";

/**
 * A nationality as its flag. The name stays in the tooltip (and for screen
 * readers), so nothing is lost by dropping the text. Falls back to the ISO-ish
 * code when the nationality is one we cannot map — same spirit as {@link Crest}.
 */
export function Flag({ nationality, size = 14, className }: { nationality?: string; size?: number; className?: string }) {
  if (!nationality) return null;
  const code = flagCode(nationality);
  if (!code) {
    return (
      <span
        className={cn("inline-grid shrink-0 place-items-center rounded-sm bg-surface-2 font-semibold uppercase text-fg-muted", className)}
        style={{ height: size, minWidth: Math.round(size * 4 / 3), fontSize: Math.round(size * 0.6), paddingInline: 2 }}
        title={nationality}
      >
        {nationality.slice(0, 3)}
      </span>
    );
  }
  return (
    <span
      className={cn("fi shrink-0 rounded-sm ring-1 ring-inset ring-black/15", `fi-${code}`, className)}
      style={{ fontSize: size }}
      role="img"
      aria-label={nationality}
      title={nationality}
    />
  );
}
