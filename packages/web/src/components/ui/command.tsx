import * as React from "react";
import { Search } from "lucide-react";
import { Dialog, DialogContent } from "./dialog";
import { cn } from "../../lib/utils";

/**
 * Type a name, get where you were going.
 *
 * Hand-authored rather than `cmdk`, and the reason is the one thing this has to get right: matching
 * must fold diacritics, because the squads are full of `João`, `Éverton` and `Muñoz` and a manager
 * typing "joao" is doing the normal thing. `cmdk` brings its own scorer, so it would have had to be
 * replaced — and once the filter is ours, what is left is a dialog, an input and a listbox. The folding
 * itself comes from `components/data`, so the palette and every table search agree on what matches.
 *
 * Keyboard is the whole point of the shape, so the keys are handled on the INPUT and never leave it:
 * up and down move the highlight, Enter takes it, Escape closes. The list is not focusable — moving
 * focus into it would take it off the box he is still typing in.
 */

export interface CommandItem {
  readonly id: string;
  /** Which group it appears under. Groups are drawn in the order they first occur. */
  readonly group: string;
  readonly render: React.ReactNode;
  readonly onSelect: () => void;
}

export function CommandPalette({ open, onOpenChange, placeholder, empty, text, onText, items }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  placeholder: string;
  /** Shown when there is a query and nothing matched. */
  empty: string;
  text: string;
  onText: (text: string) => void;
  items: readonly CommandItem[];
}) {
  const [active, setActive] = React.useState(0);
  const listRef = React.useRef<HTMLDivElement>(null);

  // Back to the top whenever the result set changes, because the old index pointed at a different row.
  React.useEffect(() => setActive(0), [text, items.length]);

  // Follow the highlight when it walks past the edge of the scroll box.
  React.useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const commit = (i: number) => {
    const item = items[i];
    if (!item) return;
    // Closed FIRST: the handler usually navigates, and a palette that unmounts a moment later leaves
    // the impression it is still open over the new screen.
    onOpenChange(false);
    item.onSelect();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault(); // or the caret jumps to the end of the input
      if (items.length === 0) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      // Wraps, so holding one arrow key cannot dead-end.
      setActive((i) => (i + step + items.length) % items.length);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      commit(active);
    }
  };

  // Grouped for drawing, in first-seen order, without disturbing the flat index the keyboard walks.
  const groups: { name: string; items: { item: CommandItem; index: number }[] }[] = [];
  items.forEach((item, index) => {
    const last = groups[groups.length - 1];
    if (last && last.name === item.group) last.items.push({ item, index });
    else groups.push({ name: item.group, items: [{ item, index }] });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Top-aligned rather than centred: a palette belongs under where you typed, and a centred box
          that grows downward as results arrive moves the first result out from under the cursor. */}
      <DialogContent className="max-w-lg self-start sm:mt-[12vh]">
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="size-4 shrink-0 text-fg-faint" />
          <input
            autoFocus
            value={text}
            onChange={(e) => onText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            aria-label={placeholder}
            role="combobox"
            aria-expanded
            aria-controls="command-results"
            aria-activedescendant={items[active] ? `command-item-${items[active]!.id}` : undefined}
            className="h-11 w-full bg-transparent text-sm text-fg outline-none placeholder:text-fg-faint"
          />
        </div>
        <div ref={listRef} id="command-results" role="listbox" className="max-h-[52vh] overflow-y-auto p-1.5">
          {items.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-fg-muted">{empty}</p>
          ) : (
            groups.map((g) => (
              <div key={g.name} className="mb-1 last:mb-0">
                <p className="caps px-2 py-1 text-fg-faint">{g.name}</p>
                {g.items.map(({ item, index }) => (
                  <button
                    key={item.id}
                    id={`command-item-${item.id}`}
                    type="button"
                    role="option"
                    aria-selected={index === active}
                    data-active={index === active}
                    // Hover moves the highlight too, so mouse and keyboard never disagree about which
                    // row Enter would take.
                    onMouseEnter={() => setActive(index)}
                    onClick={() => commit(index)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm outline-none",
                      index === active ? "bg-primary-soft text-fg" : "text-fg-muted",
                    )}
                  >
                    {item.render}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
