import type { ClubKit } from "@fut/competition";
import { cn } from "../../lib/utils";

/**
 * A club's shirt drawn from its kit colours + pattern: proper jersey silhouette
 * (raglan sleeves, collar, tapered body) with soft shading, so it reads as a
 * kit at 20px and at 80px. Reusable anywhere a team or a lineup slot needs
 * identity — tactics slots, bench cards, kit management. Pure SVG, no assets.
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
  /** Short text on the chest (position or squad number). */
  label?: string;
  className?: string;
  title?: string;
}) {
  const primary = kit?.primary ?? "#3A4452";
  const secondary = kit?.secondary ?? "#232A34";
  const detail = kit?.detail ?? "#E8EDF2";
  const pattern = kit?.pattern ?? "solid";
  const uid = `${primary}${secondary}${pattern}`.replace(/[^a-zA-Z0-9]/g, "");

  const BODY = "M15.5 6.2 H24.5 C25 8.6 26.4 9.9 28.4 9.9 C30.4 9.9 31.6 9.2 32.6 8.2 L38.6 12.4 C39.3 12.9 39.5 13.6 39.2 14.4 L36.4 21.6 C36.1 22.4 35.3 22.8 34.5 22.6 L31.8 21.9 V37.4 C31.8 38.5 31.1 39.2 30 39.2 H10 C8.9 39.2 8.2 38.5 8.2 37.4 V21.9 L5.5 22.6 C4.7 22.8 3.9 22.4 3.6 21.6 L0.8 14.4 C0.5 13.6 0.7 12.9 1.4 12.4 L7.4 8.2 C8.4 9.2 9.6 9.9 11.6 9.9 C13.6 9.9 15 8.6 15.5 6.2 Z";

  return (
    <svg viewBox="0 0 40 44" width={size} height={(size * 44) / 40} className={cn("shrink-0", className)} role="img" aria-label={title}>
      {title && <title>{title}</title>}
      <defs>
        <clipPath id={`c${uid}`}>
          <path d={BODY} />
        </clipPath>
        <linearGradient id={`g${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="45%" stopColor="#fff" stopOpacity="0.04" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.18" />
        </linearGradient>
      </defs>

      {/* Base kit colour */}
      <path d={BODY} fill={primary} />

      {/* Pattern, clipped to the shirt */}
      <g clipPath={`url(#c${uid})`}>
        {pattern === "stripes" &&
          [4, 12, 20, 28, 36].map((x) => <rect key={x} x={x} y="0" width="4" height="44" fill={secondary} />)}
        {pattern === "hoops" &&
          [10, 20, 30].map((y) => <rect key={y} x="0" y={y} width="40" height="5" fill={secondary} />)}
        {pattern === "sash" && <path d="M4 6 L34 40 L28 44 L-2 10 Z" fill={secondary} />}
        {/* Sleeve tips + shading pass */}
        <path d="M0 12 L9 9 V22 L2 23 Z" fill="#000" opacity="0.13" />
        <path d="M40 12 L31 9 V22 L38 23 Z" fill="#000" opacity="0.13" />
        <path d={BODY} fill={`url(#g${uid})`} />
      </g>

      {/* Collar */}
      <path d="M15.5 6.2 C17.2 9.4 22.8 9.4 24.5 6.2 L22.6 4.6 C21.2 6 18.8 6 17.4 4.6 Z" fill={detail} />
      {/* Outline last so it sits above pattern + shading */}
      <path d={BODY} fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth="1" />

      {label && (
        <text
          x="20"
          y="30"
          textAnchor="middle"
          fontSize="11"
          fontWeight="800"
          letterSpacing="-0.3"
          fill={readableOn(primary, pattern)}
          style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.45)", strokeWidth: 1.2 }}
        >
          {label}
        </text>
      )}
    </svg>
  );
}

/** Pick black/white text for legibility over the shirt's dominant colour. */
function readableOn(hex: string, pattern: ClubKit["pattern"]): string {
  if (pattern === "stripes" || pattern === "hoops" || pattern === "sash") return "#FFFFFF";
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#FFFFFF";
  const n = parseInt(m[1]!, 16);
  const luminance = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return luminance > 0.62 ? "#10151C" : "#FFFFFF";
}
