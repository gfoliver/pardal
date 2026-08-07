import { useState, type ReactNode } from "react";
import { ArrowLeftRight, ChevronRight, User } from "lucide-react";
import { Position, rolesFor, type RoleKey } from "@fut/domain";
import type { TacticsPlayer, TacticsSlot } from "@fut/career";
import { useApp } from "../../app/AppProviders";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Flag } from "../ui/flag";
import { Overall } from "../ui/game";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Sheet, SheetContent, SheetTitle } from "../ui/sheet";
import { Separator } from "../ui/separator";
import { groupBadge } from "../../lib/labels";
import { cn } from "../../lib/utils";
import { fitColor, fitnessColor, usePosLabels } from "./pieces";
import type { ScreenId } from "../../layout/Shell";

/** Nothing to show. Never a zero: an empty slot has no rating, an unknown fit is not a bad fit. */
const Dash = () => <span className="text-fg-faint">—</span>;

/** One line of a drawer's fact list — the same `<dl>` row the data layer's detail sheet draws. */
function SheetField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-hairline py-1.5 last:border-0">
      <dt className="min-w-0 shrink text-xs text-fg-muted">{label}</dt>
      <dd className="shrink-0 text-right text-sm text-fg">{value}</dd>
    </div>
  );
}

/**
 * The starting eleven on a phone.
 *
 * The table this replaces below `md` needs the better part of 800px for its columns, so at 375 it
 * was a horizontal scroll with the useful parts off-screen. A card here
 * carries only what you SCAN by — the slot, who is in it, how well he suits it and
 * how good he is — and everything you EDIT moves into a drawer, which is also the
 * only place with room for it.
 *
 * Built to the shape the data layer settled on for a narrow screen: the identity on a line of its
 * own where it has room, then a FIXED strip of three labelled fields underneath so the third value
 * down is the same field on every card and the list stays scannable by column.
 *
 * One departure from `CardList`, deliberate. There the chevron is a separate control because the
 * card has two destinations — the name is a link to the profile, the chevron opens the details — and
 * a whole-card click would swallow one of them. Here there is exactly ONE destination: the slot's
 * drawer, which is this board's single gesture. So the card is one button and the chevron is the
 * affordance ON it, rather than a second control that happens to do the same thing.
 *
 * The drawer doubles as the substitution picker on purpose. Swapping two players
 * is otherwise "tap one, then tap the other", and those two taps live in different
 * scrolling regions (the pitch, the substitutes' grid, the rest of the squad): on a
 * phone that means select, scroll, and hope the selection survived. Choosing the
 * replacement from a list inside the same panel is one gesture with nothing hidden.
 */
export function LineupList({
  slots,
  nameOf,
  onOpenSlot,
}: {
  slots: readonly TacticsSlot[];
  nameOf: (playerId: string, fallback: string) => string;
  /** Tapping a card asks the screen to open the editing drawer for that slot. */
  onOpenSlot: (slot: number) => void;
}) {
  const { t } = useApp();
  const { shortPos, roleName } = usePosLabels();
  /** Three, like the grid's cards. A fourth turns the strip into a paragraph on a 375px screen. */
  const fieldsOf = (s: TacticsSlot): { label: string; value: ReactNode }[] => [
    { label: t.role, value: s.player ? roleName(s.role) : <Dash /> },
    {
      label: t.fitShort,
      value:
        s.fit !== undefined ? (
          <span className="font-semibold tabular-nums" style={{ color: fitColor(s.fit) }}>{Math.round(s.fit * 100)}</span>
        ) : (
          <Dash />
        ),
    },
    {
      label: t.condition,
      value: s.player ? (
        <span className="font-semibold tabular-nums" style={{ color: fitnessColor(s.player.fitness) }}>{Math.round(s.player.fitness)}</span>
      ) : (
        <Dash />
      ),
    },
  ];

  return (
    <ul className="flex flex-col gap-1.5">
      {slots.map((s) => (
        <li key={s.slot}>
          <button
            type="button"
            onClick={() => onOpenSlot(s.slot)}
            className="flex w-full items-stretch gap-2 rounded-lg border border-border bg-surface px-2.5 py-2 text-left outline-none transition-colors hover:bg-surface-2 focus-visible:bg-surface-2"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="flex items-center gap-2">
                <Badge variant={groupBadge(s.position)} className="shrink-0">{shortPos(s.position)}</Badge>
                <span className={cn("min-w-0 flex-1 truncate text-sm font-medium text-fg", s.player?.injured && "text-fg-faint line-through")}>
                  {s.player ? nameOf(s.player.playerId, s.player.name) : <Dash />}
                </span>
                {/* Absent for a player nobody has numbered — omitted, never printed as a zero. */}
                {s.player?.shirtNumber !== undefined && (
                  <span className="shrink-0 text-2xs tabular-nums text-fg-faint">#{s.player.shirtNumber}</span>
                )}
                {s.player && <Overall value={s.player.overall} size="sm" />}
              </span>
              <span className="grid grid-cols-3 gap-x-2">
                {fieldsOf(s).map((f) => (
                  <span key={f.label} className="block min-w-0">
                    <span className="caps block truncate text-2xs text-fg-faint">{f.label}</span>
                    <span className="block truncate text-xs text-fg-muted">{f.value}</span>
                  </span>
                ))}
              </span>
            </span>
            {/* Full height, so the chevron reads as "the whole card opens" rather than as a target of
                its own — see the note above on why it is not a second control. */}
            <span className="-mr-1 grid w-6 shrink-0 place-items-center text-fg-faint">
              <ChevronRight className="size-4" />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * The editing drawer for one slot, opened from the LIST or from the shirt on the
 * PITCH — the same panel either way, because they are the same job. On the board a
 * tap has to mean one thing at a time, so below `md` it opens this and above it it
 * picks the player up to swap (see `useCompactLayout`).
 */
export function SlotSheet({
  slots,
  openSlot,
  onClose,
  bench,
  reserves,
  nameOf,
  onChangePosition,
  onChangeRole,
  onSwap,
  fitAt,
  onNavigate,
}: {
  slots: readonly TacticsSlot[];
  /** The slot being edited, or null when the drawer is shut. */
  openSlot: number | null;
  onClose: () => void;
  /** Who can come IN: the matchday substitutes first, then the rest of the squad. */
  bench: readonly TacticsPlayer[];
  reserves: readonly TacticsPlayer[];
  nameOf: (playerId: string, fallback: string) => string;
  onChangePosition: (slot: number, position: Position) => void;
  onChangeRole: (playerId: string, roleKey: RoleKey) => void;
  /** Put `playerId` into `slot` — the career command handles the swap either way. */
  onSwap: (slot: number, playerId: string) => void;
  /** How well a player would suit a position, 0..1 — what the list is ranked by. */
  fitAt: (playerId: string, position: Position) => number | undefined;
  onNavigate?: (screen: ScreenId, param?: string) => void;
}) {
  const { t } = useApp();
  const { shortPos, posName, roleName } = usePosLabels();
  const [picking, setPicking] = useState(false);

  const slot = slots.find((s) => s.slot === openSlot);
  const player = slot?.player;
  const isKeeperSlot = slot?.position === Position.Goalkeeper || player?.position === Position.Goalkeeper;
  const outfieldPositions = Object.values(Position).filter((p) => p !== Position.Goalkeeper);

  const close = () => {
    setPicking(false);
    onClose();
  };

  /**
   * Only a keeper can replace a keeper, and only an outfielder an outfielder — and
   * BEST FIT FIRST, because the question a replacement list answers is "who can
   * actually play here", not "who happens to be on the bench in this order". The
   * number rides along on each row so the ranking explains itself.
   */
  const candidates = [...bench, ...reserves]
    .filter((p) => (p.position === Position.Goalkeeper) === Boolean(isKeeperSlot))
    .map((p) => ({ p, fit: slot ? fitAt(p.playerId, slot.position as Position) : undefined }))
    .sort((a, b) => (b.fit ?? -1) - (a.fit ?? -1));

  return (
    <>
      <Sheet open={openSlot !== null} onOpenChange={(o) => !o && close()}>
        <SheetContent side="bottom" className="gap-3 px-4 pb-5 pt-4">
          <SheetTitle srOnly>{player ? player.name : t.lineupTab}</SheetTitle>
          {slot && (
            <>
              <div className="flex items-center gap-3">
                <Badge variant={groupBadge(slot.position)}>{shortPos(slot.position)}</Badge>
                <div className="min-w-0 flex-1">
                  <div className={cn("truncate font-semibold text-fg", player?.injured && "text-fg-faint line-through")}>
                    {player ? nameOf(player.playerId, player.name) : <Dash />}
                  </div>
                  {player?.shirtNumber !== undefined && (
                    <div className="text-2xs tabular-nums text-fg-faint">#{player.shirtNumber}</div>
                  )}
                </div>
                {player && <Overall value={player.overall} />}
              </div>

              {/* Every field the card could not fit, which is why the card can afford to show three.
                  Age and nationality reach the desktop table and used to stop there — on a phone the
                  table is gone, so this is the only place they exist at all. */}
              {player && !picking && (
                <dl className="flex flex-col">
                  <SheetField label={t.position} value={posName(player.position as Position)} />
                  <SheetField
                    label={t.alsoPlays}
                    value={
                      player.secondaryPositions.length > 0 ? (
                        <span className="flex justify-end gap-1">
                          {player.secondaryPositions.map((p) => <Badge key={p} variant="muted">{shortPos(p)}</Badge>)}
                        </span>
                      ) : (
                        <Dash />
                      )
                    }
                  />
                  <SheetField
                    label={t.tacPositionalFit}
                    value={
                      slot.fit !== undefined ? (
                        <span className="font-semibold tabular-nums" style={{ color: fitColor(slot.fit) }}>{Math.round(slot.fit * 100)}</span>
                      ) : (
                        <Dash />
                      )
                    }
                  />
                  <SheetField
                    label={t.condition}
                    value={
                      <span className="font-semibold tabular-nums" style={{ color: fitnessColor(player.fitness) }}>
                        {Math.round(player.fitness)}
                      </span>
                    }
                  />
                  <SheetField label={t.age} value={<span className="tabular-nums">{player.age}</span>} />
                  <SheetField label={t.nationality} value={<Flag nationality={player.nationality} />} />
                </dl>
              )}

              <Separator />

              {picking ? (
                /* The replacement, chosen right here rather than by hunting for a
                   second tap in another part of the screen. */
                <div className="flex max-h-[45vh] flex-col overflow-y-auto">
                  {candidates.length === 0 && (
                    <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-fg-muted">
                      {t.tacNoReplacement}
                    </p>
                  )}
                  {candidates.map(({ p, fit }) => (
                    <button
                      key={p.playerId}
                      type="button"
                      onClick={() => {
                        onSwap(slot.slot, p.playerId);
                        close();
                      }}
                      className="flex items-center gap-2 border-b border-hairline px-2 py-1.5 text-left outline-none last:border-0 hover:bg-surface-2 focus-visible:bg-surface-2"
                    >
                      <Badge variant={groupBadge(p.position)} className="shrink-0">{shortPos(p.position)}</Badge>
                      <span className={cn("min-w-0 flex-1 truncate text-sm font-medium text-fg", p.injured && "text-fg-faint line-through")}>
                        {nameOf(p.playerId, p.name)}
                      </span>
                      {p.shirtNumber !== undefined && (
                        <span className="shrink-0 text-2xs tabular-nums text-fg-faint">#{p.shirtNumber}</span>
                      )}
                      {fit !== undefined && (
                        <span className="shrink-0 text-xs font-bold tabular-nums" style={{ color: fitColor(fit) }}>
                          {Math.round(fit * 100)}
                        </span>
                      )}
                      <Overall value={p.overall} size="sm" />
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  {/* A keeper's slot is not a choice, so it is not offered as one. */}
                  {player && !isKeeperSlot && (
                    <label className="flex flex-col gap-1">
                      <span className="caps text-fg-faint">{t.position}</span>
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
                      <span className="caps text-fg-faint">{t.role}</span>
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

/**
 * The mirror of {@link SlotSheet}: a substitute or a squad player was tapped, so the
 * question is which of the eleven he takes. Same panel, same one-gesture rule — the
 * alternative was the old "tap him, then go and find a shirt to tap", which is the
 * two-region hunt this whole drawer exists to remove.
 */
export function IncomingSheet({
  slots,
  player,
  onClose,
  nameOf,
  onSwap,
  fitAt,
  onNavigate,
}: {
  slots: readonly TacticsSlot[];
  /** The player coming in, or null when the drawer is shut. */
  player: TacticsPlayer | null;
  onClose: () => void;
  nameOf: (playerId: string, fallback: string) => string;
  onSwap: (slot: number, playerId: string) => void;
  /** How well a player would suit a position, 0..1 — what the list is ranked by. */
  fitAt: (playerId: string, position: Position) => number | undefined;
  onNavigate?: (screen: ScreenId, param?: string) => void;
}) {
  const { t } = useApp();
  const { shortPos, posName, roleName } = usePosLabels();
  const isKeeper = player?.position === Position.Goalkeeper;
  // A keeper can only take the keeper's slot, and nobody else can. Ordered by where
  // HE fits best, which is the entire question when you tap a substitute.
  const takeable = slots
    .filter((s) => (s.position === Position.Goalkeeper || s.player?.position === Position.Goalkeeper) === Boolean(isKeeper))
    .map((s) => ({ s, fit: player ? fitAt(player.playerId, s.position as Position) : undefined }))
    .sort((a, b) => (b.fit ?? -1) - (a.fit ?? -1));

  return (
    <Sheet open={player !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="gap-3 px-4 pb-5 pt-4">
        <SheetTitle srOnly>{player?.name ?? ""}</SheetTitle>
        {player && (
          <>
            <div className="flex items-center gap-3">
              <Badge variant={groupBadge(player.position)}>{shortPos(player.position)}</Badge>
              <div className="min-w-0 flex-1">
                <div className={cn("truncate font-semibold text-fg", player.injured && "text-fg-faint line-through")}>
                  {nameOf(player.playerId, player.name)}
                </div>
                {player.shirtNumber !== undefined && (
                  <div className="text-2xs tabular-nums text-fg-faint">#{player.shirtNumber}</div>
                )}
              </div>
              <Overall value={player.overall} />
            </div>

            <dl className="flex flex-col">
              <SheetField label={t.position} value={posName(player.position as Position)} />
              <SheetField
                label={t.alsoPlays}
                value={
                  player.secondaryPositions.length > 0 ? (
                    <span className="flex justify-end gap-1">
                      {player.secondaryPositions.map((p) => <Badge key={p} variant="muted">{shortPos(p)}</Badge>)}
                    </span>
                  ) : (
                    <Dash />
                  )
                }
              />
              <SheetField
                label={t.condition}
                value={
                  <span className="font-semibold tabular-nums" style={{ color: fitnessColor(player.fitness) }}>
                    {Math.round(player.fitness)}
                  </span>
                }
              />
              <SheetField label={t.age} value={<span className="tabular-nums">{player.age}</span>} />
              <SheetField label={t.nationality} value={<Flag nationality={player.nationality} />} />
            </dl>

            {onNavigate && (
              <Button
                variant="ghost"
                className="self-start"
                onClick={() => { onNavigate("player", player.playerId); onClose(); }}
              >
                <User />
                {t.viewProfile}
              </Button>
            )}

            <Separator />
            <span className="caps text-fg-faint">{t.swapPlayers}</span>
            <div className="flex max-h-[45vh] flex-col overflow-y-auto">
              {takeable.map(({ s, fit }) => (
                <button
                  key={s.slot}
                  type="button"
                  onClick={() => { onSwap(s.slot, player.playerId); onClose(); }}
                  className="flex items-center gap-2 border-b border-hairline px-2 py-1.5 text-left outline-none last:border-0 hover:bg-surface-2 focus-visible:bg-surface-2"
                >
                  <Badge variant={groupBadge(s.position)} className="shrink-0">{shortPos(s.position)}</Badge>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">
                      {s.player ? nameOf(s.player.playerId, s.player.name) : <Dash />}
                    </span>
                    <span className="block truncate text-2xs text-fg-muted">{roleName(s.role)}</span>
                  </span>
                  {fit !== undefined && (
                    <span className="shrink-0 text-xs font-bold tabular-nums" style={{ color: fitColor(fit) }}>
                      {Math.round(fit * 100)}
                    </span>
                  )}
                  {s.player && <Overall value={s.player.overall} size="sm" />}
                </button>
              ))}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
