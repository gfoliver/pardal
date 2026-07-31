import type { ReactNode } from "react";
import { ArrowRightLeft, Ban, Eye, FileSignature, Hash, Star, StarOff, Tag, User } from "lucide-react";
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

/**
 * Actions that need a dialog rather than a navigation.
 *
 * Supplied by `PlayerMenu`, which owns those dialogs — so every surface that
 * renders a player menu gets them without wiring anything, and there is still
 * only one place the action list is declared.
 */
export interface PlayerActionDialogs {
  readonly editShirtNumber?: () => void;
  readonly listForTransfer?: () => void;
  readonly offer?: () => void;
}

export function usePlayerActions(
  playerId: string,
  context: ActionContext,
  onNavigate?: (screen: ScreenId, param?: string) => void,
  dialogs?: PlayerActionDialogs,
): PlayerAction[] {
  const { t } = useApp();
  const { career, scout, addTarget, removeTarget, unlistPlayer } = useCareer();
  const fmt = useFormat();
  if (!career) return [];

  const name = career.playerName(playerId);
  const isMine = career.squad().some((e) => e.playerId === playerId);
  const isTarget = career.isTarget(playerId);
  const isListed = career.isListed(playerId);
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
    if (dialogs?.editShirtNumber) {
      actions.push({
        id: "shirt",
        label: t.changeShirtNumber,
        icon: <Hash className="size-4" />,
        onSelect: dialogs.editShirtNumber,
      });
    }
    // Putting a player on the list, or taking him back off, from wherever the manager
    // happens to be looking at him. Re-pricing goes through the same dialog, so a
    // listed player still offers it rather than only offering "unlist".
    if (dialogs?.listForTransfer) {
      actions.push({
        id: "list",
        label: isListed ? t.changeAskingPrice : t.listForTransfer,
        icon: <Tag className="size-4" />,
        onSelect: dialogs.listForTransfer,
      });
    }
    if (isListed) {
      actions.push({
        id: "unlist",
        label: t.unlistPlayer,
        icon: <Ban className="size-4" />,
        onSelect: () => {
          unlistPlayer(playerId);
          toast(fmt.t(t.unlistedPlayer, { name }));
        },
      });
    }
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
    /**
     * Bid for him, here, without leaving the screen.
     *
     * This used to navigate to Transfers and stop — which meant the primary thing you can
     * do to a rival's player was, in effect, unreachable from every screen that lists one:
     * the manager arrived at a shortlist that did not contain him and had nothing to click.
     */
    if (dialogs?.offer) {
      const refusal = career.offerRefusal(playerId, 1);
      actions.push({
        id: "offer",
        label: t.offerAction,
        icon: <ArrowRightLeft className="size-4" />,
        // Only "already bidding" and "not for sale" can be known before a fee is named;
        // whether it fits the budget depends on the number, so that is the dialog's job.
        disabled: refusal === "alreadyBidding" || refusal === "notForSale",
        onSelect: dialogs.offer,
      });
    }
  }

  return actions;
}
