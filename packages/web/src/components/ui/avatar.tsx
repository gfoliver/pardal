import { cn } from "../../lib/utils";

/** Initials avatar tinted by a colour token (no photos in the data yet). */
export function Avatar({
  name,
  tone,
  className,
  size = "default",
}: {
  name: string;
  tone: string;
  className?: string;
  size?: "sm" | "default" | "lg";
}) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-md font-bold text-[#04140e]",
        size === "sm" && "size-7 text-xs",
        size === "default" && "size-9 text-sm",
        size === "lg" && "size-12 text-base",
        className,
      )}
      style={{ background: `linear-gradient(140deg, ${tone}, color-mix(in srgb, ${tone} 60%, #05121a))` }}
      aria-hidden
    >
      {initials}
    </span>
  );
}
