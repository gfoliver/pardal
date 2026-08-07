import * as React from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Position, rolesFor, type RoleKey } from "@fut/domain";
import type { TacticsSlot } from "@fut/career";
import { useApp } from "../../app/AppProviders";
import { Abbrev } from "../ui/abbrev";
import { Badge } from "../ui/badge";
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
  /** Spelled out for the header's tooltip where the header itself is an abbreviation or a symbol. */
  readonly longHeader?: string;
  readonly align?: "center";
  /** Fixed px. The table is `table-fixed`, so the header cannot drift away from the body. */
  readonly width: number;
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
 * What it DOES take from the kit is the vocabulary, because "not the same component" is no reason to
 * be a different table to read: fixed column widths under a sticky header, the position and the name
 * pinned while the rest scrolls under them, the whole `<th>` as the sort target with `aria-sort` on
 * the cell itself, and the three-step ink — identity `text-fg`, data `text-fg-muted`, dashes
 * `text-fg-faint`. It used to sit on a second generic table component, `ui/data-table`, whose search,
 * facets, row actions and paging all went unused once every other screen moved to the query layer;
 * folding the forty lines it did use into here let that component go.
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
  const columns: Column[] = [
    {
      key: "pos",
      header: t.position,
      align: "center",
      width: 88,
      cell: (s) => {
        // A keeper's slot isn't a choice — only a keeper can take it, so it stays a badge.
        const isKeeperSlot = s.player?.position === Position.Goalkeeper || s.position === Position.Goalkeeper;
        if (isKeeperSlot || !s.player) {
          return <Abbrev full={posName(s.position)} asChild><Badge variant={groupBadge(s.position)}>{shortPos(s.position)}</Badge></Abbrev>;
        }
        return (
          <Select value={s.position} onValueChange={(v) => onChangePosition(s.slot, v as Position)}>
            <SelectTrigger className="h-7 w-[4.5rem] px-2 text-xs" onClick={(e) => e.stopPropagation()}>
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
      key: "name",
      header: t.player,
      width: 168,
      sortValue: (s) => (s.player ? nameOf(s.player.playerId, s.player.name) : ""),
      cell: (s) =>
        s.player ? (
          <span className={cn("block truncate font-medium text-fg", s.player.injured && "text-fg-faint line-through")}>
            {nameOf(s.player.playerId, s.player.name)}
          </span>
        ) : (
          <Dash />
        ),
    },
    {
      key: "shirt",
      header: "#",
      longHeader: t.shirtNumber,
      align: "center",
      width: 48,
      // Undefined, not 999: a player nobody has numbered has no number, and he sorts to the bottom
      // rather than pretending to a squad number he does not wear.
      sortValue: (s) => s.player?.shirtNumber ?? Number.NEGATIVE_INFINITY,
      cell: (s) => (s.player?.shirtNumber !== undefined ? <span className="tabular-nums text-fg-muted">{s.player.shirtNumber}</span> : <Dash />),
    },
    {
      key: "overall",
      header: t.overall,
      align: "center",
      width: 64,
      sortValue: (s) => s.player?.overall ?? Number.NEGATIVE_INFINITY,
      cell: (s) => (s.player ? <Overall value={s.player.overall} size="sm" /> : <Dash />),
    },
    {
      key: "fit",
      header: t.fitShort,
      longHeader: t.tacPositionalFit,
      align: "center",
      width: 56,
      sortValue: (s) => s.fit ?? Number.NEGATIVE_INFINITY,
      cell: (s) =>
        s.fit !== undefined ? (
          <span className="font-bold tabular-nums" style={{ color: fitColor(s.fit) }}>{Math.round(s.fit * 100)}</span>
        ) : (
          <Dash />
        ),
    },
    {
      key: "role",
      header: t.role,
      width: 152,
      cell: (s) =>
        s.player ? (
          <Select value={s.role} onValueChange={(v) => onChangeRole(s.player!.playerId, v as RoleKey)}>
            <SelectTrigger className="h-7 w-full text-xs" onClick={(e) => e.stopPropagation()}>
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
      // A player's OWN position and the others he is natural in. The slot's
      // position is already the first column, and the two are different questions:
      // that one is where he is being asked to play, this one is what he is.
      key: "natural",
      header: t.alsoPlays,
      align: "center",
      width: 112,
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
      key: "age",
      header: t.age,
      align: "center",
      width: 52,
      sortValue: (s) => s.player?.age ?? Number.NEGATIVE_INFINITY,
      cell: (s) => (s.player ? <span className="tabular-nums text-fg-muted">{s.player.age}</span> : <Dash />),
    },
    {
      key: "nat",
      header: t.nationalityShort,
      longHeader: t.nationality,
      align: "center",
      width: 52,
      cell: (s) => (s.player ? <Flag nationality={s.player.nationality} /> : <Dash />),
    },
  ];

  /** Where the second pinned column starts — the first one's width, exactly as the grid does it. */
  const secondLeft = columns[0]!.width;

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

  /** Desc, then asc, then back to formation order — the grid's three-state cycle. */
  const toggle = (key: string) =>
    setSort((cur) => (cur?.key !== key ? { key, dir: "desc" } : cur.dir === "desc" ? { key, dir: "asc" } : null));

  /** Pinned in both axes for the corner cells, so nothing slides out from under the header. */
  const pinned = (i: number) => (i <= 1 ? { left: i === 0 ? 0 : secondLeft } : {});

  return (
    // `border-separate` rather than collapsed: a collapsed table drops the borders of sticky cells,
    // which is what pinning the first two columns needs them for.
    <div className="relative overflow-auto rounded-lg border border-border bg-surface">
      <table className="w-full table-fixed border-separate border-spacing-0 text-sm" style={{ minWidth: "max-content" }}>
        <thead>
          <tr>
            {columns.map((c, i) => {
              const sorted = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  scope="col"
                  style={{ width: c.width, minWidth: c.width, ...pinned(i) }}
                  aria-sort={sorted ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}
                  className={cn(
                    // The z-index is deliberately tiny: it only has to beat this table's own rows. A
                    // header that competes app-wide is a header that paints over dialogs.
                    "sticky top-0 z-[2] h-8 border-b border-border bg-surface-2 px-2 align-middle",
                    "caps whitespace-nowrap text-fg-faint",
                    i <= 1 && "z-[3]",
                    c.align === "center" && "text-center",
                  )}
                >
                  {c.sortValue ? (
                    // The whole header is the target, so sorting never needs a precise tap.
                    <button
                      type="button"
                      onClick={() => toggle(c.key)}
                      title={c.longHeader ?? c.header}
                      className={cn(
                        "inline-flex w-full items-center gap-1 outline-none hover:text-fg focus-visible:text-fg",
                        c.align === "center" && "justify-center",
                        sorted && "text-fg",
                      )}
                    >
                      <span className="truncate">{c.header}</span>
                      {sorted && (sort!.dir === "asc" ? <ArrowUp className="size-3 shrink-0" /> : <ArrowDown className="size-3 shrink-0" />)}
                    </button>
                  ) : (
                    <span title={c.longHeader ?? c.header}>{c.header}</span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const row = (
              <tr onClick={() => onSelectSlot(s.slot)} className="group cursor-pointer">
                {columns.map((c, i) => (
                  <td
                    key={c.key}
                    style={{ width: c.width, minWidth: c.width, ...pinned(i) }}
                    className={cn(
                      "border-b border-hairline px-2 py-1.5 align-middle",
                      // A pinned cell carries its own background, or the columns sliding under it
                      // show through.
                      i <= 1 && "sticky z-[1] bg-surface group-hover:bg-surface-2",
                      i > 1 && "text-fg-muted group-hover:bg-surface-2",
                      c.align === "center" && "text-center",
                    )}
                  >
                    {c.cell(s)}
                  </td>
                ))}
              </tr>
            );
            return s.player ? (
              <PlayerContextMenu key={s.slot} asChild playerId={s.player.playerId} context="tactics" onNavigate={onNavigate}>
                {row}
              </PlayerContextMenu>
            ) : (
              <React.Fragment key={s.slot}>{row}</React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
