import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
    {/*
      Centred by LAYOUT, not by `top-1/2 -translate-y-1/2`.
      The zoom-in animation sets `transform` on the content, which silently replaces those
      translate utilities for as long as it runs — so the dialog opened off-centre and slid
      into place, and a dialog taller than the viewport had its top and bottom cut off with
      no way to reach either. Handing the centring to a flex wrapper leaves `transform`
      entirely to the animation, which is the only thing that wants it.

      The wrapper covers the screen, so it has to be transparent to clicks or it would eat
      the ones meant for the overlay behind it — which are how a dialog is dismissed.
    */}
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          // A flex column with a capped height, so a long body scrolls INSIDE the dialog
          // and the header and footer stay put.
          "pointer-events-auto flex max-h-full w-full max-w-md flex-col rounded-lg border border-border-strong bg-elevated shadow-xl outline-none",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-3 top-3 text-fg-faint transition-colors hover:text-fg" aria-label="Close">
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </div>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = "DialogContent";

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("shrink-0 border-b border-border px-4 py-3 pr-10", className)} {...props} />;
}

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn("text-sm font-semibold text-fg", className)} {...props} />
));
DialogTitle.displayName = "DialogTitle";

/** The one part that scrolls, so the header and footer stay reachable. */
export function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("min-h-0 flex-1 overflow-y-auto px-4 py-4 text-sm text-fg", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex shrink-0 justify-end gap-2 border-t border-border px-4 py-3", className)} {...props} />;
}
