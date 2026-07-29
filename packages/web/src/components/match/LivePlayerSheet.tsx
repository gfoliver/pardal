import { useState } from "react";
import { ArrowLeftRight, Repeat, User } from "lucide-react";
import { Position, rolesFor, type RoleKey } from "@fut/domain";
import type { AgentShape } from "@fut/spatial";
import { useApp } from "../../app/AppProviders";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Overall } from "../ui/game";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Sheet, SheetContent, SheetTitle } from "../ui/sheet";
import { Separator } from "../ui/separator";
import { groupBadge } from "../../lib/labels";
import { cn } from "../../lib/utils";
import { fitnessColor, usePosLabels } from "../tactics/pieces";
import type { ScreenId } from "../../layout/Shell";

/**
 * The tactics-board drawer, for a match that is RUNNING.
 *
 * Deliberately not the pre-match `SlotSheet` wearing a different hat. It looks and
 * feels the same on purpose, but the actions underneath are not the same actions and
 * pretending otherwise would hide the difference that matters: swapping two men who
 * are already on the pitch costs nothing and can be undone all afternoon, while
 * bringing a substitute on spends one of five and is permanent. Those two cannot sit
 * behind one button labelled "swap".
 *
 * So an on-pitch player offers both, separately and named for what they are, and the
 * substitution is refused outright when there are none left.
 */
export function LivePlayerSheet({
  shape,
  bench,
  selectedId,
  onClose,
  subsLeft,
  onPosition,
  onRole,
  onSwapOnPitch,
  onSubstitute,
  onNavigate,
}: {
  /** Everyone currently on the pitch for this side. */
  shape: readonly AgentShape[];
  /** Who is available to come on. */
  bench: readonly { id: string; name: string; position: string }[];
  /** The player being managed, or null when the drawer is shut. */
  selectedId: string | null;
  onClose: () => void;
  subsLeft: number;
  onPosition: (playerId: string, position: Position) => void;
  onRole: (playerId: string, roleKey: RoleKey) => void;
  /** Two men already on the pitch trade places — free, and reversible. */
  onSwapOnPitch: (aId: string, bId: string) => void;
  /** A substitute comes on for him — costs one of five, and is permanent. */
  onSubstitute: (outId: string, inId: string) => void;
  onNavigate?: (screen: ScreenId, param?: string) => void;
}) {
  const { t } = useApp();
  const { shortPos, posName, roleName } = usePosLabels();
  const [mode, setMode] = useState<"none" | "swap" | "sub">("none");

  const player = shape.find((p) => p.id === selectedId);
  const outfieldPositions = Object.values(Position).filter((p) => p !== Position.Goalkeeper);

  const close = () => {
    setMode("none");
    onClose();
  };

  /** Only a keeper for a keeper, either way round. */
  const sameKind = (isGk: boolean) => isGk === Boolean(player?.isGoalkeeper);
  const swapTargets = shape.filter((p) => p.id !== player?.id && sameKind(p.isGoalkeeper));
  const subTargets = bench.filter((p) => sameKind(p.position === Position.Goalkeeper));

  return (
    <Sheet open={selectedId !== null} onOpenChange={(o) => !o && close()}>
      <SheetContent side="bottom" className="gap-3 px-4 pb-5 pt-4">
        <SheetTitle srOnly>{player?.name ?? ""}</SheetTitle>
        {player && (
          <>
            <div className="flex items-center gap-3">
              <Badge variant={groupBadge(player.fielded)}>{shortPos(player.fielded)}</Badge>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-fg">{player.name}</div>
                <div className="flex flex-wrap items-center gap-x-2 text-2xs text-fg-muted">
                  <span>{posName(player.position as Position)}</span>
                  <span>
                    · {t.condition}{" "}
                    <b className="tabular-nums" style={{ color: fitnessColor(player.stamina * 100) }}>
                      {Math.round(player.stamina * 100)}
                    </b>
                  </span>
                  {Boolean(player.booked) && <span className="text-gold">· {player.booked}×</span>}
                </div>
              </div>
              <Overall value={player.overall} />
            </div>

            <Separator />

            {mode === "none" && (
              <>
                {!player.isGoalkeeper && (
                  <label className="flex flex-col gap-1">
                    <span className="text-2xs uppercase tracking-caps text-fg-faint">{t.position}</span>
                    <Select value={player.fielded} onValueChange={(v) => onPosition(player.id, v as Position)}>
                      <SelectTrigger><SelectValue>{posName(player.fielded as Position)}</SelectValue></SelectTrigger>
                      <SelectContent>
                        {outfieldPositions.map((p) => <SelectItem key={p} value={p}>{posName(p)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </label>
                )}
                <label className="flex flex-col gap-1">
                  <span className="text-2xs uppercase tracking-caps text-fg-faint">{t.role}</span>
                  <Select value={player.roleKey} onValueChange={(v) => onRole(player.id, v as RoleKey)}>
                    <SelectTrigger><SelectValue>{roleName(player.roleKey)}</SelectValue></SelectTrigger>
                    <SelectContent>
                      {rolesFor(player.fielded as Position).map((r) => (
                        <SelectItem key={r.key} value={r.key}>{roleName(r.key)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button variant="secondary" className="flex-1" onClick={() => setMode("swap")}>
                    <ArrowLeftRight />
                    {t.swapPlayers}
                  </Button>
                  {/* Named for what it costs, and refused when there is nothing left
                      to spend — a disabled button that says why beats a live one that
                      silently does nothing. */}
                  <Button
                    variant="primary"
                    className="flex-1"
                    disabled={subsLeft <= 0 || subTargets.length === 0}
                    title={subsLeft <= 0 ? t.noSubsLeft : undefined}
                    onClick={() => setMode("sub")}
                  >
                    <Repeat />
                    {t.substitute} ({subsLeft})
                  </Button>
                  {onNavigate && (
                    <Button variant="ghost" className="flex-1" onClick={() => { onNavigate("player", player.id); close(); }}>
                      <User />
                      {t.viewProfile}
                    </Button>
                  )}
                </div>
              </>
            )}

            {mode !== "none" && (
              <>
                <span className="text-2xs uppercase tracking-caps text-fg-faint">
                  {mode === "swap" ? t.swapPlayers : t.substitute}
                </span>
                <div className="flex max-h-[45vh] flex-col overflow-y-auto">
                  {(mode === "swap" ? swapTargets : subTargets).length === 0 && (
                    <p className="py-3 text-center text-sm text-fg-muted">—</p>
                  )}
                  {mode === "swap" &&
                    swapTargets.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => { onSwapOnPitch(player.id, p.id); close(); }}
                        className="flex items-center gap-2.5 border-b border-hairline py-2 text-left outline-none last:border-0 hover:bg-surface-2 focus-visible:bg-surface-2"
                      >
                        <Badge variant={groupBadge(p.fielded)} className="shrink-0">{shortPos(p.fielded)}</Badge>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{p.name}</span>
                        <span className="shrink-0 text-2xs tabular-nums" style={{ color: fitnessColor(p.stamina * 100) }}>
                          {Math.round(p.stamina * 100)}
                        </span>
                        <Overall value={p.overall} />
                      </button>
                    ))}
                  {mode === "sub" &&
                    subTargets.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => { onSubstitute(player.id, p.id); close(); }}
                        className="flex items-center gap-2.5 border-b border-hairline py-2 text-left outline-none last:border-0 hover:bg-surface-2 focus-visible:bg-surface-2"
                      >
                        <Badge variant={groupBadge(p.position)} className="shrink-0">{shortPos(p.position)}</Badge>
                        <span className={cn("min-w-0 flex-1 truncate text-sm font-medium text-fg")}>{p.name}</span>
                      </button>
                    ))}
                </div>
                <Button variant="ghost" className="self-start" onClick={() => setMode("none")}>
                  {t.back}
                </Button>
              </>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
