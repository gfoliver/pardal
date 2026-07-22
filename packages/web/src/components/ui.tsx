import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useApp } from "../app/AppProviders";

/* ---- Button --------------------------------------------------------------- */
type BtnVariant = "primary" | "secondary" | "ghost" | "danger";
type BtnSize = "sm" | "md" | "lg";
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  size?: BtnSize;
  block?: boolean;
  iconOnly?: boolean;
  leadingIcon?: ReactNode;
}
export function Button({
  variant = "secondary",
  size = "md",
  block,
  iconOnly,
  leadingIcon,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  const cls = [
    "btn",
    `btn--${variant}`,
    size !== "md" && `btn--${size}`,
    block && "btn--block",
    iconOnly && "btn--icon",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button className={cls} {...rest}>
      {leadingIcon && <span className="btn-ico">{leadingIcon}</span>}
      {children}
    </button>
  );
}

/* ---- Card / Panel --------------------------------------------------------- */
export function Card({
  children,
  pad,
  hover,
  className = "",
  ...rest
}: { children: ReactNode; pad?: boolean; hover?: boolean; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={["card", pad && "card--pad", hover && "card--hover", className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </div>
  );
}

export function Panel({
  title,
  action,
  flush,
  children,
}: {
  title?: ReactNode;
  action?: ReactNode;
  flush?: boolean;
  children: ReactNode;
}) {
  return (
    <Card>
      {title && (
        <div className="panel-head">
          <h3>{title}</h3>
          {action}
        </div>
      )}
      <div className={flush ? "panel-body panel-body--flush" : "panel-body"}>{children}</div>
    </Card>
  );
}

/* ---- Badge ---------------------------------------------------------------- */
export function Badge({
  children,
  tone,
  className = "",
}: {
  children: ReactNode;
  tone?: "gk" | "def" | "mid" | "att" | "primary" | "gold";
  className?: string;
}) {
  const posTone = tone === "gk" || tone === "def" || tone === "mid" || tone === "att";
  const cls = [
    "badge",
    posTone && "badge--pos",
    tone && `badge--${tone}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return <span className={cls}>{children}</span>;
}

/* ---- Segmented control ---------------------------------------------------- */
export interface SegOption<T extends string> {
  value: T;
  label: ReactNode;
}
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  accent,
  ariaLabel,
}: {
  options: SegOption<T>[];
  value: T;
  onChange: (v: T) => void;
  accent?: boolean;
  ariaLabel?: string;
}) {
  return (
    <div className="seg" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={accent ? "seg-item seg-item--accent" : "seg-item"}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---- Stat bar ------------------------------------------------------------- */
export function StatBar({ label, value, max = 99 }: { label: string; value: number; max?: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="statbar">
      <span className="statbar-label">{label}</span>
      <span className="statbar-val">{value}</span>
      <div className="statbar-track">
        <div className="statbar-fill" style={{ width: `${pct}%`, background: ratingColor(value) }} />
      </div>
    </div>
  );
}

/* ---- Rating (overall) — bare serif numeral -------------------------------- */
export function Rating({ value }: { value: number }) {
  return (
    <span className="rating" style={{ color: ratingColor(value) }}>
      {value}
    </span>
  );
}

/* ---- Avatar --------------------------------------------------------------- */
export function Avatar({ name, tone, lg }: { name: string; tone: string; lg?: boolean }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      className={lg ? "avatar avatar--lg" : "avatar"}
      style={{ background: `linear-gradient(135deg, ${tone}, color-mix(in srgb, ${tone} 55%, #ffffff))` }}
    >
      {initials}
    </span>
  );
}

/* ---- Tabs ----------------------------------------------------------------- */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tb) => (
        <button
          key={tb.value}
          role="tab"
          className="tab"
          aria-selected={value === tb.value}
          onClick={() => onChange(tb.value)}
        >
          {tb.label}
        </button>
      ))}
    </div>
  );
}

/* ---- Masthead (editorial page header) ------------------------------------- */
export function Masthead({
  kicker,
  title,
  meta,
  action,
}: {
  kicker: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="masthead">
      <div className="masthead-top">
        <div>
          <span className="kicker">{kicker}</span>
          <h1 style={{ marginTop: "var(--sp-3)" }}>{title}</h1>
          {meta && <div className="meta">{meta}</div>}
        </div>
        {action}
      </div>
      <hr className="hairline" />
    </header>
  );
}

/* ---- Stat block (big numeral + caption) ----------------------------------- */
export function Stat({ value, caption, color }: { value: ReactNode; caption: string; color?: string }) {
  return (
    <div className="stat">
      <span className="stat-num" style={color ? { color } : undefined}>
        {value}
      </span>
      <span className="stat-cap">{caption}</span>
    </div>
  );
}

/* ---- Progressive disclosure gate ------------------------------------------ */
export function Advanced({ children }: { children: ReactNode }) {
  const { mode } = useApp();
  return mode === "advanced" ? <>{children}</> : null;
}

/* ---- helpers -------------------------------------------------------------- */
export function ratingColor(v: number): string {
  if (v >= 85) return "var(--brand-emerald)";
  if (v >= 75) return "var(--accent)";
  if (v >= 65) return "var(--gold)";
  if (v >= 55) return "var(--warn)";
  return "var(--danger)";
}
