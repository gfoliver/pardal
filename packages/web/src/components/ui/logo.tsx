import { cn } from "../../lib/utils";

/**
 * The sparrow, and the wordmark beside it.
 *
 * Lives in `public/` rather than `src/assets/` because the favicon in
 * index.html needs a stable path — one file, referenced from both, instead of
 * a hashed copy for the app and a second one for the tab.
 *
 * The mark is portrait (570×769), so it's sized by HEIGHT and left to find its
 * own width. Sizing it by a square box would letterbox it inside its own
 * padding and make it read smaller than everything next to it.
 */
export function LogoMark({ size = 36, className }: { size?: number; className?: string }) {
  return <img src="/logo.svg" alt="" aria-hidden height={size} style={{ height: size }} className={cn("w-auto shrink-0", className)} />;
}

/** Mark + name, the lockup used in the sidebar and on the start screen. */
export function Logo({ size = 36, className, nameClassName }: { size?: number; className?: string; nameClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={size} />
      <span className={cn("serif font-semibold tracking-tight", nameClassName)}>
        Pard<b className="italic text-primary">al</b>
      </span>
    </span>
  );
}
