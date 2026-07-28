import { useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "../ui/context-menu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Button } from "../ui/button";
import { usePlayerActions, type ActionContext, type PlayerAction } from "../../lib/player-actions";
import { ShirtNumberDialog } from "./ShirtNumberDialog";
import type { ScreenId } from "../../layout/Shell";

/**
 * The two ways to reach a player's actions, both fed by `usePlayerActions`.
 *
 * Keeping them in one file makes the invariant hard to break by accident: if
 * you add an action, it appears in both, because both map the same array.
 */

/**
 * Wrap anything to give it a right-click menu.
 *
 * By default the trigger is Radix's OWN element, carrying `display: contents` so
 * it takes part in no layout — the right-click bubbles up to it from whatever is
 * inside, and a grid or an absolutely-positioned shirt lays out exactly as before.
 *
 * `asChild` hands the trigger to the child element instead, which a table row
 * needs (a `<span>` between `<tbody>` and `<tr>` is not valid HTML). Do NOT use it
 * on something that is already another Radix trigger: two `asChild` triggers
 * fighting over one element is what made every menu on a TOOLTIPPED element — the
 * shirts on the tactics pitch, every bench card — silently do nothing, and trying
 * to forward both sets of props through `Abbrev` crashed the Slot outright.
 */
export function PlayerContextMenu({
  playerId,
  context,
  onNavigate,
  asChild,
  children,
}: {
  playerId: string;
  context: ActionContext;
  onNavigate?: (screen: ScreenId, param?: string) => void;
  /** Make the child element itself the trigger — for table rows. */
  asChild?: boolean;
  children: ReactNode;
}) {
  const [shirt, setShirt] = useState(false);
  const actions = usePlayerActions(playerId, context, onNavigate, { editShirtNumber: () => setShirt(true) });
  if (actions.length === 0) return <>{children}</>;
  return (
    <>
      {shirt && <ShirtNumberDialog playerId={playerId} onClose={() => setShirt(false)} />}
      <ContextMenu>
        <ContextMenuTrigger asChild={asChild} className={asChild ? undefined : "contents"}>
          {children}
        </ContextMenuTrigger>
        <ContextMenuContent>
          {actions.map((a) => (
            <Item key={a.id} a={a} Row={ContextMenuItem} Sep={ContextMenuSeparator} />
          ))}
        </ContextMenuContent>
      </ContextMenu>
    </>
  );
}

/** The "…" button a table row carries — the touch-reachable path to the same list. */
export function PlayerRowMenu({
  playerId,
  context,
  onNavigate,
  label,
}: {
  playerId: string;
  context: ActionContext;
  onNavigate?: (screen: ScreenId, param?: string) => void;
  label: string;
}) {
  const [shirt, setShirt] = useState(false);
  const actions = usePlayerActions(playerId, context, onNavigate, { editShirtNumber: () => setShirt(true) });
  if (actions.length === 0) return null;
  return (
    <>
      {shirt && <ShirtNumberDialog playerId={playerId} onClose={() => setShirt(false)} />}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="ghost" aria-label={label} onClick={(e) => e.stopPropagation()}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {actions.map((a) => (
            <Item key={a.id} a={a} Row={DropdownMenuItem} Sep={DropdownMenuSeparator} />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

/** One entry, rendered through whichever menu primitive the caller uses. */
function Item({
  a,
  Row,
  Sep,
}: {
  a: PlayerAction;
  Row: typeof ContextMenuItem | typeof DropdownMenuItem;
  Sep: typeof ContextMenuSeparator | typeof DropdownMenuSeparator;
}) {
  return (
    <>
      {a.separatorBefore && <Sep />}
      <Row
        disabled={a.disabled}
        onSelect={(e: Event) => {
          e.stopPropagation();
          a.onSelect();
        }}
      >
        {a.icon}
        {a.label}
      </Row>
    </>
  );
}
