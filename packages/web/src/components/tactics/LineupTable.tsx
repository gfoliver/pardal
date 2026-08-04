import { Position, rolesFor, type RoleKey } from "@fut/domain";
import type { TacticsPlayer, TacticsSlot } from "@fut/career";
import { useApp } from "../../app/AppProviders";
import { Abbrev } from "../ui/abbrev";
import { Badge } from "../ui/badge";
import { DataTable, type Column } from "../ui/data-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Overall } from "../ui/game";
import { Flag } from "../ui/flag";
import { fitColor, fitnessColor, usePosLabels } from "./pieces";
import { groupBadge } from "../../lib/labels";
import { PlayerContextMenu } from "../career/PlayerMenu";
import type { ScreenId } from "../../layout/Shell";
import { cn } from "../../lib/utils";

/**
 * The starting XI as a sortable table — same information as the pitch, laid
 * out for scanning and comparing rather than for spatial reading. Shares
 * selection with the pitch (clicking a row is the same as tapping the shirt),
 * and edits the role inline without leaving the table.
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
  const outfieldPositions = Object.values(Position).filter((p) => p !== Position.Goalkeeper);
  const columns: Column<TacticsSlot>[] = [
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

  return (
    <DataTable
      columns={columns}
      rows={[...slots]}
      getRowId={(s) => String(s.slot)}
      onRowClick={(s) => onSelectSlot(s.slot)}
      activeRowId={selectedSlot != null ? String(selectedSlot) : undefined}
      pageSize={20}
      rowWrapper={(s, rendered) =>
        s.player ? (
          <PlayerContextMenu key={s.slot} asChild playerId={s.player.playerId} context="tactics" onNavigate={onNavigate}>
            {rendered}
          </PlayerContextMenu>
        ) : (
          rendered
        )
      }
    />
  );
}
