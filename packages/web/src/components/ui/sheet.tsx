import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
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
    <DialogPrimitive.Overlay className="fixed inset-0 z-[var(--z-overlay)] bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed z-[var(--z-modal)] flex flex-col bg-elevated shadow-xl outline-none",
        side === "left" && "inset-y-0 left-0 w-[17rem] max-w-[85vw] border-r border-hairline data-[state=open]:animate-in data-[state=open]:slide-in-from-left",
        side === "right" && "inset-y-0 right-0 w-[17rem] max-w-[85vw] border-l border-hairline data-[state=open]:animate-in data-[state=open]:slide-in-from-right",
        side === "bottom" && "inset-x-0 bottom-0 max-h-[85vh] rounded-t-lg border-t border-hairline data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom",
        className,
      )}
      {...props}
    >
      {children}
      {/*
        A bottom sheet gets an explicit close; the side drawers do not.
        Not a symmetry oversight. The nav drawer arrived from a hamburger and is dismissed by tapping
        the page it is covering, which is the model everyone already has for a drawer. A bottom sheet
        appears over content the manager was READING — a mail, a player's full record — and on a phone
        there is no Escape key, so "tap the strip of overlay above it" is the only way out and nothing
        on screen says so.
      */}
      {side === "bottom" && (
        <DialogPrimitive.Close
          aria-label="Close"
          // A 36px box around a 16px mark. This one is only ever reached with a thumb, and the icon's
          // own size is nowhere near a usable target.
          className="absolute right-1.5 top-1.5 grid size-9 place-items-center rounded-md text-fg-faint transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <X className="size-4" />
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
SheetContent.displayName = "SheetContent";

/**
 * Radix asks for a title on every dialog; a drawer rarely wants to SHOW one.
 *
 * The visible variant carries NO padding of its own. It used to (`px-3 pt-4`), from a time when every
 * `SheetTitle` in the app was `srOnly` and the padding was therefore never rendered — so the first two
 * sheets that showed a title inherited an indent their own content did not have, and the heading sat
 * 12px right of the text beneath it. Spacing belongs to whoever lays the sheet out, since only it knows
 * what the title has to line up WITH.
 */
export const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title> & { srOnly?: boolean }
>(({ className, srOnly, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(srOnly ? "sr-only" : "text-sm font-semibold text-fg", className)}
    {...props}
  />
));
SheetTitle.displayName = "SheetTitle";
