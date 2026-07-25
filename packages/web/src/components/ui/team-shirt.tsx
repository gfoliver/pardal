import type { ClubKit } from "@fut/competition";
import { cn } from "../../lib/utils";

/**
 * A club's shirt, drawn from its kit colours + pattern. Reusable anywhere a team
 * or a lineup slot needs identity: tactics slots, lineups, kit management. Pure
 * SVG (no assets), so it scales and themes cleanly.
 */
export function TeamShirt({
  kit,
  size = 36,
  label,
  className,
  title,
}: {
  kit?: ClubKit;
  size?: number;
  /** Short text drawn on the shirt (position or squad number). */
  label?: string;
  className?: string;
  title?: string;
}) {
  const primary = kit?.primary ?? "var(--surface-3)";
  const secondary = kit?.secondary ?? "var(--fg-muted)";
  const detail = kit?.detail ?? "var(--fg)";
  const pattern = kit?.pattern ?? "solid";
  const id = `${primary}${secondary}${pattern}`.replace(/[^a-zA-Z0-9]/g, "");

  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={cn("shrink-0", className)} role="img" aria-label={title}>
      {title && <title>{title}</title>}
      <defs>
        {pattern === "stripes" && (
          <pattern id={`s${id}`} width="8" height="8" patternUnits="userSpaceOnUse">
            <rect width="8" height="8" fill={primary} />
            <rect width="4" height="8" fill={secondary} />
          </pattern>
        )}
        {pattern === "hoops" && (
          <pattern id={`s${id}`} width="8" height="9" patternUnits="userSpaceOnUse">
            <rect width="8" height="9" fill={primary} />
            <rect width="8" height="4.5" fill={secondary} />
          </pattern>
        )}
      </defs>
      {/* Shirt body: shoulders + sleeves + torso. */}
      <path
        d="M11 4 L16 6 L21 4 L27 7 L25 13 L22 12 V28 H10 V12 L7 13 L5 7 Z"
        fill={pattern === "stripes" || pattern === "hoops" ? `url(#s${id})` : primary}
        stroke="rgba(0,0,0,0.35)"
        strokeWidth="0.7"
      />
      {pattern === "sash" && <path d="M11 4 L25 26 L21 28 L8 7 Z" fill={secondary} opacity="0.95" />}
      {/* Collar. */}
      <path d="M13 4.5 L16 7 L19 4.5 L16 3.4 Z" fill={detail} stroke="rgba(0,0,0,0.3)" strokeWidth="0.5" />
      {label && (
        <text
          x="16"
          y="20.5"
          textAnchor="middle"
          fontSize="8"
          fontWeight="800"
          fill={readableOn(primary, pattern)}
          style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.35)", strokeWidth: 0.8 }}
        >
          {label}
        </text>
      )}
    </svg>
  );
}

/** Pick black/white text for legibility over the shirt's dominant colour. */
function readableOn(hex: string, pattern: ClubKit["pattern"]): string {
  if (pattern === "stripes" || pattern === "hoops") return "#FFFFFF";
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#FFFFFF";
  const n = parseInt(m[1]!, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#111111" : "#FFFFFF";
}
