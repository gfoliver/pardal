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

/**
 * One column of the lineup table. Sortable only where `sortValue` is given — a cell holding a
 * dropdown has nothing to sort by.
 */
interface Column {
  readonly key: string;
  readonly header: string;
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
 * It used to sit on a second generic table component, `ui/data-table`, whose search, facets, row
 * actions and paging all went unused once every other screen moved to the query layer. Folding the
 * forty lines it did use into here let that component go.
 */
export function LineupTable({
  slots,
  nameOf,
  selectedSlot,
  onSelectSlot,
  onChangeRole,
  onChangePosition,
  onNavigate,
}: {
  slots: readonly TacticsSlot[];
  nameOf: (playerId: string, fallback: string) => string;
  selectedSlot: number | null;
  onSelectSlot: (slot: number) => void;
  onChangeRole: (playerId: string, roleKey: RoleKey) => void;
  onChangePosition: (slot: number, position: Position) => void;
  onNavigate?: (screen: ScreenId, param?: string) => void;
}) {
  const { t } = useApp();
  const { shortPos, posName, roleName } = usePosLabels();
  const [sort, setSort] = React.useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const outfieldPositions = Object.values(Position).filter((p) => p !== Position.Goalkeeper);
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
            <SelectTrigger className="h-7 w-[5rem] px-2 text-xs" onClick={(e) => e.stopPropagation()}>
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
      align: "center",
      sortValue: (s) => s.fit ?? -1,
      cell: (s) => (s.fit !== undefined ? <span className="font-bold tabular-nums" style={{ color: fitColor(s.fit) }}>{Math.round(s.fit * 100)}</span> : "—"),
    },
    {
      key: "name",
      header: t.player,
      sortValue: (s) => (s.player ? nameOf(s.player.playerId, s.player.name) : ""),
      cell: (s) => (s.player ? <span className={cn("font-medium text-fg", s.player.injured && "text-fg-faint line-through")}>{nameOf(s.player.playerId, s.player.name)}</span> : <span className="text-fg-faint">—</span>),
    },
    {
      // A player's OWN position and the others he is natural in. The slot's
      // position is already the first column, and the two are different questions:
      // that one is where he is being asked to play, this one is what he is.
      key: "natural",
      header: t.alsoPlays,
      align: "center",
      sortValue: (s) => s.player?.secondaryPositions.length ?? -1,
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
        ) : null,
    },
    {
      key: "role",
      header: t.role,
      cell: (s) =>
        s.player ? (
          <Select value={s.role} onValueChange={(v) => onChangeRole(s.player!.playerId, v as RoleKey)}>
            <SelectTrigger className="h-7 w-36 text-xs" onClick={(e) => e.stopPropagation()}>
              <SelectValue>{roleName(s.role)}</SelectValue>
            </SelectTrigger>
            <SelectContent className="w-auto min-w-[14rem]" onClick={(e) => e.stopPropagation()}>
              {rolesFor(s.position as Position).map((r) => <SelectItem key={r.key} value={r.key}>{roleName(r.key)}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : null,
    },
    {
      key: "overall",
      header: t.overall,
      align: "center",
      sortValue: (s) => s.player?.overall ?? 0,
      cell: (s) => (s.player ? <Overall value={s.player.overall} /> : null),
    },
    {
      key: "age",
      header: t.age,
      align: "center",
      sortValue: (s) => s.player?.age ?? 0,
      cell: (s) => s.player?.age ?? "",
    },
    {
      key: "nat",
      header: t.nationalityShort,
      align: "center",
      cell: (s) => (s.player ? <Flag nationality={s.player.nationality} /> : null),
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

  const toggle = (key: string) =>
    setSort((cur) => (cur?.key !== key ? { key, dir: "desc" } : cur.dir === "desc" ? { key, dir: "asc" } : null));

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((c) => (
            <TableHead key={c.key} className={c.align === "center" ? "text-center" : undefined}>
              {c.sortValue ? (
                <button
                  type="button"
                  onClick={() => toggle(c.key)}
                  className={cn("inline-flex items-center gap-1 outline-none hover:text-fg", c.align === "center" && "justify-center", sort?.key === c.key && "text-fg")}
                  aria-sort={sort?.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                >
                  {c.header}
                  {sort?.key === c.key && (sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                </button>
              ) : (
                c.header
              )}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((s) => {
          const row = (
            <TableRow
              data-active={selectedSlot === s.slot || undefined}
              onClick={() => onSelectSlot(s.slot)}
              className="cursor-pointer"
            >
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
