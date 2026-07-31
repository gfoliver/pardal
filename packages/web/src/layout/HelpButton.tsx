import { useState, type ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import { useApp } from "../app/AppProviders";
import { Button } from "../components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { helpFor } from "../i18n/help";
import type { ScreenId } from "./Shell";

/**
 * "What is this screen for?", answered in place.
 *
 * Lives in the breadcrumb row rather than in the header: that row is the one shared
 * per-screen surface that renders at every width, so one button covers desktop and phone
 * without a second layout. The header's right side is play controls, and a help icon among
 * them would compete with the button that advances the season.
 *
 * Absent — not disabled — on a screen with nothing worth explaining. A help button that
 * opens an empty box teaches the manager to stop pressing it.
 */
export function HelpButton({ screen }: { screen: ScreenId }) {
  const { t, locale } = useApp();
  const [open, setOpen] = useState(false);
  const topic = helpFor(locale, screen);
  if (!topic) return null;

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        className="shrink-0 text-fg-faint hover:text-fg"
        aria-label={t.help}
        onClick={() => setOpen(true)}
      >
        <HelpCircle />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{topic.title}</DialogTitle></DialogHeader>
          <DialogBody className="flex flex-col gap-3 leading-relaxed text-fg-muted">
            {topic.body.map((line, i) => (
              <p key={i}>{emphasise(line)}</p>
            ))}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Render `**this**` as bold.
 *
 * A deliberately tiny subset of markdown rather than a parser: the help text needs to lean
 * on one or two words per paragraph, and pulling in a markdown renderer — or worse, setting
 * `innerHTML` from a string — would be a lot of surface area for emphasis.
 */
function emphasise(line: string): ReactNode[] {
  return line.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 === 1 ? <strong key={i} className="font-semibold text-fg">{part}</strong> : <span key={i}>{part}</span>,
  );
}
