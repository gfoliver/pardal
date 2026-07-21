import type { SVGProps } from "react";

// Minimal, consistent 24px stroke icon set (currentColor). No external deps.
type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 20, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconDashboard = (p: P) => (
  <Svg {...p}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></Svg>
);
export const IconSquad = (p: P) => (
  <Svg {...p}><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><path d="M16 5.5a3 3 0 0 1 0 5.8" /><path d="M17.5 20a5.5 5.5 0 0 0-3-4.9" /></Svg>
);
export const IconTactics = (p: P) => (
  <Svg {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M12 3v18M3 12h18" /><circle cx="12" cy="12" r="2.4" /></Svg>
);
export const IconMatch = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="m12 7 2.6 1.9-1 3h-3.2l-1-3z" /></Svg>
);
export const IconLeague = (p: P) => (
  <Svg {...p}><path d="M6 4h12v4a6 6 0 0 1-12 0z" /><path d="M6 6H4v1a3 3 0 0 0 2 2.8M18 6h2v1a3 3 0 0 1-2 2.8" /><path d="M9 20h6M12 14v6" /></Svg>
);
export const IconSun = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Svg>
);
export const IconMoon = (p: P) => (
  <Svg {...p}><path d="M20 14.5A8 8 0 0 1 9.5 4 7 7 0 1 0 20 14.5z" /></Svg>
);
export const IconChevron = (p: P) => (
  <Svg {...p}><path d="m9 6 6 6-6 6" /></Svg>
);
export const IconMenu = (p: P) => (
  <Svg {...p}><path d="M4 6h16M4 12h16M4 18h16" /></Svg>
);
export const IconPlay = (p: P) => (
  <Svg {...p}><path d="M7 5.5v13l11-6.5z" fill="currentColor" stroke="none" /></Svg>
);
export const IconWhistle = (p: P) => (
  <Svg {...p}><path d="M3 11a4 4 0 0 1 4-4h9l4-2v6a7 7 0 1 1-13.9-1H3z" /><circle cx="7" cy="14" r="1" /></Svg>
);
