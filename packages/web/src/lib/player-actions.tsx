import type { ReactNode } from "react";
import { ArrowRightLeft, Eye, FileSignature, Star, StarOff, User } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "../app/AppProviders";
import { useCareer } from "../app/CareerProvider";
import { useFormat } from "./format";
import type { ScreenId } from "../layout/Shell";

/**
 * Everything you can do to a player, declared once.
 *
 * The alternative — and the reason this file exists — is what already happened
 * with labels in this codebase: a map gets copied into a second screen, then a
 * third, and within a week they disagree. A row menu, a right-click menu and a
 * detail screen offering *almost* the same actions is the same failure with
 * worse symptoms, because the difference is invisible until someone can't find
 * the thing they used yesterday.
 *
 * So the list lives here, and every surface renders it. `ContextMenu` and
 * `DropdownMenu` are two presentations of one array.
 */

export interface PlayerAction {
  readonly id: string;
  readonly label: string;
  readonly icon: ReactNode;
  /** Unavailable, with a reason — greyed out rather than missing, so the UI stays stable. */
  readonly disabled?: boolean;
  readonly onSelect: () => void;
  /** Draw a divider above this item. */
  readonly separatorBefore?: boolean;
}

/** Where the menu is being opened from — decides which actions make sense. */
export type ActionContext = "squad" | "tactics" | "scouting" | "transfers";

export function usePlayerActions(
  playerId: string,
  context: ActionContext,
  onNavigate?: (screen: ScreenId, param?: string) => void,
): PlayerAction[] {
  const { t } = useApp();
  const { career, scout, addTarget, removeTarget } = useCareer();
  const fmt = useFormat();
  if (!career) return [];

  const name = career.playerName(playerId);
  const isMine = career.squad().some((e) => e.playerId === playerId);
  const isTarget = career.isTarget(playerId);
  const actions: PlayerAction[] = [];

  // Always first, and always present: the way out of any list into the player.
  if (onNavigate) {
    actions.push({
      id: "profile",
      label: t.viewProfile,
      icon: <User className="size-4" />,
      onSelect: () => onNavigate("player", playerId),
    });
  }

  if (isMine) {
    actions.push({
      id: "renew",
      label: t.renewContract,
      icon: <FileSignature className="size-4" />,
      separatorBefore: true,
      onSelect: () => onNavigate?.("player", playerId),
    });
  } else {
    const refusal = career.scoutRefusal(playerId);
    actions.push({
      id: "scout",
      label: t.scout,
      icon: <Eye className="size-4" />,
      separatorBefore: true,
      disabled: refusal !== null,
      onSelect: () => scout(playerId),
    });
    actions.push(
      isTarget
        ? {
            id: "untarget",
            label: t.removeAction,
            icon: <StarOff className="size-4" />,
            onSelect: () => removeTarget(playerId),
          }
        : {
            id: "target",
            label: t.addToTargets,
            icon: <Star className="size-4" />,
            onSelect: () => {
              addTarget(playerId);
              toast(fmt.t(t.addedToTargets, { name }));
            },
          },
    );
    if (context !== "transfers" && onNavigate) {
      actions.push({
        id: "offer",
        label: t.offerAction,
        icon: <ArrowRightLeft className="size-4" />,
        onSelect: () => onNavigate("transfers"),
      });
    }
  }

  return actions;
}
