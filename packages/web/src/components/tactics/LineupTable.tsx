import * as React from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Position, rolesFor, type RoleKey } from "@fut/domain";
import type { TacticsSlot } from "@fut/career";
import { useApp } from "../../app/AppProviders";
import { Abbrev } from "../ui/abbrev";
import { Badge } from "../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Overall } from "../ui/game";
import { Flag } from "../ui/flag";
import { fitColor, usePosLabels } from "./pieces";
import { groupBadge } from "../../lib/labels";
import { PlayerContextMenu } from "../career/PlayerMenu";
import type { ScreenId } from "../../layout/Shell";
import { cn } from "../../lib/utils";

/** Nothing to show. Never a zero — an empty slot has no rating, and an unknown fit is not a bad one. */
const Dash = () => <span className="text-fg-faint">—</span>;

/**
 * One column of the lineup table. Sortable only where `sortValue` is given — a cell holding a
 * dropdown has nothing to sort by.
 */
interface Column {
  readonly key: string;
  readonly header: string;
  /** Spelled out for the header's tooltip where the header itself is an abbreviation. */
  readonly longHeader?: string;
  readonly align?: "center";
  readonly sortValue?: (s: TacticsSlot) => number | string;
  cell(s: TacticsSlot): React.ReactNode;
}

/**
 * The starting XI as a sortable table — same information as the pitch, laid
 * out for scanning and comparing rather than for spatial reading. Shares
 * selection with the pitch (clicking a row is the same as tapping the shirt),
 * and edits the position and role inline without leaving the table.
 *
 * NOT built on `components/data`, deliberately, and this is the one table in the app that should not
 * be. That kit exists to make a long list searchable, filterable and cheap to scroll; this is eleven
 * fixed rows, so it gains nothing from any of it. What it needs instead is the thing the kit
 * deliberately does not have: a click anywhere on the row SELECTS that slot, because the row is a
 * shirt on the pitch and selection is shared with it. In the shared grid that behaviour swallowed
 * menus and dialogs and had to go; here it is the entire point, the row holds two dropdowns that stop
 * their own clicks, and it is eleven rows of local code rather than a prop on something twenty
 * screens use.
 *
 * IT IS ALSO NOT SHAPED LIKE ONE, and that is the whole point of this layout. Borrowing the grid's
 * vocabulary — fixed pixel column widths, `table-fixed`, the position and the name sticky-pinned while
 * the remaining columns slid under them — pushed it to about 790px, which is wider than the space it
 * has at the `md` breakpoint where it appears. So eleven players could no longer be read at a glance:
 * you scrolled sideways past two frozen columns to find the rating. An XI is a fixed, small, complete
 * thing, and it should be visible all at once. Auto layout over the shared `ui/table`, every column
 * sized to its own contents, no pinning, no sideways scroll. The shirt-number column went with it —
 * the number is already on the shirt on the pitch, in the phone's card list and in the slot's drawer,
 * and it was the ninth column that made eight not fit.
 *
 * What the same change got RIGHT is kept, because it was about honesty rather than looks: an absent
 * value renders as a dash in the faint ink instead of a zero, and it SORTS as `-Infinity` rather than
 * as `0` or `-1`, which used to rank an unmeasured player among the worst measured ones.
 */
export function LineupTable({
  slots,
  nameOf,
  onSelectSlot,
  onChangeRole,
  onChangePosition,
  onNavigate,
}: {
  slots: readonly TacticsSlot[];
  nameOf: (playerId: string, fallback: string) => string;
  /**
   * Tapping a row opens that slot's drawer. There is no persistent "selected row", and there was
   * never meant to be: the drawer IS the selection, which is the single gesture this board is built
   * on. A `selectedSlot` prop used to sit beside this one, driving a highlight — and every caller
   * there has ever been passed a literal `null`, so the highlight never once appeared. Removed rather
   * than wired up, because a highlighted row plus an open drawer would be two indicators competing to
   * say the same thing.
   */
  onSelectSlot: (slot: number) => void;
  onChangeRole: (playerId: string, roleKey: RoleKey) => void;
  onChangePosition: (slot: number, position: Position) => void;
  onNavigate?: (screen: ScreenId, param?: string) => void;
}) {
  const { t } = useApp();
  const { shortPos, posName, roleName } = usePosLabels();
  const [sort, setSort] = React.useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const outfieldPositions = Object.values(Position).filter((p) => p !== Position.Goalkeeper);
  /*
   * `w-full min-w-[…]` on both dropdowns rather than a fixed width: the minimum is the column's floor
   * so auto layout cannot squeeze a select down to its chevron, and `w-full` lets it take the slack
   * when the table has room. The label truncates inside it — the full text is in the open list, and a
   * select that grows to its longest option would set the width of the whole table.
   */
  const triggerText = "[&>span]:min-w-0 [&>span]:truncate";
  const columns: Column[] = [
    {
      key: "pos",
      header: t.position,
      align: "center",
      cell: (s) => {
        // A keeper's slot isn't a choice — only a keeper can take it, so it stays a badge.
        const isKeeperSlot = s.player?.position === Position.Goalkeeper || s.position === Position.Goalkeeper;
        if (isKeeperSlot || !s.player) {
          return <Abbrev full={posName(s.position)} asChild><Badge variant={groupBadge(s.position)}>{shortPos(s.position)}</Badge></Abbrev>;
        }
        return (
          <Select value={s.position} onValueChange={(v) => onChangePosition(s.slot, v as Position)}>
            <SelectTrigger className={cn("h-7 w-full min-w-[4.5rem] px-2 text-xs", triggerText)} onClick={(e) => e.stopPropagation()}>
              <SelectValue>{shortPos(s.position)}</SelectValue>
            </SelectTrigger>
            {/* The trigger only shows an abbreviation, so the list must size to
                its own (much longer) labels rather than to the trigger. */}
            <SelectContent className="w-auto min-w-[13rem]" onClick={(e) => e.stopPropagation()}>
              {outfieldPositions.map((p) => <SelectItem key={p} value={p}>{posName(p)}</SelectItem>)}
            </SelectContent>
          </Select>
        );
      },
    },
    {
      key: "fit",
      header: t.fitShort,
      longHeader: t.tacPositionalFit,
      align: "center",
      sortValue: (s) => s.fit ?? Number.NEGATIVE_INFINITY,
      cell: (s) =>
        s.fit !== undefined ? (
          <span className="font-bold tabular-nums" style={{ color: fitColor(s.fit) }}>{Math.round(s.fit * 100)}</span>
        ) : (
          <Dash />
        ),
    },
    {
      key: "name",
      header: t.player,
      sortValue: (s) => (s.player ? nameOf(s.player.playerId, s.player.name) : ""),
      cell: (s) =>
        s.player ? (
          <span className={cn("font-medium text-fg", s.player.injured && "text-fg-faint line-through")}>
            {nameOf(s.player.playerId, s.player.name)}
          </span>
        ) : (
          <Dash />
        ),
    },
    {
      // A player's OWN position and the others he is natural in. The slot's
      // position is already the first column, and the two are different questions:
      // that one is where he is being asked to play, this one is what he is.
      key: "natural",
      header: t.alsoPlays,
      align: "center",
      sortValue: (s) => s.player?.secondaryPositions.length ?? Number.NEGATIVE_INFINITY,
      cell: (s) =>
        s.player ? (
          <span className="flex items-center justify-center gap-1">
            <Abbrev full={posName(s.player.position as Position)} asChild>
              <Badge variant={groupBadge(s.player.position)}>{shortPos(s.player.position)}</Badge>
            </Abbrev>
            {s.player.secondaryPositions.map((p) => (
              // Muted, so a second position never reads as loudly as the real one.
              <Abbrev key={p} full={posName(p as Position)} asChild>
                <Badge variant="muted">{shortPos(p)}</Badge>
              </Abbrev>
            ))}
          </span>
        ) : (
          <Dash />
        ),
    },
    {
      key: "role",
      header: t.role,
      cell: (s) =>
        s.player ? (
          <Select value={s.role} onValueChange={(v) => onChangeRole(s.player!.playerId, v as RoleKey)}>
            <SelectTrigger className={cn("h-7 w-full min-w-[8rem] px-2 text-xs", triggerText)} onClick={(e) => e.stopPropagation()}>
              <SelectValue>{roleName(s.role)}</SelectValue>
            </SelectTrigger>
            <SelectContent className="w-auto min-w-[14rem]" onClick={(e) => e.stopPropagation()}>
              {rolesFor(s.position as Position).map((r) => <SelectItem key={r.key} value={r.key}>{roleName(r.key)}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <Dash />
        ),
    },
    {
      key: "overall",
      header: t.overall,
      align: "center",
      sortValue: (s) => s.player?.overall ?? Number.NEGATIVE_INFINITY,
      // `sm`, so eleven rows stay compact — the badge is read here, not admired.
      cell: (s) => (s.player ? <Overall value={s.player.overall} size="sm" /> : <Dash />),
    },
    {
      key: "age",
      header: t.age,
      align: "center",
      sortValue: (s) => s.player?.age ?? Number.NEGATIVE_INFINITY,
      cell: (s) => (s.player ? <span className="tabular-nums text-fg-muted">{s.player.age}</span> : <Dash />),
    },
    {
      key: "nat",
      header: t.nationalityShort,
      longHeader: t.nationality,
      align: "center",
      cell: (s) => (s.player ? <Flag nationality={s.player.nationality} /> : <Dash />),
    },
  ];

  /*
   * Formation order unless the manager asked otherwise — that is the order the pitch reads in, and
   * the two are meant to be the same list. Sorted by index as a tiebreak so equal values keep it.
   */
  const rows = React.useMemo(() => {
    const col = sort && columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return slots;
    const sign = sort!.dir === "asc" ? 1 : -1;
    return [...slots]
      .map((s, i) => ({ s, i, v: col.sortValue!(s) }))
      .sort((a, b) => {
        const c = typeof a.v === "number" && typeof b.v === "number" ? a.v - b.v : String(a.v).localeCompare(String(b.v));
        return c * sign || a.i - b.i;
      })
      .map((e) => e.s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, sort]);

  /** Desc, then asc, then back to formation order. */
  const toggle = (key: string) =>
    setSort((cur) => (cur?.key !== key ? { key, dir: "desc" } : cur.dir === "desc" ? { key, dir: "asc" } : null));

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((c) => {
            const sorted = sort?.key === c.key;
            return (
              <TableHead
                key={c.key}
                scope="col"
                // On the cell, which is where a screen reader looks for it — not on the button inside.
                aria-sort={sorted ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}
                className={c.align === "center" ? "text-center" : undefined}
              >
                {c.sortValue ? (
                  <button
                    type="button"
                    onClick={() => toggle(c.key)}
                    title={c.longHeader ?? c.header}
                    className={cn(
                      "inline-flex items-center gap-1 outline-none hover:text-fg focus-visible:text-fg",
                      sorted && "text-fg",
                    )}
                  >
                    {c.header}
                    {sorted && (sort!.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                  </button>
                ) : (
                  <span title={c.longHeader ?? c.header}>{c.header}</span>
                )}
              </TableHead>
            );
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((s) => {
          const row = (
            <TableRow onClick={() => onSelectSlot(s.slot)} className="cursor-pointer">
              {columns.map((c) => (
                <TableCell key={c.key} className={c.align === "center" ? "text-center" : undefined}>
                  {c.cell(s)}
                </TableCell>
              ))}
            </TableRow>
          );
          return s.player ? (
            <PlayerContextMenu key={s.slot} asChild playerId={s.player.playerId} context="tactics" onNavigate={onNavigate}>
              {row}
            </PlayerContextMenu>
          ) : (
            <React.Fragment key={s.slot}>{row}</React.Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}
