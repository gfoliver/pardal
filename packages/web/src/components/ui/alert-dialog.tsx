import * as React from "react";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { Button, type ButtonProps } from "./button";
import { cn } from "../../lib/utils";

/**
 * "Are you sure?" — for the handful of actions that cannot be taken back.
 *
 * Deliberately NOT `dialog`, though they look almost the same. A dialog is a place to do something and
 * can be waved away: click the backdrop, press Escape, it is gone, and nothing happened. An alert
 * dialog is a QUESTION, so Radix refuses to close it on an outside click and moves focus to its
 * buttons — the manager has to answer rather than dismiss. Using the wrong one of the two would make a
 * permanent decision dismissable by a stray click, which is the exact failure it exists to prevent.
 *
 * Same centring trick as `dialog`: a flex wrapper positions it, so `transform` belongs entirely to the
 * zoom animation. See the note there for what happens when the two fight over it.
 */
export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

export const AlertDialogContent = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <AlertDialogPrimitive.Portal>
    <AlertDialogPrimitive.Overlay className="fixed inset-0 z-[var(--z-overlay)] bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
    <div className="pointer-events-none fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4">
      <AlertDialogPrimitive.Content
        ref={ref}
        className={cn(
          "pointer-events-auto flex w-full max-w-sm flex-col gap-3 rounded-lg border border-border-strong bg-elevated p-4 shadow-xl outline-none",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      >
        {children}
      </AlertDialogPrimitive.Content>
    </div>
  </AlertDialogPrimitive.Portal>
));
AlertDialogContent.displayName = "AlertDialogContent";

export const AlertDialogTitle = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Title ref={ref} className={cn("text-sm font-semibold text-fg", className)} {...props} />
));
AlertDialogTitle.displayName = "AlertDialogTitle";

/** What the action will actually do. The one place to spell out the part that cannot be undone. */
export const AlertDialogDescription = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Description ref={ref} className={cn("text-sm leading-relaxed text-fg-muted", className)} {...props} />
));
AlertDialogDescription.displayName = "AlertDialogDescription";

export function AlertDialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-1 flex justify-end gap-2", className)} {...props} />;
}

/** Cancel sits FIRST in the DOM, so it is what a blind Enter or an autofocus lands on. */
export const AlertDialogCancel = React.forwardRef<HTMLButtonElement, ButtonProps>(({ variant = "secondary", size = "sm", ...props }, ref) => (
  <AlertDialogPrimitive.Cancel asChild>
    <Button ref={ref} variant={variant} size={size} {...props} />
  </AlertDialogPrimitive.Cancel>
));
AlertDialogCancel.displayName = "AlertDialogCancel";

export const AlertDialogAction = React.forwardRef<HTMLButtonElement, ButtonProps>(({ variant = "primary", size = "sm", ...props }, ref) => (
  <AlertDialogPrimitive.Action asChild>
    <Button ref={ref} variant={variant} size={size} {...props} />
  </AlertDialogPrimitive.Action>
));
AlertDialogAction.displayName = "AlertDialogAction";

/**
 * The whole question in one component: what it is, what it costs, cancel, confirm.
 *
 * Here because all four callers want exactly this and nothing else — a substitution, playing on a man
 * down, deleting a tactic, deleting a career. Four hand-assembled copies of the same five elements is
 * four chances for one of them to forget the sentence that says the action is permanent.
 *
 * Driven by `open` rather than wrapping a trigger, because three of the four are reached from a
 * dropdown item or a drag-and-drop, where there is no button left to wrap by the time the question
 * needs asking.
 */
export function Confirm({ open, onOpenChange, title, body, confirmLabel, cancelLabel, danger = false, onConfirm }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** What will happen, including the part that cannot be taken back. */
  body: React.ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  /** Paints the confirm button as destructive. For actions that DESTROY rather than merely commit. */
  danger?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{body}</AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction variant={danger ? "danger" : "primary"} onClick={onConfirm}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
