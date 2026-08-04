import * as React from "react";
import * as HoverCardPrimitive from "@radix-ui/react-hover-card";
import { cn } from "../../lib/utils";

/**
 * A card that answers "who is this?" without going anywhere.
 *
 * Distinct from `tooltip`, which names a thing in a few words — an abbreviation, an icon, a truncated
 * label. This holds real content: a photo, numbers, bars. That difference is why it is a separate
 * primitive rather than a fat tooltip: Radix gives a hover card a longer open delay (so it does not
 * flash while the pointer crosses a table), lets the pointer move INTO it, and marks it as a rich
 * region rather than a description of the trigger.
 *
 * HOVER ONLY, and therefore an enhancement and never the only way to something. Radix does not open one
 * on touch, deliberately — there is no hovering on a phone. Every trigger has to remain a control that
 * does its own job when tapped, which in practice means a link to the page the card previews.
 *
 * Portalled, so it escapes the scroll box of a virtualised grid instead of being clipped by it.
 */
export const HoverCard = HoverCardPrimitive.Root;
export const HoverCardTrigger = HoverCardPrimitive.Trigger;

export const HoverCardContent = React.forwardRef<
  React.ElementRef<typeof HoverCardPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Content>
>(({ className, align = "start", sideOffset = 8, ...props }, ref) => (
  <HoverCardPrimitive.Portal>
    <HoverCardPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      // Below the modal layer and above the page: it must never cover a dialog, and a dialog opened from
      // a row must never appear behind the card that was hovering over it.
      className={cn(
        "z-[var(--z-popover)] w-64 rounded-lg border border-border-strong bg-elevated p-3 shadow-lg outline-none",
        "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
        className,
      )}
      {...props}
    />
  </HoverCardPrimitive.Portal>
));
HoverCardContent.displayName = "HoverCardContent";
