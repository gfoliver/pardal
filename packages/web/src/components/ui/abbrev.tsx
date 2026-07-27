import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";
import { cn } from "../../lib/utils";

/**
 * A shortened label that can always be read in full on hover/focus.
 *
 * The project standard: ANY text the UI abbreviates — a position code (ZAG), a
 * clipped mentality (M. Ofen), a truncated name — goes through this, so the
 * full wording is never actually lost, only folded away. Prefer this over a
 * bare `title` attribute: it is keyboard-reachable and styled like the rest of
 * the kit.
 */
export function Abbrev({
  full,
  children,
  className,
  asChild,
}: {
  /** The complete text, shown in the tooltip. */
  full: string;
  /** The shortened form actually rendered. Defaults to nothing but the tooltip. */
  children: ReactNode;
  className?: string;
  /** Use the child element as the trigger instead of wrapping it in a span. */
  asChild?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild={asChild} className={cn(!asChild && "cursor-default", className)}>
        {children}
      </TooltipTrigger>
      <TooltipContent>{full}</TooltipContent>
    </Tooltip>
  );
}
