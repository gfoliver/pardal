import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "../../lib/utils";

export const Tabs = TabsPrimitive.Root;

/**
 * The tab strip. Scrolls sideways rather than clipping when the tabs are wider than the
 * screen — which is what happened the moment a fourth tab was added to Transfers on a
 * 375px phone: the strip measured 388px inside 343px with `overflow: visible`, the page
 * itself did NOT scroll, and so the last tab was simply unreachable. Nothing looked
 * broken, which is the worst version of that bug.
 *
 * `shrink-0` on the triggers is load-bearing: without it flex squeezes them to fit and
 * the labels wrap instead of scrolling.
 */
export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn("flex items-center gap-5 overflow-x-auto border-b border-hairline [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}
    {...props}
  />
));
TabsList.displayName = "TabsList";

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "relative -mb-px shrink-0 border-b-2 border-transparent py-2.5 text-xs font-semibold uppercase tracking-caps text-fg-faint outline-none transition-colors",
      "hover:text-fg data-[state=active]:border-primary data-[state=active]:text-fg",
      "focus-visible:text-fg",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = "TabsTrigger";

export const TabsContent = TabsPrimitive.Content;
