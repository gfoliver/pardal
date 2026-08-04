import { Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";

/**
 * Work in progress, where there is nothing yet to draw.
 *
 * Not a skeleton, and the difference decides which of the two to reach for. A skeleton stands in for
 * content whose SHAPE is already known — a list of rows about to arrive, so the layout does not jump.
 * The waits in this app are not that: they are "the 855 kB of squad data is on its way and the screen
 * after this one does not exist yet". A grey rectangle pretending to be a table nobody has seen would
 * be a lie about what is coming.
 *
 * Honours `prefers-reduced-motion` through the token block in `globals.css`, which pins every animation
 * to 1ms rather than removing it — see the note there.
 */
export function Spinner({ className }: { className?: string }) {
  return <Loader2 aria-hidden className={cn("size-4 animate-spin text-fg-faint", className)} />;
}

/** A spinner with a line of text under it, for a whole screen that is waiting. */
export function LoadingScreen({ label }: { label: string }) {
  return (
    <div className="grid min-h-full place-items-center p-6" role="status" aria-live="polite">
      <div className="flex animate-fade-in flex-col items-center gap-3">
        <Spinner className="size-6 text-primary" />
        <p className="text-sm text-fg-muted">{label}</p>
      </div>
    </div>
  );
}
