import { cn } from "../../lib/utils";

/**
 * A club crest (or any badge) from a data URI. Falls back to a rounded box with
 * the short code when no image is available (e.g. the procedural dataset).
 */
export function Crest({ src, alt, code, size = 20, className }: { src?: string; alt?: string; code?: string; size?: number; className?: string }) {
  if (src) {
    return <img src={src} alt={alt ?? ""} width={size} height={size} loading="lazy" className={cn("inline-block shrink-0 object-contain", className)} style={{ width: size, height: size }} />;
  }
  if (code) {
    return (
      <span
        className={cn("inline-grid shrink-0 place-items-center rounded bg-surface-2 font-bold text-fg-muted", className)}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      >
        {code.slice(0, 3)}
      </span>
    );
  }
  return null;
}
