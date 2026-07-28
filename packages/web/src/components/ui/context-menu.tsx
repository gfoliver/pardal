import * as React from "react";
import * as Menu from "@radix-ui/react-context-menu";
import { cn } from "../../lib/utils";

/**
 * Right-click menu. Deliberately styled to match `dropdown-menu` item for item:
 * the same action list is rendered through both (see `lib/player-actions`), so
 * they must look like one feature seen from two angles, not two features.
 *
 * Always an accelerator, never the only path — a touch device has no right
 * click, so everything here is also reachable from a row menu or a detail
 * screen.
 */
export const ContextMenu = Menu.Root;
export const ContextMenuTrigger = Menu.Trigger;

export const ContextMenuContent = React.forwardRef<
  React.ElementRef<typeof Menu.Content>,
  React.ComponentPropsWithoutRef<typeof Menu.Content>
>(({ className, ...props }, ref) => (
  <Menu.Portal>
    <Menu.Content
      ref={ref}
      className={cn(
        "z-50 min-w-[10rem] overflow-hidden rounded-md border border-border-strong bg-elevated p-1 shadow-xl",
        className,
      )}
      {...props}
    />
  </Menu.Portal>
));
ContextMenuContent.displayName = "ContextMenuContent";

export const ContextMenuItem = React.forwardRef<
  React.ElementRef<typeof Menu.Item>,
  React.ComponentPropsWithoutRef<typeof Menu.Item>
>(({ className, ...props }, ref) => (
  <Menu.Item
    ref={ref}
    className={cn(
      "relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2.5 py-1.5 text-sm text-fg outline-none",
      "data-[highlighted]:bg-surface-3 data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
      className,
    )}
    {...props}
  />
));
ContextMenuItem.displayName = "ContextMenuItem";

export const ContextMenuSeparator = React.forwardRef<
  React.ElementRef<typeof Menu.Separator>,
  React.ComponentPropsWithoutRef<typeof Menu.Separator>
>(({ className, ...props }, ref) => (
  <Menu.Separator ref={ref} className={cn("my-1 h-px bg-border", className)} {...props} />
));
ContextMenuSeparator.displayName = "ContextMenuSeparator";

export const ContextMenuLabel = React.forwardRef<
  React.ElementRef<typeof Menu.Label>,
  React.ComponentPropsWithoutRef<typeof Menu.Label>
>(({ className, ...props }, ref) => (
  <Menu.Label ref={ref} className={cn("px-2.5 py-1 text-xs uppercase tracking-wide text-fg-faint", className)} {...props} />
));
ContextMenuLabel.displayName = "ContextMenuLabel";
