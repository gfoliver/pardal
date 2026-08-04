import * as React from "react";
import * as Primitive from "@radix-ui/react-popover";
import { cn } from "../../lib/utils";

/**
 * A panel anchored to what opened it.
 *
 * Distinct from `DropdownMenu`, which this deliberately does not reuse: a menu is a list of commands
 * and Radix gives it typeahead and arrow-key navigation, which fight anything you can type into. The
 * filter panels are forms — number inputs, checkbox lists — so they want a popover.
 */
export const Popover = Primitive.Root;
export const PopoverTrigger = Primitive.Trigger;
export const PopoverAnchor = Primitive.Anchor;
export const PopoverClose = Primitive.Close;

export const PopoverContent = React.forwardRef<
  React.ElementRef<typeof Primitive.Content>,
  React.ComponentPropsWithoutRef<typeof Primitive.Content>
>(({ className, align = "start", sideOffset = 6, ...props }, ref) => (
  <Primitive.Portal>
    <Primitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      /*
       * `collisionPadding` so a panel opened from the last column does not hang off the edge, and
       * `max-h` + scroll because a nationality list in a real dataset is thirty entries long.
       */
      collisionPadding={8}
      className={cn(
        "z-[var(--z-popover)] max-h-[min(24rem,var(--radix-popover-content-available-height))] w-64 overflow-y-auto",
        "rounded-md border border-border-strong bg-elevated p-3 shadow-xl animate-select-in",
        className,
      )}
      {...props}
    />
  </Primitive.Portal>
));
PopoverContent.displayName = "PopoverContent";
