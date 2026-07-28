import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "../../lib/utils";

/**
 * A panel that slides in from an edge — the off-canvas form of something that is
 * a fixed column on a wide screen. The navigation sidebar is the first consumer:
 * on a phone there is no room to spend 248px on it permanently, but hiding it
 * outright would leave no way around the game.
 *
 * A modal dialog underneath, so focus trapping, Escape and the scroll lock come
 * for free — a drawer you can tab out of behind the overlay is worse than none.
 */
export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

export const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { side?: "left" | "right" | "bottom" }
>(({ className, children, side = "left", ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed z-50 flex flex-col bg-elevated shadow-xl outline-none",
        side === "left" && "inset-y-0 left-0 w-[17rem] max-w-[85vw] border-r border-hairline data-[state=open]:animate-in data-[state=open]:slide-in-from-left",
        side === "right" && "inset-y-0 right-0 w-[17rem] max-w-[85vw] border-l border-hairline data-[state=open]:animate-in data-[state=open]:slide-in-from-right",
        side === "bottom" && "inset-x-0 bottom-0 max-h-[85vh] rounded-t-lg border-t border-hairline data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom",
        className,
      )}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
SheetContent.displayName = "SheetContent";

/** Radix asks for a title on every dialog; a drawer rarely wants to SHOW one. */
export const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title> & { srOnly?: boolean }
>(({ className, srOnly, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(srOnly ? "sr-only" : "px-3 pt-4 text-sm font-semibold text-fg", className)}
    {...props}
  />
));
SheetTitle.displayName = "SheetTitle";
