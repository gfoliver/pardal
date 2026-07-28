import { useState } from "react";
import { ArrowLeftRight, User } from "lucide-react";
import { Position, rolesFor, type RoleKey } from "@fut/domain";
import type { TacticsPlayer, TacticsSlot } from "@fut/career";
import { useApp } from "../../app/AppProviders";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Overall } from "../ui/game";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Sheet, SheetContent, SheetTitle } from "../ui/sheet";
import { Separator } from "../ui/separator";
import { groupBadge } from "../../lib/labels";
import { cn } from "../../lib/utils";
import { fitColor, fitnessColor, usePosLabels } from "./pieces";
import type { ScreenId } from "../../layout/Shell";

/**
 * The starting eleven on a phone.
 *
 * The table this replaces below `md` needed 721px to show its eight columns, so at
 * 375 it was a horizontal scroll with the useful parts off-screen. A row here
 * carries only what you SCAN by — the slot, who is in it, how well he suits it and
 * how good he is — and everything you EDIT moves into a drawer, which is also the
 * only place with room for it.
 *
 * The drawer doubles as the substitution picker on purpose. Swapping two players
 * is otherwise "tap one, then tap the other", and those two taps live in different
 * scrolling regions (the pitch, the substitutes' grid, the rest of the squad): on a
 * phone that means select, scroll, and hope the selection survived. Choosing the
 * replacement from a list inside the same panel is one gesture with nothing hidden.
 */
export function LineupList({
  slots,
  bench,
  reserves,
  nameOf,
  onChangePosition,
  onChangeRole,
  onSwap,
  onNavigate,
}: {
  slots: readonly TacticsSlot[];
  /** Who can come IN: the matchday substitutes first, then the rest of the squad. */
  bench: readonly TacticsPlayer[];
  reserves: readonly TacticsPlayer[];
  nameOf: (playerId: string, fallback: string) => string;
  onChangePosition: (slot: number, position: Position) => void;
  onChangeRole: (playerId: string, roleKey: RoleKey) => void;
  /** Put `playerId` into `slot` — the career command handles the swap either way. */
  onSwap: (slot: number, playerId: string) => void;
  onNavigate?: (screen: ScreenId, param?: string) => void;
}) {
  const { t } = useApp();
  const { shortPos, posName, roleName } = usePosLabels();
  const [openSlot, setOpenSlot] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);

  const slot = slots.find((s) => s.slot === openSlot);
  const player = slot?.player;
  const isKeeperSlot = slot?.position === Position.Goalkeeper || player?.position === Position.Goalkeeper;
  const outfieldPositions = Object.values(Position).filter((p) => p !== Position.Goalkeeper);

  const close = () => {
    setOpenSlot(null);
    setPicking(false);
  };

  /** Only a keeper can replace a keeper, and only an outfielder an outfielder. */
  const candidates = [...bench, ...reserves].filter(
    (p) => (p.position === Position.Goalkeeper) === Boolean(isKeeperSlot),
  );

  return (
    <>
      <ul className="flex flex-col">
        {slots.map((s) => (
          <li key={s.slot}>
            <button
              type="button"
              onClick={() => setOpenSlot(s.slot)}
              className="flex w-full items-center gap-2.5 border-b border-hairline py-2 text-left outline-none transition-colors last:border-0 hover:bg-surface-2 focus-visible:bg-surface-2"
            >
              <Badge variant={groupBadge(s.position)} className="shrink-0">{shortPos(s.position)}</Badge>
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-sm font-medium text-fg", s.player?.injured && "text-fg-faint line-through")}>
                  {s.player ? nameOf(s.player.playerId, s.player.name) : "—"}
                </span>
                <span className="block truncate text-2xs text-fg-muted">{roleName(s.role)}</span>
              </span>
              {s.fit !== undefined && (
                <span className="shrink-0 text-xs font-bold tabular-nums" style={{ color: fitColor(s.fit) }}>
                  {Math.round(s.fit * 100)}
                </span>
              )}
              {s.player && <Overall value={s.player.overall} />}
            </button>
          </li>
        ))}
      </ul>

      <Sheet open={openSlot !== null} onOpenChange={(o) => !o && close()}>
        <SheetContent side="bottom" className="gap-3 px-4 pb-5 pt-4">
          <SheetTitle srOnly>{player ? player.name : t.lineupTab}</SheetTitle>
          {slot && (
            <>
              <div className="flex items-center gap-3">
                <Badge variant={groupBadge(slot.position)}>{shortPos(slot.position)}</Badge>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-fg">
                    {player ? nameOf(player.playerId, player.name) : "—"}
                  </div>
                  {player && (
                    <div className="flex flex-wrap items-center gap-x-2 text-2xs text-fg-muted">
                      <span>{posName(player.position as Position)}</span>
                      {player.secondaryPositions.length > 0 && (
                        <span>· {player.secondaryPositions.map((p) => shortPos(p)).join(", ")}</span>
                      )}
                      <span>
                        · {t.condition}{" "}
                        <b className="tabular-nums" style={{ color: fitnessColor(player.fitness) }}>{Math.round(player.fitness)}</b>
                      </span>
                    </div>
                  )}
                </div>
                {player && <Overall value={player.overall} />}
              </div>

              <Separator />

              {picking ? (
                /* The replacement, chosen right here rather than by hunting for a
                   second tap in another part of the screen. */
                <div className="flex max-h-[45vh] flex-col overflow-y-auto">
                  {candidates.length === 0 && <p className="py-3 text-center text-sm text-fg-muted">—</p>}
                  {candidates.map((p) => (
                    <button
                      key={p.playerId}
                      type="button"
                      onClick={() => {
                        onSwap(slot.slot, p.playerId);
                        close();
                      }}
                      className="flex items-center gap-2.5 border-b border-hairline py-2 text-left outline-none last:border-0 hover:bg-surface-2 focus-visible:bg-surface-2"
                    >
                      <Badge variant={groupBadge(p.position)} className="shrink-0">{shortPos(p.position)}</Badge>
                      <span className={cn("min-w-0 flex-1 truncate text-sm font-medium text-fg", p.injured && "text-fg-faint line-through")}>
                        {nameOf(p.playerId, p.name)}
                      </span>
                      <span className="shrink-0 text-2xs tabular-nums" style={{ color: fitnessColor(p.fitness) }}>
                        {Math.round(p.fitness)}
                      </span>
                      <Overall value={p.overall} />
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  {/* A keeper's slot is not a choice, so it is not offered as one. */}
                  {player && !isKeeperSlot && (
                    <label className="flex flex-col gap-1">
                      <span className="text-2xs uppercase tracking-caps text-fg-faint">{t.position}</span>
                      <Select value={slot.position} onValueChange={(v) => onChangePosition(slot.slot, v as Position)}>
                        <SelectTrigger><SelectValue>{posName(slot.position as Position)}</SelectValue></SelectTrigger>
                        <SelectContent>
                          {outfieldPositions.map((p) => <SelectItem key={p} value={p}>{posName(p)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </label>
                  )}
                  {player && (
                    <label className="flex flex-col gap-1">
                      <span className="text-2xs uppercase tracking-caps text-fg-faint">{t.role}</span>
                      <Select value={slot.role} onValueChange={(v) => onChangeRole(player.playerId, v as RoleKey)}>
                        <SelectTrigger><SelectValue>{roleName(slot.role)}</SelectValue></SelectTrigger>
                        <SelectContent>
                          {rolesFor(slot.position as Position).map((r) => (
                            <SelectItem key={r.key} value={r.key}>{roleName(r.key)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button variant="secondary" className="flex-1" onClick={() => setPicking(true)}>
                      <ArrowLeftRight />
                      {t.swapPlayers}
                    </Button>
                    {player && onNavigate && (
                      <Button variant="ghost" className="flex-1" onClick={() => { onNavigate("player", player.playerId); close(); }}>
                        <User />
                        {t.viewProfile}
                      </Button>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
